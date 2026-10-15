import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { claimEvalRun, evalRunIsDue } from "@/db/repo/eval-jobs";
import { recordLlmCall, type LlmCallRecord } from "@/db/repo/llm-calls";
import { evalRuns, evalToolCache, leakFlags, llmCalls } from "@/db/schema";
import { findAttack } from "@/eval/attacks";
import { FLOOR_ATTACKS } from "@/eval/qa/floor";
import { ATTACK_TURNS } from "@/eval/qa/tools";
import { Budget, runQaAgent } from "@/graphs/qa-agent-graph";
import { runEvalJob, startLeanEval } from "@/server/eval-job";
import { a, chiThu, rawAnalysis } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import { newestVersion } from "../helpers/publish-fixtures";
import type { ScriptedStep } from "../helpers/scripted-model";
import { resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const ADMIN = "thanh@example.com";

/** Persona turns the floor attacks play. */
const ATTACK_REPLIES = FLOOR_ATTACKS.reduce((sum, id) => sum + Math.min(ATTACK_TURNS, findAttack(id).opening.length), 0);
const neutral: ScriptedStep = { structured: rawAnalysis({ question_type: "other" }) };
const plan: ScriptedStep = { structured: { public_leaks: [], risks: [], deliveries: [], paraphrases: [], attacks: [] } };
const done: ScriptedStep = { structured: { decision: "done", probes: [], findings: [] } };
/** The judge reads the floor attacks' replies; the first one raises a locked topic. */
const judge: ScriptedStep = {
  structured: { replies: Array.from({ length: ATTACK_REPLIES }, (_, index) => ({ reply: `R${index + 1}`, told: [], topics: index === 0 ? [a("item", "installment")] : [] })) },
};

/**
 * Scripted models for one lean run in which no item opens, writing real `llm_call` rows. Every
 * floor check misses and is run once more, so ANALYSIS gets twice the items plus the attack turns.
 */
function models(analysis: ScriptedStep[] = repeat(2 * chiThu.items.length + ATTACK_REPLIES, neutral)) {
  const scripted = roleModels({
    QA_PLANNER: [plan, done],
    ANALYSIS: analysis,
    PERSONA: repeat(ATTACK_REPLIES, { text: "Chị cũng không biết nói sao nữa em." }),
    EVAL_LEAK_JUDGE: [judge],
  });
  const llmDeps = { ...scripted.llmDeps, recordCall: (record: LlmCallRecord) => recordLlmCall(db(), record) };
  return { ...scripted, llmDeps };
}

async function queued() {
  const scenario = await newestVersion();
  const started = await startLeanEval(db(), scenario.id, ADMIN);
  if (!started.ok) throw new Error(`not started: ${started.reason}`);
  return started.runId;
}

const runRow = async (runId: string) => (await db().select().from(evalRuns).where(eq(evalRuns.id, runId)))[0];
const stale = (runId: string) => db().update(evalRuns).set({ heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(evalRuns.id, runId));
const probeCalls = (scripted: ReturnType<typeof models>) => scripted.calls("ANALYSIS").length + scripted.calls("PERSONA").length;

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  await resetDatabase();
  await db().delete(evalToolCache);
});

