import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { attemptRunIsDue, claimAttempt, finishAttempt, generationCommittedToday, releaseAttempt, saveDraft, sweepStaleAttempts, touchAttempt } from "@/db/repo/custom-topics";
import { generationAttempts } from "@/db/schema";
import { toScenarioFile } from "@/llm/prompts/scenario-generator";
import { validateScenario } from "@/scenario/validate";
import { getCustomQuota } from "@/server/custom-topic";
import { dueAttemptOf, getAttemptView, runGeneration } from "@/server/generation";
import { attemptRow, dbModels, generatedScenarios, generationCalls, sessionsOf, setBudget, stopHeartbeat, submit, userRow } from "../helpers/custom-db";
import { generatedFrom } from "../helpers/custom-fixtures";
import { createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const scenario = validateScenario(toScenarioFile(generatedFrom())).scenario!;

async function running() {
  const learner = await createLearner("minh@example.com");
  const { result } = await submit(learner);
  if (!result.ok) throw new Error("unreachable");
  return { learner, ...result };
}

/** Moves the attempt past its ten minutes. */
const expire = (attemptId: string) => db().update(generationAttempts).set({ deadlineAt: sql`now() - interval '1 second'` }).where(eq(generationAttempts.id, attemptId));

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("one runner at a time", () => {
  it("lets exactly one of several runners started together do the work", async () => {
    const { attemptId } = await running();
    const models = dbModels();

    const outcomes = await Promise.all(Array.from({ length: 4 }, () => runGeneration(db(), attemptId, { llmDeps: models.llmDeps })));

    expect(outcomes.filter((outcome) => outcome === "passed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "not_claimed")).toHaveLength(3);
    expect(models.count("SCENARIO_GENERATOR")).toBe(1);
    expect(await generatedScenarios()).toHaveLength(1);
    expect((await attemptRow(attemptId)).runAttempt).toBe(1);
  });

  it("is not claimed while its runner is alive, and not once it finished", async () => {
    const { attemptId } = await running();
    expect(await claimAttempt(db(), attemptId)).not.toBeNull();
    expect(await claimAttempt(db(), attemptId)).toBeNull();
    expect(attemptRunIsDue(await attemptRow(attemptId))).toBe(false);

    await resetDatabase();
    const second = await running();
    expect(await runGeneration(db(), second.attemptId, { llmDeps: dbModels().llmDeps })).toBe("passed");
    expect(await claimAttempt(db(), second.attemptId)).toBeNull();
    expect(attemptRunIsDue(await attemptRow(second.attemptId))).toBe(false);
  });
});

describe("a run that was cut off is followed by another that goes on from what is stored", () => {
  it("resumes at the safety check when the first run died after the scenario was stored, without generating again", async () => {
    const { learner, attemptId, sessionId } = await running();
    // The first run generated, stored the draft and entered the safety step; then its function died.
    const first = (await claimAttempt(db(), attemptId))!;
    expect(await saveDraft(db(), attemptId, first.token, scenario)).toBe(true);
    expect(await touchAttempt(db(), attemptId, first.token, "validating")).toBe(true);
    await stopHeartbeat(attemptId);

    // Nothing closes it: it has runs left. Whoever looks at it next is told to start a run.
    expect(await sweepStaleAttempts(db())).toBe(0);
    expect(await dueAttemptOf(db(), learner)).toBe(attemptId);
    expect(await getAttemptView(db(), learner, attemptId)).toMatchObject({ due: true, status: { outcome: "running", step: "validating" } });

    const second = dbModels();
    expect(await runGeneration(db(), attemptId, { llmDeps: second.llmDeps })).toBe("passed");

    expect(second.calls.map((call) => call.role)).toEqual(["SAFETY"]);
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "passed", runAttempt: 2, draft: null, runToken: null });
    expect(await generatedScenarios()).toHaveLength(1);
    expect((await sessionsOf(learner.id))[0]).toMatchObject({ id: sessionId, status: "interviewing" });
    expect(await getAttemptView(db(), learner, attemptId)).toMatchObject({ due: false, status: { outcome: "passed" } });

    // The first runner comes back to an attempt that is no longer its own: its writes do nothing.
    expect(await touchAttempt(db(), attemptId, first.token)).toBe(false);
    expect(await finishAttempt(db(), { attemptId, token: first.token, result: { outcome: "system_error" }, report: {}, costActualUsd: 0 })).toBe(false);
  });

  it("counts what earlier runs spent against the same reservation", async () => {
    // One generator call of the test models costs 0.0004 USD; so does one safety call.
    await setBudget(1, 0.0007);
    const { attemptId } = await running();
    const first = dbModels({ override: { SAFETY: () => ({ hang: true }) } });
    expect(await runGeneration(db(), attemptId, { llmDeps: first.llmDeps, runLimitMs: 300 })).toBe("released");

    // The second run starts at 0.0004 already spent: its safety call takes the attempt to its reservation.
    const second = dbModels({ safety: { violations: [{ field: "opening_line", kind: "policy", reason: "r" }] } });
    const outcome = await runGeneration(db(), attemptId, { llmDeps: second.llmDeps });
    // The call that reached the limit was the last one, so its verdict stands; what matters is the total.
    expect(outcome).toBe("failed");
    const row = await attemptRow(attemptId);
    expect(row.costActualUsd).toBeCloseTo((await generationCalls(attemptId)).reduce((sum, call) => sum + call.costUsd, 0), 9);
    expect(row.costActualUsd).toBeGreaterThanOrEqual(0.0007);
  });

  it("generates again when the first run died before any scenario was stored", async () => {
    const { attemptId } = await running();
    await claimAttempt(db(), attemptId);
    await stopHeartbeat(attemptId);

    const models = dbModels();
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps })).toBe("passed");
    expect(models.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR", "SAFETY"]);
    expect((await attemptRow(attemptId)).runAttempt).toBe(2);
  });

  it("hands the attempt on at its own time limit, and the next run finishes it", async () => {
    const { learner, attemptId } = await running();
    const slow = dbModels({ override: { SAFETY: () => ({ hang: true }) } });

    const startedAt = Date.now();
    expect(await runGeneration(db(), attemptId, { llmDeps: slow.llmDeps, runLimitMs: 400 })).toBe("released");
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    const released = await attemptRow(attemptId);
    expect(released).toMatchObject({ outcome: "running", runToken: null, runAttempt: 1, step: "validating" });
    expect(released.draft).not.toBeNull();
    // It is due at once: no wait for a heartbeat to go stale.
    expect(attemptRunIsDue(released)).toBe(true);
    expect((await sessionsOf(learner.id))[0].status).toBe("generating");

    const next = dbModels();
    expect(await runGeneration(db(), attemptId, { llmDeps: next.llmDeps })).toBe("passed");
    expect(next.calls.map((call) => call.role)).toEqual(["SAFETY"]);
  });

  it("gives up after three runs: the attempt is closed as a system error and counts for nothing", async () => {
    const { learner, attemptId } = await running();
    for (let run = 1; run <= 3; run += 1) {
      expect((await claimAttempt(db(), attemptId))?.attempt.runAttempt).toBe(run);
      await stopHeartbeat(attemptId);
    }
    // A fourth run is not given out, and nothing is due.
    expect(await claimAttempt(db(), attemptId)).toBeNull();
    expect(attemptRunIsDue(await attemptRow(attemptId))).toBe(false);
    const models = dbModels();
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps })).toBe("not_claimed");
    expect(models.calls).toEqual([]);

    expect(await sweepStaleAttempts(db())).toBe(1);
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "system_error", failureCode: "system_error", draft: null });
    expect((await sessionsOf(learner.id))[0].status).toBe("failed_eval");
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
    expect((await userRow(learner.id)).customFailedCount).toBe(0);
  });

  it("is closed at once when its last run gives it back unfinished: nobody waits for a heartbeat to go stale", async () => {
    const { learner, attemptId } = await running();
    for (let run = 1; run <= 2; run += 1) {
      await claimAttempt(db(), attemptId);
      await stopHeartbeat(attemptId);
    }
    // The third run reaches its own time limit inside the safety call and hands the attempt back.
    await saveDraft(db(), attemptId, (await claimAttempt(db(), attemptId))!.token, scenario);
    await stopHeartbeat(attemptId);
    await db().update(generationAttempts).set({ runAttempt: 2 }).where(eq(generationAttempts.id, attemptId));
    const slow = dbModels({ override: { SAFETY: () => ({ hang: true }) } });
    expect(await runGeneration(db(), attemptId, { llmDeps: slow.llmDeps, runLimitMs: 300 })).toBe("released");
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "running", runToken: null, runAttempt: 3 });

    // Not due, not claimable: the next look closes it instead of leaving the screen to spin.
    expect(await getAttemptView(db(), learner, attemptId)).toMatchObject({ due: false, status: { outcome: "system_error" } });
    expect((await sessionsOf(learner.id))[0].status).toBe("failed_eval");
  });

  it("is closed ten minutes after the submit request whatever runs it has left, and cannot be claimed after that", async () => {
    const { learner, attemptId } = await running();
    await expire(attemptId);

    expect(attemptRunIsDue(await attemptRow(attemptId))).toBe(false);
    expect(await claimAttempt(db(), attemptId)).toBeNull();
    expect(await getAttemptView(db(), learner, attemptId)).toMatchObject({ due: false, status: { outcome: "system_error" } });
    expect((await sessionsOf(learner.id))[0].status).toBe("failed_eval");
  });

  it("ends as a system error, not a hand-over, when the run is stopped by the attempt's deadline", async () => {
    const learner = await createLearner("minh@example.com");
    // The request started 9 minutes 59.5 seconds ago: half a second of the ten minutes is left.
    const { result } = await submit(learner, {}, {}, Date.now() - 599_500);
    if (!result.ok) throw new Error("unreachable");
    const models = dbModels({ override: { SCENARIO_GENERATOR: () => ({ hang: true }) } });

    const outcome = await runGeneration(db(), result.attemptId, { llmDeps: models.llmDeps });

    expect(["system_error", "lost"]).toContain(outcome);
    expect(await attemptRow(result.attemptId)).toMatchObject({ outcome: "system_error" });
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3 });
  });
});

