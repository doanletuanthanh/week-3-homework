import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { REVEAL_MAX_RUNS, REVEAL_STALE_MS } from "@/config/limits";
import type { RevealJson, RevealParts } from "@/engine/reveal-types";
import type { HookEntry, UnlockedItem, Verdict } from "@/engine/types";
import type { Database, Executor } from "../client";
import { branches, scenarios, sessions, snapshots, turns } from "../schema";
import type { SessionRow } from "./sessions";

/** An ended session with everything its reveal is computed from. Not filtered by learner: callers check ownership. */
export async function loadMainBranch(db: Executor, sessionId: string) {
  const [found] = await db
    .select({ session: sessions, scenario: scenarios, branchId: branches.id })
    .from(sessions)
    .innerJoin(scenarios, eq(scenarios.id, sessions.scenarioId))
    .innerJoin(branches, and(eq(branches.sessionId, sessions.id), eq(branches.kind, "main")))
    .where(eq(sessions.id, sessionId));
  if (!found) return null;
  const turnRows = await db.select().from(turns).where(eq(turns.branchId, found.branchId)).orderBy(asc(turns.index));
  const last = turnRows.at(-1);
  if (!last) throw new Error(`session ${sessionId} has no opening turn`);
  const [snapshot] = await db.select().from(snapshots).where(and(eq(snapshots.branchId, found.branchId), eq(snapshots.index, last.index)));
  if (!snapshot) throw new Error(`session ${sessionId} has no snapshot ${last.index}`);
  return { ...found, turns: turnRows, snapshot };
}

export type RevealClaimed = {
  token: string;
  /** Every allowed runner has died: this one makes no call and writes the degraded result. */
  exhausted: boolean;
};

/**
 * Makes one runner the owner of a session's reveal, in a single conditional update, so of any
 * number of runners started together exactly one proceeds. A reveal can be claimed when the
 * session has ended with frozen notes, has no result yet, and nobody holds it or the holder's
 * heartbeat went stale. Each claim uses up one of the allowed runs; when none is left, a last
 * claim is given out only to write the degraded result.
 */
export async function claimRevealRun(db: Executor, sessionId: string, staleMs: number = REVEAL_STALE_MS): Promise<RevealClaimed | null> {
  const token = randomUUID();
  const unfinished = and(
    eq(sessions.id, sessionId),
    isNotNull(sessions.canvasFrozenAt),
    isNull(sessions.revealReadyAt),
    inArray(sessions.status, [...REVEALABLE]),
  );
  // Both sides come from the database clock.
  const free = or(isNull(sessions.revealRunToken), sql`${sessions.revealHeartbeatAt} < now() - make_interval(secs => ${staleMs / 1000})`);

  const [run] = await db
    .update(sessions)
    .set({ revealRunToken: token, revealRunAttempt: sql`${sessions.revealRunAttempt} + 1`, revealHeartbeatAt: sql`now()` })
    .where(and(unfinished, free, lt(sessions.revealRunAttempt, REVEAL_MAX_RUNS)))
    .returning({ id: sessions.id });
  if (run) return { token, exhausted: false };

  const [last] = await db
    .update(sessions)
    .set({ revealRunToken: token, revealHeartbeatAt: sql`now()` })
    .where(and(unfinished, free, gte(sessions.revealRunAttempt, REVEAL_MAX_RUNS)))
    .returning({ id: sessions.id });
  return last ? { token, exhausted: true } : null;
}

/** A reveal is computed only for a session that ended and was not withdrawn since. */
const REVEALABLE = ["interviewing", "revealed"] as const;
const mayWrite = (session: SessionRow, token: string) =>
  session.revealRunToken === token && session.revealReadyAt === null && (REVEALABLE as readonly string[]).includes(session.status);

const owned = (sessionId: string, token: string) => and(eq(sessions.id, sessionId), eq(sessions.revealRunToken, token), isNull(sessions.revealReadyAt));

