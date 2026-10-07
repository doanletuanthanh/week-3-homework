import { and, eq, isNull, sql } from "drizzle-orm";
import { TURN_CLAIM_TTL_MS } from "@/config/limits";
import { tokenize } from "@/engine/tokens";
import type { Database, Executor } from "../client";
import { sessions } from "../schema";
import type { SessionRow } from "./sessions";

export type SaveCanvasOutcome = "saved" | "not_found" | "frozen";

/**
 * Autosave of the notes. One statement, so it cannot land after the freeze: a session whose notes
 * are frozen, or that is no longer being interviewed, is not written.
 */
export async function saveCanvasText(db: Executor, input: { userId: string; sessionId: string; text: string }): Promise<SaveCanvasOutcome> {
  const owned = and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId));
  const saved = await db
    .update(sessions)
    .set({ canvasText: input.text })
    .where(and(owned, eq(sessions.status, "interviewing"), isNull(sessions.canvasFrozenAt)))
    .returning({ id: sessions.id });
  if (saved.length > 0) return "saved";
  const [session] = await db.select({ id: sessions.id }).from(sessions).where(owned);
  return session ? "frozen" : "not_found";
}

/** Ends the session if it has not ended, and makes `text` the notes for good. */
async function freeze(tx: Executor, session: SessionRow, text: string): Promise<void> {
  await tx
    .update(sessions)
    .set({
      endedAt: session.endedAt ?? sql`now()`,
      canvasText: text,
      canvasTokens: tokenize(text),
      canvasFrozenAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(sessions.id, session.id));
}

/** `already_frozen`: the session had ended with its notes before this request; nothing changed. */
export type EndOutcome = "ended" | "already_frozen" | "not_found" | "not_interviewing" | "in_flight";

/**
 * "Kết thúc buổi": ends the session and freezes the notes as sent, in one transaction under the
 * session row lock, the lock a turn commit takes. So a turn is either written before the end or
 * discarded by it, and no autosave can change the notes afterwards. Refused while a turn is being
 * answered. `afterFreeze` runs inside the transaction, only when this call did the freeze.
 */
export async function endAndFreeze(
  db: Database,
  input: { userId: string; sessionId: string; canvasText: string; now?: Date },
  afterFreeze?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<EndOutcome> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
      .for("update");
    if (!session) return "not_found";
    if (session.canvasFrozenAt !== null) return "already_frozen";
    if (session.status !== "interviewing") return "not_interviewing";
    // After turn 30 the session has ended and no turn can be running, whatever an old claim says.
    const claimIsLive = session.turnClaim !== null && now.getTime() - Date.parse(session.turnClaim.at) < TURN_CLAIM_TTL_MS;
    if (session.endedAt === null && claimIsLive) return "in_flight";

    await freeze(tx, session, input.canvasText);
    await afterFreeze?.(tx, session);
    return "ended";
  });
}

/**
 * Freezes the last autosaved notes of a session that ended (turn 30) at least `graceMs` ago but
 * whose browser never sent the final notes. Returns whether this call did the freeze.
 */
export async function freezeEndedCanvas(
  db: Database,
  input: { sessionId: string; graceMs: number },
  afterFreeze?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // `ended_at` was written with the database clock, so its age is measured with the same clock.
    const [row] = await tx
      .select({ session: sessions, endedMsAgo: sql<number>`(extract(epoch from now() - ${sessions.endedAt}) * 1000)::float8` })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .for("update");
    const session = row?.session;
    if (!session || session.endedAt === null || session.canvasFrozenAt !== null || session.status !== "interviewing") return false;
    if (row.endedMsAgo < input.graceMs) return false;

    await freeze(tx, session, session.canvasText);
    await afterFreeze?.(tx, session);
    return true;
  });
}