describe("a runner whose attempt was taken or closed under it", () => {
  it("changes nothing when it finishes after another run took the attempt over", async () => {
    const { attemptId } = await running();
    let taken: Awaited<ReturnType<typeof claimAttempt>> = null;
    const models = dbModels({
      override: {
        SAFETY: async () => {
          // Its heartbeat looks stale and a second runner claims the attempt while this call is under way.
          await stopHeartbeat(attemptId);
          taken = await claimAttempt(db(), attemptId);
          return { structured: { violations: [{ field: "opening_line", kind: "policy", reason: "r" }] } };
        },
      },
    });

    // This run would fail the scenario; the attempt is no longer its own, so nothing is written.
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps, heartbeatMs: 600_000 })).toBe("lost");
    expect(taken).not.toBeNull();
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "running", runToken: taken!.token, runAttempt: 2, failureCode: null });
    expect((await userRow((await attemptRow(attemptId)).userId)).customFailedCount).toBe(0);
  });

  it("is told by its heartbeat and stops calls that are under way", async () => {
    const { attemptId } = await running();
    const models = dbModels({
      override: {
        SCENARIO_GENERATOR: async () => {
          await expire(attemptId);
          await sweepStaleAttempts(db());
          return { hang: true };
        },
      },
    });

    const startedAt = Date.now();
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps, heartbeatMs: 50 })).toBe("lost");
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "system_error" });
  });

  it("settles the reservation exactly once: what the sweep wrote down is not written again", async () => {
    await setBudget(1, 0.1);
    const { attemptId } = await running();
    let settled: Awaited<ReturnType<typeof attemptRow>> | undefined;
    const models = dbModels({
      override: {
        SAFETY: async () => {
          await expire(attemptId);
          expect(await sweepStaleAttempts(db())).toBe(1);
          settled = await attemptRow(attemptId);
          return { structured: { violations: [] } };
        },
      },
    });

    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps, heartbeatMs: 600_000 })).toBe("lost");

    const after = await attemptRow(attemptId);
    // The sweep wrote the generator call it found; the safety call that ended later did not change the row.
    expect(settled!.costActualUsd).toBeGreaterThan(0);
    expect(after.costActualUsd).toBe(settled!.costActualUsd);
    expect(after.finishedAt).toEqual(settled!.finishedAt);
    expect(after.report).toEqual({ error: "runner_lost_or_timed_out" });
    expect(await generatedScenarios()).toEqual([]);
    // Nothing is held any more, and every call that was made still counts against the day.
    const spent = (await generationCalls(attemptId)).reduce((sum, call) => sum + call.costUsd, 0);
    expect(spent).toBeGreaterThan(after.costActualUsd);
    expect(await generationCommittedToday(db())).toBeCloseTo(spent, 9);
  });
});

