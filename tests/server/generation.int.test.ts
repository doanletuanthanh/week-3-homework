import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { getSession, listTurns } from "@/db/repo/sessions";
import { branches, scenarios, sessions, snapshots, topics } from "@/db/schema";
import { getCustomQuota } from "@/server/custom-topic";
import { getAttemptView, runGeneration } from "@/server/generation";
import { listSessions } from "@/server/session-list";
import { buildSessionView } from "@/server/session-view";
import { runTurn } from "@/server/turns";
import {
  INVALID,
  TOPIC,
  attempt,
  attemptRow,
  dbModels,
  eventNames,
  generatedScenarios,
  generationCalls,
  sessionsOf,
  setBudget,
  submit,
  userRow,
} from "../helpers/custom-db";
import { generatedFrom, type PipelineScript } from "../helpers/custom-fixtures";
import { chiThu } from "../helpers/engine-fixtures";
import { createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const question = (index: number) => ({ text: "Chị kể thêm cho em nghe được không ạ?", expectedIndex: index, turnKey: randomUUID() });

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("runGeneration: an attempt that passes", () => {
  it("stores the scenario for its owner, opens the session with turn 0, and uses the free scenario", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId, attemptId, outcome } = await attempt(learner, { moderation: { decision: "allow", reason_code: null, constraints: [], focus: "trust" } });

    expect(outcome).toBe("passed");
    const row = await attemptRow(attemptId);
    expect(row).toMatchObject({ outcome: "passed", failureCode: null, step: "validating", runToken: null, runAttempt: 1, draft: null });
    expect(row.finishedAt).not.toBeNull();
    expect(row.report).toEqual({});

    const [scenario] = await generatedScenarios();
    expect(scenario).toMatchObject({ id: row.scenarioId, personaId: `custom-${attemptId}`, topicId: row.topicId, version: 1, status: "published", origin: "generated", displayName: "chị Thu" });
    // The stored file carries the ids the store gave it, and item ids by position.
    expect(scenario.content).toMatchObject({ persona_id: `custom-${attemptId}`, topic_id: row.topicId, version: 1, language: "vi" });
    expect(scenario.content.items.map((item) => item.id)).toEqual(chiThu.items.map((_, index) => `item-${index + 1}`));
    const [topic] = await db().select().from(topics).where(eq(topics.id, row.topicId!));
    expect(topic).toMatchObject({ kind: "custom", ownerUserId: learner.id, title: TOPIC });

    const [session] = await sessionsOf(learner.id);
    expect(session).toMatchObject({ id: sessionId, status: "interviewing", scenarioId: scenario.id, personaId: `custom-${attemptId}`, focus: "trust", endedAt: null });
    expect(await listTurns(db(), learner.id, sessionId)).toMatchObject([{ index: 0, learnerText: null, personaText: chiThu.opening_line }]);
    expect(await db().select().from(branches).where(eq(branches.sessionId, sessionId))).toMatchObject([{ kind: "main" }]);
    expect(await db().select().from(snapshots).where(eq(snapshots.sessionId, sessionId))).toMatchObject([{ index: 0, openness: chiThu.openness_start, unlocked: [] }]);

    expect((await userRow(learner.id)).freeCustomUsed).toBe(true);
    expect(await eventNames(sessionId)).toEqual(["custom_topic_requested", "custom_topic_finished", "session_started"]);
  });

  it("writes down what the attempt spent, as the sum of its own model calls, and attributes them to the session", async () => {
    const learner = await createLearner("minh@example.com");
    const { attemptId, sessionId } = await attempt(learner);
    const calls = await generationCalls(attemptId);

    // Two calls prepare a scenario: no simulated interview is played.
    expect(calls.map((call) => call.role).sort()).toEqual(["SAFETY", "SCENARIO_GENERATOR"]);
    expect(new Set(calls.map((call) => call.scope))).toEqual(new Set(["generation"]));
    expect(new Set(calls.map((call) => call.sessionId))).toEqual(new Set([sessionId]));
    const sum = calls.reduce((total, call) => total + call.costUsd, 0);
    expect((await attemptRow(attemptId)).costActualUsd).toBeCloseTo(sum, 9);
  });

  it("reports the step it is on, and the persona once it passed", async () => {
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner);
    if (!result.ok) throw new Error("unreachable");
    const seen: (string | null)[] = [];
    const watch = async () => void seen.push((await getAttemptView(db(), learner, result.attemptId))!.status.step);

    const models = dbModels({
      override: {
        SCENARIO_GENERATOR: async () => (await watch(), { structured: generatedFrom() }),
        SAFETY: async () => (await watch(), { structured: { violations: [] } }),
      },
    });
    await runGeneration(db(), result.attemptId, { llmDeps: models.llmDeps });

    expect(seen).toEqual(["generating", "validating"]);
    expect(await getAttemptView(db(), learner, result.attemptId)).toEqual({
      due: false,
      status: { outcome: "passed", step: "validating", sessionId: result.sessionId, personaId: `custom-${result.attemptId}` },
    });
  });

  it("plays like any session afterwards, with the custom labels on every screen and nothing sealed in the view", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    const models = dbModels();

    const turn = await runTurn(db(), learner, sessionId, question(1), { llmDeps: models.llmDeps });
    expect(turn).toMatchObject({ ok: true, turnIndex: 1 });
    const found = (await getSession(db(), learner.id, sessionId))!;
    const view = buildSessionView({ session: found.session, scenario: found.scenario, topicTitle: found.topic.title, turns: await listTurns(db(), learner.id, sessionId), waitlisted: false, next: { kind: "all_practised" } });
    expect(view).toMatchObject({ custom: true, screen: "interview" });
    const sealed = found.scenario.content.items.flatMap((item) => [item.content, item.sample_question, item.hook_line, item.topic_tag]);
    for (const text of sealed) expect(JSON.stringify(view)).not.toContain(text);
  });

  it("shows in the list as a session in progress under the persona's name and the typed topic", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    expect((await listSessions(db(), learner)).items).toEqual([expect.objectContaining({ id: sessionId, personaName: "Chị Thu", topicTitle: TOPIC, state: "in_progress", result: null })]);
  });
});

