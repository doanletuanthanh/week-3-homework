import { and, asc, eq, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { TURN_CLAIM_TTL_MS } from "@/config/limits";
import { REPLAY_TURNS, type ReplayResult } from "@/engine/replay-result";
import type { Database, Executor } from "../client";
import { branches, scenarios, sessions, snapshots, turns, type TurnClaim } from "../schema";
import type { SessionRow, TurnRow } from "./sessions";

export type BranchRow = typeof branches.$inferSelect;
type TurnInsert = typeof turns.$inferInsert;
type SnapshotInsert = typeof snapshots.$inferInsert;

const replayOf = (sessionId: string) => and(eq(branches.sessionId, sessionId), eq(branches.kind, "replay"));

async function lockOwnSession(tx: Executor, input: { userId: string; sessionId: string }): Promise<SessionRow | undefined> {
  const [session] = await tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
    .for("update");
  return session;
}

const claimIsLive = (session: SessionRow, now: Date) =>
  session.turnClaim !== null && now.getTime() - Date.parse(session.turnClaim.at) < TURN_CLAIM_TTL_MS;

/** The replay moment a session's stored reveal offers; null when it offers none, or is not ready. */
function offeredMoment(session: SessionRow) {
  const replay = session.revealReadyAt === null ? undefined : session.revealJson?.replay;
  if (!replay || replay.level === "none") return null;
  return {
    forkAfterTurn: replay.forkAfterTurn,
    targetItemId: replay.level === "primary" ? replay.targetItemId : null,
    fallbackLevel: replay.level,
  };
}

/** A session's replay with its own turns, and every item open at the end of either branch. Null when there is none. */
export async function loadReplay(db: Executor, sessionId: string) {
  const [branch] = await db.select().from(branches).where(replayOf(sessionId));
  if (!branch) return null;
  const [turnRows, snapshotRows] = await Promise.all([
    db.select().from(turns).where(eq(turns.branchId, branch.id)).orderBy(asc(turns.index)),
    db.select({ unlocked: snapshots.unlocked }).from(snapshots).where(eq(snapshots.sessionId, sessionId)),
  ]);
  // What is open only grows along a branch, so every snapshot together is the two last ones together.
  const openItemIds = [...new Set(snapshotRows.flatMap((row) => row.unlocked.map((entry) => entry.itemId)))];
  return { branch, turns: turnRows, openItemIds };
}

export type LoadedReplay = NonNullable<Awaited<ReturnType<typeof loadReplay>>>;

export type StartReplayOutcome = "started" | "already_started" | "not_found" | "not_offered";

/**
 * "Quay lại lượt N": creates the session's one replay branch at the moment its reveal chose, with
 * a copy of the main snapshot at the fork, and moves the session to `replaying`, in one
 * transaction under the session row lock. Of two requests sent together one creates the branch
 * and the other finds it. `inTransaction` runs only when this call created it.
 */
export async function startReplayBranch(
  db: Database,
  input: { userId: string; sessionId: string },
  inTransaction?: (tx: Executor, session: SessionRow, branch: BranchRow) => Promise<void>,
): Promise<StartReplayOutcome> {
  return db.transaction(async (tx) => {
    const session = await lockOwnSession(tx, input);
    if (!session) return "not_found";
    if (session.status === "replaying") return "already_started";
    const moment = session.status === "revealed" ? offeredMoment(session) : null;
    if (!moment) return "not_offered";

    const [fork] = await tx
      .select({ snapshot: snapshots })
      .from(snapshots)
      .innerJoin(branches, eq(branches.id, snapshots.branchId))
      .where(and(eq(branches.sessionId, session.id), eq(branches.kind, "main"), eq(snapshots.index, moment.forkAfterTurn)));
    if (!fork) throw new Error(`session ${session.id} has no snapshot ${moment.forkAfterTurn} to replay from`);

    const [branch] = await tx
      .insert(branches)
      .values({ sessionId: session.id, kind: "replay", ...moment })
      .returning();
    // The replay starts from a copy: the main snapshot is never written again.
    const { unlocked, ledger, disclosed, openness } = fork.snapshot;
    await tx.insert(snapshots).values({ sessionId: session.id, branchId: branch.id, index: moment.forkAfterTurn, unlocked, ledger, disclosed, openness });
    await tx.update(sessions).set({ status: "replaying", updatedAt: sql`now()` }).where(eq(sessions.id, session.id));
    await inTransaction?.(tx, session, branch);
    return "started";
  });
}

export type SkipReplayOutcome = "skipped" | "already_ended" | "not_found" | "not_offered";

/**
 * "Bỏ qua, cho tôi xem luôn": records the offered replay as skipped, with no turns, and moves the
 * session to `done`. A session that is already `done` is left as it is.
 */
export async function skipReplayBranch(
  db: Database,
  input: { userId: string; sessionId: string },
  inTransaction?: (tx: Executor, session: SessionRow, branch: BranchRow) => Promise<void>,
): Promise<SkipReplayOutcome> {
  return db.transaction(async (tx) => {
    const session = await lockOwnSession(tx, input);
    if (!session) return "not_found";
    if (session.status === "done") return "already_ended";
    const moment = session.status === "revealed" ? offeredMoment(session) : null;
    if (!moment) return "not_offered";

    const [branch] = await tx
      .insert(branches)
      .values({ sessionId: session.id, kind: "replay", ...moment, result: "skipped" })
      .returning();
    await tx.update(sessions).set({ status: "done", updatedAt: sql`now()` }).where(eq(sessions.id, session.id));
    await inTransaction?.(tx, session, branch);
    return "skipped";
  });
}

export type StopReplayOutcome = "stopped" | "already_ended" | "not_found" | "not_replaying" | "in_flight";

/**
 * "Dừng": ends a running replay as stopped and moves the session to `done`. Refused while a
 * replay turn is being answered, so that turn is written before the end or not at all.
 */
export async function stopReplayBranch(
  db: Database,
  input: { userId: string; sessionId: string; now?: Date },
  inTransaction?: (tx: Executor, session: SessionRow, branch: BranchRow, turnCount: number) => Promise<void>,
): Promise<StopReplayOutcome> {
  return db.transaction(async (tx) => {
    const session = await lockOwnSession(tx, input);
    if (!session) return "not_found";
    if (session.status === "done") return "already_ended";
    if (session.status !== "replaying") return "not_replaying";
    if (claimIsLive(session, input.now ?? new Date())) return "in_flight";

    const [branch] = await tx.update(branches).set({ result: "stopped" }).where(replayOf(session.id)).returning();
    if (!branch) throw new Error(`session ${session.id} is replaying without a replay branch`);
    await tx.update(sessions).set({ status: "done", turnClaim: null, updatedAt: sql`now()` }).where(eq(sessions.id, session.id));
    const played = await tx.select({ index: turns.index }).from(turns).where(eq(turns.branchId, branch.id));
    await inTransaction?.(tx, session, branch, played.length);
    return "stopped";
  });
}

export type ReplayClaimRefusal = "not_found" | "replay_ended" | "in_flight" | "wrong_index" | "key_used";

export type ReplayTurnClaimed = {
  token: string;
  branch: BranchRow;
  mainBranchId: string;
  /** 1 to 3. */
  replayTurn: number;
  /** The turn's index on the branch: the fork plus `replayTurn`. */
  turnIndex: number;
  isDemo: boolean;
  scenario: typeof scenarios.$inferSelect;
};

/**
 * Reserves the next replay turn for one request, under the session row lock and before any model
 * is called: the same claim a main turn takes, so one question at a time is answered.
 * `expectedIndex` is the replay turn the browser believes comes next. A `turnKey` that a turn of
 * the session already carries is refused here: the turn could not be written, so no model is
 * called for it.
 */
export async function claimReplayTurn(
  db: Database,
  input: { userId: string; sessionId: string; expectedIndex: number; turnKey: string; now?: Date },
): Promise<{ ok: true; claim: ReplayTurnClaimed } | { ok: false; reason: ReplayClaimRefusal }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const session = await lockOwnSession(tx, input);
    if (!session) return { ok: false, reason: "not_found" };
    if (session.status !== "replaying") return { ok: false, reason: "replay_ended" };
    if (claimIsLive(session, now)) return { ok: false, reason: "in_flight" };

    const branchRows = await tx.select().from(branches).where(eq(branches.sessionId, session.id));
    const branch = branchRows.find((row) => row.kind === "replay");
    const main = branchRows.find((row) => row.kind === "main");
    if (!branch || !main || branch.forkAfterTurn === null) throw new Error(`session ${session.id} is replaying without a replay branch`);
    if (branch.result !== null) return { ok: false, reason: "replay_ended" };

    const played = await tx.select({ index: turns.index }).from(turns).where(eq(turns.branchId, branch.id));
    const replayTurn = played.length + 1;
    if (replayTurn > REPLAY_TURNS) return { ok: false, reason: "replay_ended" };
    if (input.expectedIndex !== replayTurn) return { ok: false, reason: "wrong_index" };
    const [used] = await tx.select({ index: turns.index }).from(turns).where(and(eq(turns.sessionId, session.id), eq(turns.turnKey, input.turnKey))).limit(1);
    if (used) return { ok: false, reason: "key_used" };

    const [scenario] = await tx.select().from(scenarios).where(eq(scenarios.id, session.scenarioId));
    const claim: TurnClaim = { token: randomUUID(), at: now.toISOString() };
    await tx.update(sessions).set({ turnClaim: claim }).where(eq(sessions.id, session.id));
    return {
      ok: true,
      claim: { token: claim.token, branch, mainBranchId: main.id, replayTurn, turnIndex: branch.forkAfterTurn + replayTurn, isDemo: session.isDemo, scenario },
    };
  });
}