describe("the conditional writes themselves", () => {
  it("refuses a heartbeat, a step, a draft, a release and a final write from a token that is not the owner's", async () => {
    const { learner, attemptId } = await running();
    const claim = (await claimAttempt(db(), attemptId))!;
    const stranger = "99999999-9999-4999-8999-999999999999";

    expect(await touchAttempt(db(), attemptId, stranger, "validating")).toBe(false);
    expect(await saveDraft(db(), attemptId, stranger, scenario)).toBe(false);
    await releaseAttempt(db(), attemptId, stranger);
    expect(await attemptRow(attemptId)).toMatchObject({ step: "generating", draft: null, runToken: claim.token });
    expect(await finishAttempt(db(), { attemptId, token: stranger, result: { outcome: "passed", scenario }, report: {}, costActualUsd: 0 })).toBe(false);
    expect(await generatedScenarios()).toEqual([]);

    expect(await touchAttempt(db(), attemptId, claim.token, "validating")).toBe(true);
    expect(await saveDraft(db(), attemptId, claim.token, scenario)).toBe(true);
    expect(await finishAttempt(db(), { attemptId, token: claim.token, result: { outcome: "passed", scenario }, report: {}, costActualUsd: 0.2 })).toBe(true);
    // A second final write, even from the owner, finds the attempt no longer running.
    expect(await finishAttempt(db(), { attemptId, token: claim.token, result: { outcome: "failed", code: "invalid" }, report: {}, costActualUsd: 9 })).toBe(false);
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "passed", costActualUsd: 0.2, draft: null });
    expect(await userRow(learner.id)).toMatchObject({ freeCustomUsed: true, customFailedCount: 0 });
  });

  it("cannot revive a closed attempt: the owner's own token writes nothing after the sweep", async () => {
    const { learner, attemptId } = await running();
    const claim = (await claimAttempt(db(), attemptId))!;
    await expire(attemptId);
    expect(await sweepStaleAttempts(db())).toBe(1);

    expect(await touchAttempt(db(), attemptId, claim.token)).toBe(false);
    expect(await saveDraft(db(), attemptId, claim.token, scenario)).toBe(false);
    expect(await finishAttempt(db(), { attemptId, token: claim.token, result: { outcome: "passed", scenario }, report: {}, costActualUsd: 0 })).toBe(false);
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "system_error", draft: null });
    expect(await generatedScenarios()).toEqual([]);
    expect(await sessionsOf(learner.id)).toMatchObject([{ status: "failed_eval" }]);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
  });

  it("leaves a live attempt alone, and one that only lost its runner while it has runs left", async () => {
    const { attemptId } = await running();
    await claimAttempt(db(), attemptId);
    expect(await sweepStaleAttempts(db())).toBe(0);
    await stopHeartbeat(attemptId);
    expect(await sweepStaleAttempts(db())).toBe(0);
    expect((await attemptRow(attemptId)).outcome).toBe("running");
    // Unless the learner is leaving: then nobody will come back for it.
    expect(await sweepStaleAttempts(db(), undefined, { abandon: true })).toBe(1);
  });
});