describe("runGeneration: an attempt that does not pass", () => {
  const FAILING: [code: string, script: PipelineScript, generatorCalls: number][] = [
    ["invalid", INVALID, 3],
    ["unsafe_output", { safety: { violations: [{ field: "surface_facts[0]", kind: "real_org_or_brand", reason: "tên công ty thật" }] } }, 1],
  ];

  it.each(FAILING)("ends as failed_eval with the code %s, counts as a failure, and keeps the free scenario", async (code, script, generatorCalls) => {
    const learner = await createLearner("minh@example.com");
    const { sessionId, attemptId, outcome, models } = await attempt(learner, script);

    expect(outcome).toBe("failed");
    expect(await attemptRow(attemptId)).toMatchObject({ outcome: "failed", failureCode: code, scenarioId: null, runToken: null, draft: null });
    expect((await sessionsOf(learner.id))[0]).toMatchObject({ status: "failed_eval", scenarioId: null, personaId: null });
    expect(await generatedScenarios()).toEqual([]);
    expect(await userRow(learner.id)).toMatchObject({ freeCustomUsed: false, customFailedCount: 1 });
    expect(models.count("SCENARIO_GENERATOR")).toBe(generatorCalls);
    expect(await eventNames(sessionId)).toEqual(["custom_topic_requested", "custom_topic_finished"]);
    expect(await getAttemptView(db(), learner, attemptId)).toMatchObject({ due: false, status: { outcome: "failed", personaId: null } });
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, freeLeft: 1, attemptsLeftToday: 2 });
  });

  it("keeps nothing of the generated scenario when the safety check turns it down: the stored draft is removed", async () => {
    const learner = await createLearner("minh@example.com");
    const { attemptId } = await attempt(learner, { safety: { violations: [{ field: "opening_line", kind: "policy", reason: "không ổn" }] } });
    const row = await attemptRow(attemptId);
    for (const item of generatedFrom().items) expect(JSON.stringify(row)).not.toContain(item.content);
    expect(row.report).toEqual({ unsafe: [{ field: "opening_line", kind: "policy", reason: "không ổn" }] });
  });

  it("shows in the list under the typed topic, with no number and the state of the attempt", async () => {
    const learner = await createLearner("minh@example.com");
    const running = await submit(learner);
    if (!running.result.ok) throw new Error("unreachable");
    expect((await listSessions(db(), learner)).items).toEqual([expect.objectContaining({ personaName: TOPIC, topicTitle: "Chủ đề tự tạo", state: "preparing", result: null })]);

    await runGeneration(db(), running.result.attemptId, { llmDeps: dbModels(INVALID).llmDeps });
    expect((await listSessions(db(), learner)).items).toEqual([expect.objectContaining({ personaName: TOPIC, topicTitle: "Chủ đề tự tạo", state: "failed_eval", result: null })]);
  });
});

