import { GENERATION_HEARTBEAT_MS, GENERATION_RUN_LIMIT_MS } from "@/config/limits";
import type { Database } from "@/db/client";
import {
  attemptRunIsDue,
  claimAttempt,
  findRunningAttempt,
  finishAttempt,
  getAttemptForUser,
  releaseAttempt,
  saveDraft,
  sweepStaleAttempts,
  touchAttempt,
  type AttemptResult,
  type AttemptRow,
} from "@/db/repo/custom-topics";
import type { AttemptReport } from "@/db/schema";
import { runGenerationGraph } from "@/graphs/generation-graph";
import { recordCallToDb, type CallModelDeps } from "@/llm/call-model";
import { createChatModel } from "@/llm/create-model";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";

/**
 * Why a run was stopped from outside its calls. `run_limit`: this run is near the end of what the
 * platform gives a function; the attempt is left for the next run. `deadline`: the attempt's ten
 * minutes are over. `budget`: it spent what it reserved. `lost`: it is no longer this runner's.
 */
class AttemptStopped extends Error {
  constructor(readonly why: "run_limit" | "deadline" | "budget" | "lost") {
    super(`generation attempt stopped: ${why}`);
  }
}

export type RunGenerationOptions = {
  llmDeps?: Partial<CallModelDeps>;
  heartbeatMs?: number;
  /** How long this run may work before it hands the attempt on. Tests shorten it. */
  runLimitMs?: number;
  staleMs?: number;
};

/**
 * `not_claimed`: the attempt has a live runner, is over, or has no runs left. `lost`: it was taken
 * over or closed while this runner worked. `released`: this run reached its time limit and left
 * the attempt, with what it stored, for the next run.
 */
export type RunGenerationOutcome = "passed" | "failed" | "system_error" | "not_claimed" | "lost" | "released";

/**
 * Prepares the scenario of one accepted custom topic and stores what became of it. Safe to call
 * from anywhere, any number of times: only the runner that wins the claim does anything, and
 * every write is conditional on the attempt still being this runner's and still running.
 *
 * The work is two steps, and the result of the first (the scenario that passed `validate`) is
 * stored as soon as it exists. A run that dies with its function, or stops itself at its time
 * limit, is followed by another run that goes on from what is stored, so no single function has
 * to live for the whole attempt. Whoever looks at the attempt next starts that run: the screen
 * that polls it, the session page, "Buổi của tôi".
 *
 * One signal stops every call of the run: at the run's time limit, at the attempt's deadline,
 * when what the attempt spent over all its runs reaches what it reserved, or when the attempt was
 * taken from this runner. The deadline, the budget and a failed model call end the attempt as a
 * system error, which is not counted as an attempt. It needs no browser.
 */
