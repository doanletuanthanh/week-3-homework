import { eq } from "drizzle-orm";
import { GENERATION_RUN_LIMIT_MS, EVAL_JOB_HEARTBEAT_MS } from "@/config/limits";
import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { finishQaRun } from "@/db/repo/eval";
import { claimEvalRun, evalRunIsDue, failEvalRun, liveLeanRun, queueLeanRun, releaseEvalRun, spentOn, sweepLostEvalRuns, touchEvalRun } from "@/db/repo/eval-jobs";
import { dbToolCache, type ToolCache } from "@/db/repo/eval-tool-cache";
import { scenarios, type EvalFailureReason } from "@/db/schema";
import { IsolationError } from "@/eval/isolation";
import type { QaReport } from "@/eval/qa/types";
import { Budget, BudgetExceededError, runQaAgent } from "@/graphs/qa-agent-graph";
import type { CallModelDeps } from "@/llm/call-model";
import { spendToday } from "./cost-cap";

/** Probes a web run plays at once: more only meets rate limits. */
const WEB_CONCURRENCY = 4;

/** `running`: another lean run of the version is under way. `over_budget`: today's eval budget cannot hold one more run's cap. */
export type StartLeanEvalResult = { ok: true; runId: string; resumed: boolean } | { ok: false; reason: "not_found" | "running" | "over_budget" };

/**
 * Queues a lean evaluation of one scenario version, asked for by an admin (null from the CLI).
 * The caller starts `runEvalJob` on the returned run, from the web inside `after()`. A run of the
 * version whose runner died is handed back to be finished instead of starting a second one.
 */
export async function startLeanEval(db: Database, scenarioId: string, requestedBy: string | null): Promise<StartLeanEvalResult> {
  const [scenario] = await db.select({ id: scenarios.id, version: scenarios.version }).from(scenarios).where(eq(scenarios.id, scenarioId));
  if (!scenario) return { ok: false, reason: "not_found" };

  await sweepLostEvalRuns(db, scenarioId);
  const live = await liveLeanRun(db, scenarioId);
  // A due run is handed back without a new budget check: it was checked when it was queued, and
  // it can spend no more than what its cap has left. `resumed` when an earlier runner had begun it.
  if (live) return evalRunIsDue(live) ? { ok: true, runId: live.id, resumed: live.runAttempt > 0 } : { ok: false, reason: "running" };

  const [capUsd, dailyUsd, spentUsd] = await Promise.all([getConfig(db, "eval_lean_budget_usd"), getConfig(db, "eval_daily_budget_usd"), spendToday(db, "eval")]);
  if (spentUsd + capUsd > dailyUsd) return { ok: false, reason: "over_budget" };

  const run = await queueLeanRun(db, { scenarioId, version: scenario.version, capUsd, requestedBy });
  return run ? { ok: true, runId: run.id, resumed: false } : { ok: false, reason: "running" };
}

/** Why a job was stopped from outside its calls: at its time limit, or because the run is no longer its own. */
class JobStopped extends Error {
  constructor(readonly why: "run_limit" | "lost") {
    super(`eval job stopped: ${why}`);
  }
}

export type RunEvalJobOptions = {
  llmDeps?: Partial<CallModelDeps>;
  concurrency?: number;
  /** Pay for every probe again and write over the kept results. */
  refreshCache?: boolean;
  toolCache?: ToolCache;
  rateLimitDelaysMs?: number[];
  /** How long this runner may work before it hands the run on; null for no limit (the CLI). */
  runLimitMs?: number | null;
  heartbeatMs?: number;
  staleMs?: number;
};

/**
 * `not_claimed`: the run has a live runner, is over, or has had all its runners. `lost`: it was
 * taken over while this runner worked. `released`: this runner reached its time limit and left
 * the run for the next one.
 */
export type EvalJobResult =
  | { outcome: "done"; report: QaReport }
  | { outcome: "failed"; reason: EvalFailureReason; error: unknown }
  | { outcome: "not_claimed" | "lost" | "released" };

const failureOf = (error: unknown): EvalFailureReason =>
  error instanceof IsolationError ? "isolation" : error instanceof BudgetExceededError ? "budget" : "model";

/**
 * Runs the persona QA agent on a queued lean run and stores its report. Safe to call any number
 * of times: only the runner that wins the claim works, and every write is conditional on the run
 * still being its own. A runner that dies is followed by another that runs the agent again; the
 * probes the first one finished come from the probe cache, so they are not paid for twice, and
 * what the first one spent counts against the same cap.
 */
export async function runEvalJob(db: Database, runId: string, options: RunEvalJobOptions = {}): Promise<EvalJobResult> {
  const claim = await claimEvalRun(db, runId, options.staleMs);
  if (!claim) return { outcome: "not_claimed" };
  const { run, token } = claim;
  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, run.scenarioId));

  const stop = new AbortController();
  const runLimit = options.runLimitMs === undefined ? GENERATION_RUN_LIMIT_MS : options.runLimitMs;
  const timer = runLimit === null ? null : setTimeout(() => stop.abort(new JobStopped("run_limit")), runLimit);
  const heartbeat = setInterval(() => {
    touchEvalRun(db, runId, token)
      .then((ours) => {
        if (!ours) stop.abort(new JobStopped("lost"));
      })
      .catch((error: unknown) => console.error(error));
  }, options.heartbeatMs ?? EVAL_JOB_HEARTBEAT_MS);

  let report: QaReport;
  try {
    report = await runQaAgent(scenario.content, {
      runId,
      version: run.version,
      // The cap was fixed when the run was queued; earlier runners' spend counts against it.
      budget: new Budget(Math.max(0, run.costEstimateUsd - claim.spentUsd)),
      llmDeps: { ...options.llmDeps, signal: stop.signal },
      concurrency: options.concurrency ?? WEB_CONCURRENCY,
      toolCache: options.toolCache ?? dbToolCache(db),
      refreshCache: options.refreshCache,
      rateLimitDelaysMs: options.rateLimitDelaysMs,
    });
  } catch (error) {
    const stopped = stop.signal.reason instanceof JobStopped ? stop.signal.reason : null;
    if (stopped?.why === "lost") return { outcome: "lost" };
    if (stopped?.why === "run_limit") {
      await releaseEvalRun(db, runId, token);
      return { outcome: "released" };
    }
    const reason = failureOf(error);
    console.warn(JSON.stringify({ event: "eval_job_failed", runId, reason, cause: error instanceof Error ? error.message : String(error) }));
    return (await failEvalRun(db, runId, token, reason)) ? { outcome: "failed", reason, error } : { outcome: "lost" };
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(heartbeat);
  }

  // Every runner's calls, read from `llm_call` as when a run fails.
  const written = await finishQaRun(db, { runId, token, report, costActualUsd: await spentOn(db, runId) });
  return written ? { outcome: "done", report } : { outcome: "lost" };
}
