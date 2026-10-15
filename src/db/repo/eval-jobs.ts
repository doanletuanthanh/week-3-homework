import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { EVAL_JOB_MAX_RUNS, EVAL_JOB_STALE_MS } from "@/config/limits";
import type { Executor } from "../client";
import { evalRuns, type EvalFailureReason } from "../schema";
import type { EvalRunRow } from "./eval";

const LIVE = ["queued", "running"] as const;

const isLean = and(eq(evalRuns.profile, "lean"), inArray(evalRuns.status, [...LIVE]));

/** Nobody holds the run, or its holder stopped sending heartbeats. */
const unowned = (staleMs: number) =>
  sql`(${evalRuns.runToken} IS NULL OR ${evalRuns.heartbeatAt} IS NULL OR ${evalRuns.heartbeatAt} < now() - make_interval(secs => ${staleMs / 1000}))`;

const owned = (runId: string, token: string) => and(eq(evalRuns.id, runId), eq(evalRuns.runToken, token), eq(evalRuns.status, "running"));

/** The lean run of a version that is queued or running, if there is one. */
export async function liveLeanRun(db: Executor, scenarioId: string): Promise<EvalRunRow | null> {
  const [row] = await db.select().from(evalRuns).where(and(eq(evalRuns.scenarioId, scenarioId), isLean)).limit(1);
  return row ?? null;
}

/**
 * Queues a lean run of one version, with its cap as the estimate. Null when another lean run of
 * the version is live: one at a time, enforced by a unique index.
 */
export async function queueLeanRun(
  db: Executor,
  input: { scenarioId: string; version: number; capUsd: number; requestedBy: string | null },
): Promise<EvalRunRow | null> {
  const [row] = await db
    .insert(evalRuns)
    .values({ scenarioId: input.scenarioId, version: input.version, profile: "lean", status: "queued", turns: 0, costEstimateUsd: input.capUsd, requestedBy: input.requestedBy })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** What earlier runners of the run spent: the sum of its `llm_call` rows, failed tries included. */
export async function spentOn(db: Executor, runId: string): Promise<number> {
  const [row] = await db.execute<{ usd: number }>(
    sql`SELECT COALESCE(sum(cost_usd), 0)::float8 AS usd FROM llm_call WHERE attempt_id = ${runId} AND scope = 'eval'`,
  );
  return row.usd;
}

/**
 * Takes a queued run, or one whose runner died, for this runner. Null when it has a live runner,
 * is over, or has had all its runners.
 */
export async function claimEvalRun(
  db: Executor,
  runId: string,
  staleMs: number = EVAL_JOB_STALE_MS,
): Promise<{ run: EvalRunRow; token: string; spentUsd: number } | null> {
  const token = randomUUID();
  const [run] = await db
    .update(evalRuns)
    .set({ status: "running", runToken: token, runAttempt: sql`${evalRuns.runAttempt} + 1`, heartbeatAt: sql`now()` })
    .where(and(eq(evalRuns.id, runId), isLean, unowned(staleMs), sql`${evalRuns.runAttempt} < ${EVAL_JOB_MAX_RUNS}`))
    .returning();
  if (!run) return null;
  return { run, token, spentUsd: await spentOn(db, runId) };
}

/** True when a runner should be started for the run: it is live, unowned, and has runners left. */
export function evalRunIsDue(run: EvalRunRow, now: Date = new Date(), staleMs: number = EVAL_JOB_STALE_MS): boolean {
  if (run.profile !== "lean" || !(LIVE as readonly string[]).includes(run.status) || run.runAttempt >= EVAL_JOB_MAX_RUNS) return false;
  return run.runToken === null || run.heartbeatAt === null || now.getTime() - run.heartbeatAt.getTime() > staleMs;
}

/** Refreshes the heartbeat. False when the run is no longer this runner's: it must stop. */
export async function touchEvalRun(db: Executor, runId: string, token: string): Promise<boolean> {
  const rows = await db.update(evalRuns).set({ heartbeatAt: sql`now()` }).where(owned(runId, token)).returning({ id: evalRuns.id });
  return rows.length > 0;
}

/** Gives the run back, unfinished, so the next runner can claim it at once. */
export async function releaseEvalRun(db: Executor, runId: string, token: string): Promise<void> {
  await db.update(evalRuns).set({ runToken: null }).where(owned(runId, token));
}

/** Ends the run as failed, with what all its runners spent. False when it is no longer this runner's. */
export async function failEvalRun(db: Executor, runId: string, token: string, reason: EvalFailureReason): Promise<boolean> {
  const rows = await db
    .update(evalRuns)
    .set({ status: "failed", failureReason: reason, runToken: null, finishedAt: new Date(), costActualUsd: await spentOn(db, runId) })
    .where(owned(runId, token))
    .returning({ id: evalRuns.id });
  return rows.length > 0;
}

/** Closes the live lean runs of a version that lost their runner and have no runner left. */
export async function sweepLostEvalRuns(db: Executor, scenarioId: string, staleMs: number = EVAL_JOB_STALE_MS): Promise<number> {
  const rows = await db
    .update(evalRuns)
    .set({ status: "failed", failureReason: "lost", runToken: null, finishedAt: new Date() })
    .where(and(eq(evalRuns.scenarioId, scenarioId), isLean, unowned(staleMs), sql`${evalRuns.runAttempt} >= ${EVAL_JOB_MAX_RUNS}`))
    .returning({ id: evalRuns.id });
  return rows.length;
}