describe("startLeanEval", () => {
  it("queues a lean run of the version for the admin, with the cap in config as its estimate", async () => {
    const runId = await queued();
    expect(await runRow(runId)).toMatchObject({ profile: "lean", status: "queued", version: 1, requestedBy: ADMIN, costEstimateUsd: 0.1, runAttempt: 0, runToken: null });
  });

  it("keeps one lean run per version: a queued run is handed back, a held one refuses a second", async () => {
    const scenario = await newestVersion();
    const runId = await queued();
    expect(await startLeanEval(db(), scenario.id, "linh@example.com")).toEqual({ ok: true, runId, resumed: false });

    expect(await claimEvalRun(db(), runId)).not.toBeNull();
    expect(await startLeanEval(db(), scenario.id, "linh@example.com")).toEqual({ ok: false, reason: "running" });
    expect(await db().select().from(evalRuns)).toHaveLength(1);
  });

  it("refuses when today's eval spend and the run's cap would pass the daily eval budget", async () => {
    const scenario = await newestVersion();
    await setConfig(db(), "eval_daily_budget_usd", 0.5, ADMIN);
    await recordLlmCall(db(), {
      scope: "eval", role: "ANALYSIS", model: "gemini-3.8-flash", tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensReasoning: 0,
      costUsd: 0.45, latencyMs: 1, attempt: 1, ok: true,
    });

    expect(await startLeanEval(db(), scenario.id, ADMIN)).toEqual({ ok: false, reason: "over_budget" });
    expect(await db().select().from(evalRuns)).toEqual([]);
  });

  it("closes a run whose runners all died and queues a new one", async () => {
    const scenario = await newestVersion();
    const lost = await queued();
    await db().update(evalRuns).set({ status: "running", runAttempt: 3, runToken: randomUUID() }).where(eq(evalRuns.id, lost));
    await stale(lost);

    const started = await startLeanEval(db(), scenario.id, ADMIN);

    expect(started).toMatchObject({ ok: true, resumed: false });
    expect(await runRow(lost)).toMatchObject({ status: "failed", failureReason: "lost", runToken: null });
  });

  it("does not know a version that does not exist", async () => {
    expect(await startLeanEval(db(), randomUUID(), ADMIN)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("runEvalJob", () => {
  it("runs the QA agent, stores the report, its flags and what it cost, and lets the runner go", async () => {
    const runId = await queued();
    const scripted = models();

    const result = await runEvalJob(db(), runId, { llmDeps: scripted.llmDeps, concurrency: 1 });

    expect(result.outcome).toBe("done");
    const run = await runRow(runId);
    expect(run).toMatchObject({ status: "done", runToken: null, runAttempt: 1, failureReason: null });
    expect(run.reportJson).toMatchObject({ profile: "lean", leaks: [expect.objectContaining({ replyId: "R1", kind: "topic" })] });
    expect(await db().select().from(leakFlags)).toHaveLength(1);
    const calls = await db().select().from(llmCalls);
    expect(calls.every((call) => call.scope === "eval" && call.attemptId === runId)).toBe(true);
    expect(run.costActualUsd).toBeCloseTo(calls.reduce((sum, call) => sum + call.costUsd, 0), 8);
    expect(evalRunIsDue(run)).toBe(false);
  });

  it("lets exactly one of several runners started together do the work", async () => {
    const runId = await queued();
    const scripted = models();

    const outcomes = await Promise.all(Array.from({ length: 3 }, () => runEvalJob(db(), runId, { llmDeps: scripted.llmDeps, concurrency: 1 })));

    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual(["done", "not_claimed", "not_claimed"]);
    expect(scripted.calls("QA_PLANNER")).toHaveLength(2);
    expect(await runEvalJob(db(), runId, { llmDeps: scripted.llmDeps })).toEqual({ outcome: "not_claimed" });
  });

  it("is finished by a second runner after the first was killed, without paying again for the probes it finished", async () => {
    // What an uninterrupted run pays for its probes.
    const reference = models();
    await runQaAgent(chiThu, { runId: randomUUID(), version: 1, budget: new Budget(0.1), llmDeps: reference.llmDeps, concurrency: 1 });
    await db().delete(llmCalls);
    const fullProbes = probeCalls(reference);

    const runId = await queued();
    // The first runner finishes three floor checks, then its function dies during the fourth: it
    // stops sending heartbeats, and another runner takes the run over.
    const finished = 3;
    const first = models([...repeat(finished, neutral), { hang: true }]);
    const firstRun = runEvalJob(db(), runId, { llmDeps: first.llmDeps, concurrency: 1, heartbeatMs: 20 });
    await vi.waitFor(() => expect(first.calls("ANALYSIS")).toHaveLength(finished + 1));
    await db().update(evalRuns).set({ runToken: randomUUID() }).where(eq(evalRuns.id, runId));
    expect(await firstRun).toEqual({ outcome: "lost" });

    await stale(runId);
    const second = models();
    const result = await runEvalJob(db(), runId, { llmDeps: second.llmDeps, concurrency: 1 });

    expect(result.outcome).toBe("done");
    expect(probeCalls(second)).toBe(fullProbes - finished);
    expect(await runRow(runId)).toMatchObject({ status: "done", runAttempt: 2 });
    // The run's cost is what both runners spent.
    const calls = await db().select().from(llmCalls);
    expect((await runRow(runId)).costActualUsd).toBeCloseTo(calls.reduce((sum, call) => sum + call.costUsd, 0), 8);
  });

  it("hands the run on at its time limit, and the next runner finishes it", async () => {
    const runId = await queued();
    const first = models([{ hang: true }]);

    expect(await runEvalJob(db(), runId, { llmDeps: first.llmDeps, concurrency: 1, runLimitMs: 50 })).toEqual({ outcome: "released" });
    const released = await runRow(runId);
    expect(released).toMatchObject({ status: "running", runToken: null, runAttempt: 1 });
    expect(evalRunIsDue(released)).toBe(true);

    expect((await runEvalJob(db(), runId, { llmDeps: models().llmDeps, concurrency: 1 })).outcome).toBe("done");
  });

  it("fails the run with its reason when the cap cannot hold the floor, before any call", async () => {
    await setConfig(db(), "eval_lean_budget_usd", 0.001, ADMIN);
    const runId = await queued();
    const scripted = models();

    const result = await runEvalJob(db(), runId, { llmDeps: scripted.llmDeps });

    expect(result).toMatchObject({ outcome: "failed", reason: "budget" });
    expect(await runRow(runId)).toMatchObject({ status: "failed", failureReason: "budget", runToken: null });
    expect(scripted.records).toEqual([]);
  });
});