/**
 * What a replay turn starts from: the main turns up to the fork, the replay turns played so far,
 * and the branch's own snapshot of the turn before. Nothing after the fork on the main branch is read.
 */
export async function loadReplayBasis(db: Executor, claim: Pick<ReplayTurnClaimed, "branch" | "mainBranchId" | "turnIndex">) {
  const { branch, mainBranchId, turnIndex } = claim;
  const [shared, replayTurns, [snapshot]] = await Promise.all([
    db.select().from(turns).where(and(eq(turns.branchId, mainBranchId), lte(turns.index, branch.forkAfterTurn!))).orderBy(asc(turns.index)),
    db.select().from(turns).where(eq(turns.branchId, branch.id)).orderBy(asc(turns.index)),
    db.select().from(snapshots).where(and(eq(snapshots.branchId, branch.id), eq(snapshots.index, turnIndex - 1))),
  ]);
  if (!snapshot) throw new Error(`replay branch ${branch.id} has no snapshot ${turnIndex - 1}`);
  return { shared, replayTurns, snapshot };
}

export type ReplayTurnWrite = {
  sessionId: string;
  token: string;
  branchId: string;
  turn: TurnInsert;
  snapshot: SnapshotInsert;
  /** Set when this turn ends the replay. */
  result: ReplayResult | null;
};

