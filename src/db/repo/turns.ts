import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { MAX_TURNS, TURN_CLAIM_TTL_MS } from "@/config/limits";
import type { Database, Executor } from "../client";
import { adminAccessLog, branches, scenarios, sessions, snapshots, turns, type DeviceClass, type TurnClaim } from "../schema";

type TurnInsert = typeof turns.$inferInsert;
type SnapshotInsert = typeof snapshots.$inferInsert;

/** The reply already stored for a question the browser is sending again. */
export async function findTurnByKey(db: Executor, userId: string, sessionId: string, turnKey: string) {
  const [row] = await db
    .select({ personaText: turns.personaText, index: turns.index })
    .from(turns)
    .innerJoin(sessions, eq(sessions.id, turns.sessionId))
    .where(and(eq(turns.sessionId, sessionId), eq(sessions.userId, userId), eq(turns.turnKey, turnKey)))
    .limit(1);
  return row ?? null;
}

export type ClaimRefusal = "not_found" | "session_ended" | "turn_limit" | "in_flight" | "wrong_index";

export type TurnClaimed = {
  token: string;
  branchId: string;
  turnIndex: number;
  isDemo: boolean;
  scenario: typeof scenarios.$inferSelect;
};

/**
 * Reserves the next turn of a session for one request, under the session row lock, before any
 * model is called. Refused when the session is not the learner's, is no longer being
 * interviewed, another request holds a fresh claim, or the browser is not at the next index.
 * A claim older than its time to live belongs to a request that died and is taken over.
 * The first claim that names a device class stores it on the session.
 */
export async function claimTurn(
  db: Database,
  input: { userId: string; sessionId: string; expectedIndex: number; deviceClass?: DeviceClass; now?: Date },
): Promise<{ ok: true; claim: TurnClaimed } | { ok: false; reason: ClaimRefusal }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
      .for("update");
    if (!session) return { ok: false, reason: "not_found" };
    if (session.status !== "interviewing" || session.endedAt !== null) return { ok: false, reason: "session_ended" };
    if (session.turnClaim && now.getTime() - Date.parse(session.turnClaim.at) < TURN_CLAIM_TTL_MS) {
      return { ok: false, reason: "in_flight" };
    }

    const [last] = await tx
      .select({ branchId: branches.id, index: turns.index })
      .from(branches)
      .innerJoin(turns, eq(turns.branchId, branches.id))
      .where(and(eq(branches.sessionId, session.id), eq(branches.kind, "main")))
      .orderBy(desc(turns.index))
      .limit(1);
    if (!last) throw new Error(`session ${session.id} has no opening turn`);
    const turnIndex = last.index + 1;
    if (turnIndex > MAX_TURNS) return { ok: false, reason: "turn_limit" };
    if (input.expectedIndex !== turnIndex) return { ok: false, reason: "wrong_index" };

    const [scenario] = await tx.select().from(scenarios).where(eq(scenarios.id, session.scenarioId));
    const claim: TurnClaim = { token: randomUUID(), at: now.toISOString() };
    const deviceClass = session.deviceClass ?? input.deviceClass ?? null;
    await tx.update(sessions).set({ turnClaim: claim, deviceClass }).where(eq(sessions.id, session.id));
    return { ok: true, claim: { token: claim.token, branchId: last.branchId, turnIndex, isDemo: session.isDemo, scenario } };
  });
}

/** Gives the session back after a failed turn. Does nothing when the claim is no longer ours. */
export async function releaseClaim(db: Executor, sessionId: string, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ turnClaim: null })
    .where(and(eq(sessions.id, sessionId), sql`${sessions.turnClaim}->>'token' = ${token}`));
}

/** Turns 0 to `upTo` of a branch with the snapshot of the last one. */
export async function loadBranch(db: Executor, branchId: string, upTo: number) {
  const [turnRows, [snapshot]] = await Promise.all([
    db.select().from(turns).where(and(eq(turns.branchId, branchId), lte(turns.index, upTo))).orderBy(asc(turns.index)),
    db.select().from(snapshots).where(and(eq(snapshots.branchId, branchId), eq(snapshots.index, upTo))),
  ]);
  if (!snapshot) throw new Error(`branch ${branchId} has no snapshot ${upTo}`);
  return { turns: turnRows, snapshot };
}

export type TurnWrite = {
  sessionId: string;
  token: string;
  turn: TurnInsert;
  snapshot: SnapshotInsert;
  /** The verdict part of turn t-1 and of snapshot t-1: the one change allowed to stored turns. */
  previous: Pick<TurnInsert, "verdictJson" | "flagged"> & Pick<SnapshotInsert, "ledger" | "disclosed">;
  /** True for the last allowed turn: the session ends in the same transaction. */
  endsSession: boolean;
};

export type CommitOutcome = "committed" | "session_ended" | "claim_lost";

/**
 * Writes one finished turn, whole or not at all: the turn, the verdict it carries for the turn
 * before, the snapshot, and whatever `inTransaction` adds. It runs under the session row lock and
 * only while the claim is still ours and the session is still being interviewed; otherwise the
 * result is discarded and nothing is written.
 */
export async function commitTurn(
  db: Database,
  write: TurnWrite,
  inTransaction?: (tx: Executor) => Promise<void>,
): Promise<CommitOutcome> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, write.sessionId)).for("update");
    if (!session || session.turnClaim?.token !== write.token) return "claim_lost";
    if (session.status !== "interviewing" || session.endedAt !== null) {
      await tx.update(sessions).set({ turnClaim: null }).where(eq(sessions.id, session.id));
      return "session_ended";
    }

    const { branchId, index } = write.turn;
    await tx.insert(turns).values(write.turn);
    // Turn 0 is the authored opening line: it gets no verdict.
    if (index > 1) {
      await tx
        .update(turns)
        .set({ verdictJson: write.previous.verdictJson, flagged: write.previous.flagged })
        .where(and(eq(turns.branchId, branchId), eq(turns.index, index - 1)));
      await tx
        .update(snapshots)
        .set({ ledger: write.previous.ledger, disclosed: write.previous.disclosed })
        .where(and(eq(snapshots.branchId, branchId), eq(snapshots.index, index - 1)));
    }
    await tx.insert(snapshots).values(write.snapshot);
    await inTransaction?.(tx);
    await tx
      .update(sessions)
      .set({ turnClaim: null, updatedAt: sql`now()`, ...(write.endsSession ? { endedAt: sql`now()` } : {}) })
      .where(eq(sessions.id, session.id));
    return "committed";
  });
}

/**
 * A whole session for the operator: every main-branch turn with its snapshot. Not filtered by
 * learner, so every caller must record the access with `logAdminAccess`.
 */
export async function loadSessionTrace(db: Executor, sessionId: string) {
  const [found] = await db
    .select({ session: sessions, scenario: scenarios })
    .from(sessions)
    .innerJoin(scenarios, eq(scenarios.id, sessions.scenarioId))
    .where(eq(sessions.id, sessionId));
  if (!found) return null;
  const rows = await db
    .select({ turn: turns, snapshot: snapshots })
    .from(turns)
    .innerJoin(branches, eq(branches.id, turns.branchId))
    .innerJoin(snapshots, and(eq(snapshots.branchId, turns.branchId), eq(snapshots.index, turns.index)))
    .where(and(eq(turns.sessionId, sessionId), eq(branches.kind, "main")))
    .orderBy(asc(turns.index));
  return { ...found, turns: rows };
}

export async function logAdminAccess(db: Executor, entry: typeof adminAccessLog.$inferInsert): Promise<void> {
  await db.insert(adminAccessLog).values(entry);
}