/** Refreshes the heartbeat. False when the reveal is no longer this runner's: it must stop. */
export async function touchRevealRun(db: Executor, sessionId: string, token: string): Promise<boolean> {
  const rows = await db.update(sessions).set({ revealHeartbeatAt: sql`now()` }).where(owned(sessionId, token)).returning({ id: sessions.id });
  return rows.length > 0;
}

/** The end judge's verdict about the last persona turn, as it is written to that turn and its snapshot. */
export type LastTurnVerdict = { branchId: string; index: number; verdict: Verdict; ledger: HookEntry[]; disclosed: UnlockedItem[] };

/**
 * Stores the processed output of one reveal call, and with the judge's the verdict it gave the
 * last persona turn, under the session row lock and only while the reveal is still this runner's
 * and has no result, and the session was not withdrawn. False when nothing was written.
 */
export async function saveRevealPart(
  db: Database,
  write: { sessionId: string; token: string; parts: RevealParts; lastTurn?: LastTurnVerdict },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, write.sessionId)).for("update");
    if (!session || !mayWrite(session, write.token)) return false;

    await tx
      .update(sessions)
      .set({ revealParts: { ...session.revealParts, ...write.parts }, revealHeartbeatAt: sql`now()` })
      .where(eq(sessions.id, session.id));
    const { lastTurn } = write;
    if (lastTurn) {
      const at = and(eq(turns.branchId, lastTurn.branchId), eq(turns.index, lastTurn.index));
      await tx.update(turns).set({ verdictJson: lastTurn.verdict, flagged: lastTurn.verdict.violations.length > 0 }).where(at);
      await tx
        .update(snapshots)
        .set({ ledger: lastTurn.ledger, disclosed: lastTurn.disclosed })
        .where(and(eq(snapshots.branchId, lastTurn.branchId), eq(snapshots.index, lastTurn.index)));
    }
    return true;
  });
}

/**
 * Writes the frozen reveal, once: under the session row lock, only while the reveal is this
 * runner's, has no result, and the session was not withdrawn. `inTransaction` gets the session as it is after the write. False
 * when nothing was written; after a true, no runner can write this reveal again.
 */
export async function finaliseReveal(
  db: Database,
  write: { sessionId: string; token: string; reveal: RevealJson },
  inTransaction?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, write.sessionId)).for("update");
    if (!session || !mayWrite(session, write.token)) return false;
    const [after] = await tx
      .update(sessions)
      .set({ revealJson: write.reveal, revealReadyAt: sql`now()`, revealRunToken: null, updatedAt: sql`now()` })
      .where(eq(sessions.id, session.id))
      .returning();
    await inTransaction?.(tx, after);
    return true;
  });
}

export type GuessOutcome = "stored" | "already_stored" | "not_found" | "not_ended" | "out_of_range";

/**
 * Stores the learner's guess and moves the session to `revealed`, under the session row lock.
 * The session must have ended with frozen notes. A session that already has a guess keeps it.
 * `inTransaction` gets the session as it is after the write, only when this call stored the guess.
 */
export async function storeGuess(
  db: Database,
  input: { userId: string; sessionId: string; guess: number },
  inTransaction?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<GuessOutcome> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
      .for("update");
    if (!session) return "not_found";
    if (session.guess !== null) return "already_stored";
    if (session.status !== "interviewing" || session.canvasFrozenAt === null) return "not_ended";

    const [scenario] = await tx.select({ content: scenarios.content }).from(scenarios).where(eq(scenarios.id, session.scenarioId!));
    if (input.guess > scenario.content.items.length) return "out_of_range";

    const [after] = await tx
      .update(sessions)
      .set({ guess: input.guess, revealedAt: sql`now()`, status: "revealed", updatedAt: sql`now()` })
      .where(eq(sessions.id, session.id))
      .returning();
    await inTransaction?.(tx, after);
    return "stored";
  });
}