export type ReplayCommitOutcome = "committed" | "replay_ended" | "claim_lost";

/**
 * Writes one finished replay turn, whole or not at all: the turn with the judge's verdict about
 * it, the snapshot, and, when the turn ends the replay, the result and the session's move to
 * `done`. Only rows of the replay branch and the session's status are written; nothing of the
 * main branch is touched.
 */
export async function commitReplayTurn(
  db: Database,
  write: ReplayTurnWrite,
  inTransaction?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<ReplayCommitOutcome> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, write.sessionId)).for("update");
    if (!session || session.turnClaim?.token !== write.token) return "claim_lost";
    const [branch] = await tx.select().from(branches).where(eq(branches.id, write.branchId));
    if (session.status !== "replaying" || !branch || branch.result !== null) {
      await tx.update(sessions).set({ turnClaim: null }).where(eq(sessions.id, session.id));
      return "replay_ended";
    }

    await tx.insert(turns).values(write.turn);
    await tx.insert(snapshots).values(write.snapshot);
    if (write.result !== null) await tx.update(branches).set({ result: write.result }).where(eq(branches.id, branch.id));
    await inTransaction?.(tx, session);
    await tx
      .update(sessions)
      .set({ turnClaim: null, updatedAt: sql`now()`, ...(write.result !== null ? { status: "done" as const } : {}) })
      .where(eq(sessions.id, session.id));
    return "committed";
  });
}

/** The replay turn already stored for a question the browser is sending again. */
export async function findReplayTurnByKey(db: Executor, userId: string, sessionId: string, turnKey: string): Promise<TurnRow | null> {
  const [row] = await db
    .select({ turn: turns })
    .from(turns)
    .innerJoin(sessions, eq(sessions.id, turns.sessionId))
    .innerJoin(branches, eq(branches.id, turns.branchId))
    .where(and(eq(turns.sessionId, sessionId), eq(sessions.userId, userId), eq(turns.turnKey, turnKey), eq(branches.kind, "replay")))
    .limit(1);
  return row?.turn ?? null;
}