export async function runGeneration(db: Database, attemptId: string, options: RunGenerationOptions = {}): Promise<RunGenerationOutcome> {
  const claim = await claimAttempt(db, attemptId, options.staleMs);
  if (!claim) return "not_claimed";
  const { attempt, token } = claim;

  const stop = new AbortController();
  // What earlier runs cost counts against the same reservation.
  let spent = claim.spentUsd;
  // Generation uses the batch key when there is one, so it does not share a rate limit with live turns.
  const base: Partial<CallModelDeps> = { createModel: (spec) => createChatModel(spec, { batch: true }), ...options.llmDeps };
  const recordCall = base.recordCall ?? recordCallToDb;
  const llmDeps: Partial<CallModelDeps> = {
    ...base,
    signal: stop.signal,
    // The cost meter: the sum of this attempt's `llm_call` rows, failed tries included.
    recordCall: async (record) => {
      await recordCall(record);
      spent += record.costUsd;
      if (spent >= attempt.costReservedUsd) stop.abort(new AttemptStopped("budget"));
    },
  };
  const untilDeadline = Math.max(0, attempt.deadlineAt!.getTime() - Date.now());
  const runLimit = options.runLimitMs ?? GENERATION_RUN_LIMIT_MS;
  const timer = setTimeout(() => stop.abort(new AttemptStopped(untilDeadline <= runLimit ? "deadline" : "run_limit")), Math.min(untilDeadline, runLimit));
  const heartbeat = setInterval(() => {
    touchAttempt(db, attemptId, token)
      .then((ours) => {
        if (!ours) stop.abort(new AttemptStopped("lost"));
      })
      .catch((error: unknown) => console.error(error));
  }, options.heartbeatMs ?? GENERATION_HEARTBEAT_MS);

  let result: AttemptResult;
  let report: AttemptReport;
  try {
    const generated = await runGenerationGraph(
      { topicText: attempt.topicText, focus: attempt.focus, constraints: attempt.constraints },
      {
        scope: { scope: "generation", attemptId, sessionId: attempt.sessionId ?? undefined },
        meta: { attempt_id: attemptId },
        llmDeps,
        onStep: async (step) => {
          if (!(await touchAttempt(db, attemptId, token, step))) throw new AttemptStopped("lost");
        },
        onDraft: async (scenario) => {
          if (!(await saveDraft(db, attemptId, token, scenario))) throw new AttemptStopped("lost");
        },
      },
      attempt.draft,
    );
    report = generated.report;
    result = generated.outcome === "passed" ? { outcome: "passed", scenario: generated.scenario } : { outcome: "failed", code: generated.code };
  } catch (error) {
    const stopped = error instanceof AttemptStopped ? error : stop.signal.reason instanceof AttemptStopped ? stop.signal.reason : null;
    if (stopped?.why === "lost") return "lost";
    if (stopped?.why === "run_limit") {
      await releaseAttempt(db, attemptId, token);
      return "released";
    }
    const cause = stopped ? stopped.why : error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(JSON.stringify({ event: "generation_stopped", attemptId, cause }));
    result = { outcome: "system_error" };
    report = { error: cause };
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
  }

  const written = await finishAttempt(db, { attemptId, token, result, report, costActualUsd: spent }, async (tx, after, session) => {
    const subject = { userId: after.userId, sessionId: session.id, isDemo: session.isDemo };
    await recordEvent(tx, subject, {
      name: "custom_topic_finished",
      props: { outcome: result.outcome, failure_code: after.failureCode, cost_usd: spent, duration_ms: Date.now() - after.createdAt.getTime(), runs: after.runAttempt },
    });
    if (result.outcome === "passed") {
      await recordEvent(tx, subject, {
        name: "session_started",
        props: { persona_id: session.personaId!, topic_id: after.topicId!, kind: "custom", scenario_version: 1 },
      });
    }
  });
  return written ? result.outcome : "lost";
}

/** What the "Đang chuẩn bị" screen may know: where the attempt is, and where to go when it is over. */
export type AttemptStatus = {
  outcome: AttemptRow["outcome"];
  step: AttemptRow["step"];
  sessionId: string | null;
  /** Set once the attempt passed: the persona whose prep screen comes next. */
  personaId: string | null;
};

/** `due`: nobody is working on the attempt and it can still be finished, so the caller should start a run. */
export type AttemptView = { status: AttemptStatus; due: boolean };

/**
 * The learner's own attempt. An attempt that is out of time or out of runs is closed here, and
 * one that lost its runner is reported as due, so the screen that polls it is also what keeps it
 * going: there is no scheduled job.
 */
export async function getAttemptView(db: Database, user: Pick<AppUser, "id">, attemptId: string): Promise<AttemptView | null> {
  await sweepStaleAttempts(db, user.id);
  const attempt = await getAttemptForUser(db, user.id, attemptId);
  if (!attempt) return null;
  return {
    status: { outcome: attempt.outcome, step: attempt.step, sessionId: attempt.sessionId, personaId: attempt.outcome === "passed" ? `custom-${attempt.id}` : null },
    due: attemptRunIsDue(attempt),
  };
}

/** The id of the learner's running attempt when a run should be started for it; null otherwise. */
export async function dueAttemptOf(db: Database, user: Pick<AppUser, "id">): Promise<string | null> {
  const attempt = await findRunningAttempt(db, user.id);
  return attempt && attemptRunIsDue(attempt) ? attempt.id : null;
}