describe("runGeneration: system errors are not attempts", () => {
  it("ends as a system error when a model call fails after its retries, and counts for nothing", async () => {
    const learner = await createLearner("minh@example.com");
    const { attemptId, outcome } = await attempt(learner, { override: { SCENARIO_GENERATOR: () => ({ error: new Error("provider down") }) } });

    expect(outcome).toBe("system_error");
    const row = await attemptRow(attemptId);
    expect(row).toMatchObject({ outcome: "system_error", failureCode: "system_error", scenarioId: null });
    expect(row.report.error).toContain("LlmCallError");
    expect((await sessionsOf(learner.id))[0].status).toBe("failed_eval");
    expect(await userRow(learner.id)).toMatchObject({ freeCustomUsed: false, customFailedCount: 0 });
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
    // The failed tries were still paid for and still count against the budget.
    expect((await generationCalls(attemptId)).map((call) => call.ok)).toEqual([false, false, false]);
  });

  it("stops at the deadline, ten minutes after the submit request started, even while a model call hangs", async () => {
    const learner = await createLearner("minh@example.com");
    // The request started 9 minutes 59.5 seconds ago: half a second is left.
    const { result } = await submit(learner, {}, {}, Date.now() - 599_500);
    if (!result.ok) throw new Error("unreachable");
    const models = dbModels({ override: { SCENARIO_GENERATOR: () => ({ hang: true }) } });

    const startedAt = Date.now();
    const outcome = await runGeneration(db(), result.attemptId, { llmDeps: models.llmDeps });
    expect(Date.now() - startedAt).toBeLessThan(1_900);

    expect(["system_error", "lost"]).toContain(outcome);
    expect(await attemptRow(result.attemptId)).toMatchObject({ outcome: "system_error", failureCode: "system_error" });
    expect((await sessionsOf(learner.id))[0].status).toBe("failed_eval");
    expect(models.count("SCENARIO_GENERATOR")).toBe(1);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3 });
  });

  it("stops when what it spent reaches what it reserved, and makes no further call", async () => {
    // One generator try of the test models costs 0.0004 USD: the second one reaches the reservation.
    await setBudget(1, 0.0007);
    const learner = await createLearner("minh@example.com");
    const { attemptId, outcome, models } = await attempt(learner, INVALID);

    expect(outcome).toBe("system_error");
    const row = await attemptRow(attemptId);
    expect(row.report.error).toBe("budget");
    expect(row.costActualUsd).toBeGreaterThanOrEqual(0.0007);
    // A third try was due; it was never sent, and the attempt is no failure of the learner's.
    expect(models.count("SCENARIO_GENERATOR")).toBe(2);
    expect(models.count("SAFETY")).toBe(0);
    expect(await userRow(learner.id)).toMatchObject({ freeCustomUsed: false, customFailedCount: 0 });
  });
});

describe("FR-37: a custom session meets the session cost cap at its first question", () => {
  it("refuses the first turn while the cap is reached, calls no model, and lets the session go on later", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    await setConfig(db(), "session_daily_cap_usd", 0, "test");
    const models = dbModels();

    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps: models.llmDeps })).toEqual({ ok: false, error: "cap_reached" });
    expect(models.calls).toEqual([]);
    const [held] = await sessionsOf(learner.id);
    expect(held).toMatchObject({ status: "interviewing", endedAt: null, turnClaim: null });
    expect(await listTurns(db(), learner.id, sessionId)).toHaveLength(1);

    await setConfig(db(), "session_daily_cap_usd", 5, "test");
    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps: models.llmDeps })).toMatchObject({ ok: true, turnIndex: 1 });
  });

  it("does not stop a custom session that already has a turn: the cap only blocks the first one", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    const models = dbModels();
    await runTurn(db(), learner, sessionId, question(1), { llmDeps: models.llmDeps });
    await setConfig(db(), "session_daily_cap_usd", 0, "test");

    expect(await runTurn(db(), learner, sessionId, question(2), { llmDeps: models.llmDeps })).toMatchObject({ ok: true, turnIndex: 2 });
  });

  it("leaves a demo account its reserve of the cap", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    const { sessionId } = await attempt(demo);
    // Learners stop at cap minus reserve; a demo account at the cap itself.
    await setConfig(db(), "session_daily_cap_usd", 1, "test");
    await setConfig(db(), "session_demo_reserve_usd", 1, "test");
    expect(await runTurn(db(), demo, sessionId, question(1), { llmDeps: dbModels().llmDeps })).toMatchObject({ ok: true });
  });
});

describe("a generated scenario that is taken down", () => {
  it("cannot be read by a scenario row that names it after its sessions were withdrawn", async () => {
    const { takeDownCustomScenario } = await import("@/db/repo/custom-topics");
    const { getPlayableScenario } = await import("@/db/repo/sessions");
    const learner = await createLearner("minh@example.com");
    const { sessionId, attemptId } = await attempt(learner);
    const [scenario] = await generatedScenarios();

    expect(await takeDownCustomScenario(db(), scenario.id)).toEqual({ ownerUserId: learner.id, withdrawn: 1 });
    expect((await db().select().from(scenarios).where(eq(scenarios.id, scenario.id)))[0].status).toBe("taken_down");
    expect((await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0].status).toBe("withdrawn");
    expect(await getPlayableScenario(db(), `custom-${attemptId}`, false, learner.id)).toBeNull();
    // The persona is hidden from its owner too: the prep screen answers "not found".
    const { getVisibleScenario } = await import("@/db/repo/sessions");
    expect(await getVisibleScenario(db(), `custom-${attemptId}`, learner.id)).toBeNull();
    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps: dbModels().llmDeps })).toEqual({ ok: false, error: "session_ended" });
    // A finished session keeps its result; an id that is no generated scenario is refused.
    expect(await takeDownCustomScenario(db(), randomUUID())).toBeNull();
    const authored = (await db().select().from(scenarios).where(eq(scenarios.origin, "authored")))[0];
    expect(await takeDownCustomScenario(db(), authored.id)).toBeNull();
  });
});
