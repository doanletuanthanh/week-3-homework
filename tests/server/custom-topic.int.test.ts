import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { getPendingCustomSession } from "@/db/repo/custom-topics";
import { getPlayableScenario, getScenarioByPersona, getVisibleScenario } from "@/db/repo/sessions";
import { events, generationAttempts, llmCalls, scenarios, sessions, topics, turns } from "@/db/schema";
import { endSession } from "@/server/canvas";
import { getCustomQuota, reportCustomProblem, submitCustomTopic } from "@/server/custom-topic";
import { getAttemptView, runGeneration } from "@/server/generation";
import { runReveal, submitGuess } from "@/server/reveal";
import { listSessions } from "@/server/session-list";
import { runTurn } from "@/server/turns";
import { INVALID, TOPIC, attempt, attemptRow, attemptsOf, customTopics, dbModels, generatedScenarios, sessionsOf, submit } from "../helpers/custom-db";
import { NO_VERDICT } from "../helpers/engine-fixtures";
import { createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("submitCustomTopic: moderation inside the request, before anything exists (FR-55)", () => {
  it("creates a custom topic, a generating session and a running attempt for a topic that is allowed", async () => {
    const learner = await createLearner("minh@example.com");
    const { result, models } = await submit(learner, { moderation: { decision: "allow", reason_code: null, constraints: [], focus: "follow_up" } }, { focus: "em hay quên hỏi tiếp" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("unreachable");
    expect(models.count("MODERATION")).toBe(1);
    // Nothing is generated inside the request: the runner starts after the response.
    expect(models.count("SCENARIO_GENERATOR")).toBe(0);

    const [session] = await sessionsOf(learner.id);
    expect(session).toMatchObject({ id: result.sessionId, status: "generating", scenarioId: null, personaId: null, focus: "follow_up", isDemo: false });
    const row = await attemptRow(result.attemptId);
    expect(row).toMatchObject({
      userId: learner.id,
      sessionId: session.id,
      topicText: TOPIC,
      focus: "follow_up",
      focusRaw: "em hay quên hỏi tiếp",
      moderationDecision: "allow",
      constraints: [],
      outcome: "running",
      step: "generating",
      runToken: null,
      costReservedUsd: 1,
    });
    expect(await customTopics()).toMatchObject([{ id: row.topicId, title: TOPIC, kind: "custom", ownerUserId: learner.id }]);
  });

  it("gives the attempt ten minutes from the start of the request, not from the end of moderation", async () => {
    const learner = await createLearner("minh@example.com");
    const startedAt = Date.now() - 20_000;
    const { result } = await submit(learner, {}, {}, startedAt);
    if (!result.ok) throw new Error("unreachable");
    expect((await attemptRow(result.attemptId)).deadlineAt!.getTime()).toBe(startedAt + 600_000);
  });

  it("stores the constraints of a topic that is allowed with constraints", async () => {
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner, { moderation: { decision: "allow_with_constraints", reason_code: null, constraints: ["adult_persona_only"], focus: "general" } });
    if (!result.ok) throw new Error("unreachable");
    expect(await attemptRow(result.attemptId)).toMatchObject({ moderationDecision: "allow_with_constraints", constraints: ["adult_persona_only"], outcome: "running" });
  });

  it("creates no session, no topic and no attempt that counts for a refused topic", async () => {
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner, { moderation: { decision: "refuse", reason_code: "real_org_or_brand", constraints: [], focus: "general" } }, { topic: "trải nghiệm thanh toán trên Shopee" });

    expect(result).toEqual({ ok: false, error: "refused" });
    expect(await sessionsOf(learner.id)).toEqual([]);
    expect(await customTopics()).toEqual([]);
    expect(await attemptsOf(learner.id)).toMatchObject([{ outcome: "refused", reasonCode: "real_org_or_brand", moderationDecision: "refuse", sessionId: null, topicId: null, costReservedUsd: 0 }]);
    // The refusal did not use one of today's three attempts.
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
  });

  it("holds a reply outside the closed sets to them: unknown focus, code and constraint", async () => {
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner, {
      moderation: { decision: "allow_with_constraints", reason_code: "made_up", constraints: ["speak_like_a_pirate", "no_crisis_content"], focus: "win_every_interview" },
    });
    if (!result.ok) throw new Error("unreachable");
    // One constraint could not be read, so the topic is generated under all of them.
    expect(await attemptRow(result.attemptId)).toMatchObject({
      focus: "general",
      constraints: ["adult_persona_only", "no_crisis_content", "service_use_only"],
      moderationDecision: "allow_with_constraints",
      reasonCode: null,
    });

    const other = await createLearner("lan@example.com");
    expect((await submit(other, { moderation: { decision: "refuse", reason_code: "made_up", constraints: [], focus: "x" } })).result).toEqual({ ok: false, error: "refused" });
    expect(await attemptsOf(other.id)).toMatchObject([{ outcome: "refused", reasonCode: "other", focus: "general" }]);
  });

  it.each([
    ["too short", { topic: "app" }],
    ["too long", { topic: "a".repeat(301) }],
    ["only spaces", { topic: "              " }],
    ["no topic", { topic: undefined }],
    ["a focus that is too long", { focus: "b".repeat(301) }],
    ["a retry id that is no id", { retryOf: "../../etc/passwd" }],
  ])("refuses input that is %s before any model is called", async (_name, body) => {
    const learner = await createLearner("minh@example.com");
    const { result, models } = await submit(learner, {}, body);
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(models.calls).toEqual([]);
    expect(await attemptsOf(learner.id)).toEqual([]);
  });

  it("trims the topic and accepts exactly 10 and exactly 300 characters", async () => {
    const short = await createLearner("a@example.com");
    expect((await submit(short, {}, { topic: "  0123456789  " })).result).toMatchObject({ ok: true });
    expect((await attemptsOf(short.id))[0].topicText).toBe("0123456789");
    const long = await createLearner("b@example.com");
    expect((await submit(long, {}, { topic: "c".repeat(300) })).result).toMatchObject({ ok: true });
  });

  it("creates nothing when the moderation call fails, and the learner can send again", async () => {
    const learner = await createLearner("minh@example.com");
    const { result, models } = await submit(learner, { override: { MODERATION: () => ({ error: new Error("provider down") }) } });

    expect(result).toEqual({ ok: false, error: "llm_failed" });
    expect(models.count("MODERATION")).toBe(3);
    expect(await attemptsOf(learner.id)).toEqual([]);
    expect(await sessionsOf(learner.id)).toEqual([]);
    expect((await submit(learner)).result).toMatchObject({ ok: true });
  });

  it("counts the moderation call under its own scope, not against the generation budget", async () => {
    const learner = await createLearner("minh@example.com");
    await submit(learner);
    const calls = await db().select().from(llmCalls);
    expect(calls.map((call) => [call.role, call.scope, call.sessionId, call.attemptId])).toEqual([["MODERATION", "moderation", null, null]]);
  });

  it("refuses a learner the auth server holds no Google identity for, before any model is called", async () => {
    const learner = await createLearner("ghost@example.com", undefined, { googleSubject: null });
    const { result, models } = await submit(learner);
    expect(result).toEqual({ ok: false, error: "no_identity" });
    expect(models.calls).toEqual([]);
  });

  it("starts another try of a failed topic inside the same custom topic, as a new session", async () => {
    const learner = await createLearner("minh@example.com");
    const first = await attempt(learner, INVALID);
    expect(first.outcome).toBe("failed");

    const { result } = await submit(learner, {}, { topic: `${TOPIC} (lần hai)`, retryOf: first.sessionId });
    if (!result.ok) throw new Error("unreachable");
    expect(result.sessionId).not.toBe(first.sessionId);
    expect(await customTopics()).toHaveLength(1);
    expect((await attemptRow(result.attemptId)).topicId).toBe((await attemptRow(first.attemptId)).topicId);
    expect((await sessionsOf(learner.id)).map((session) => session.status).sort()).toEqual(["failed_eval", "generating"]);
  });

  it("does not put a learner's try into someone else's topic when the retry id is theirs", async () => {
    const a = await createLearner("a@example.com");
    const failed = await attempt(a, INVALID);
    const b = await createLearner("b@example.com");

    const { result } = await submit(b, {}, { retryOf: failed.sessionId });
    if (!result.ok) throw new Error("unreachable");
    const topicsNow = await customTopics();
    expect(topicsNow).toHaveLength(2);
    expect((await attemptRow(result.attemptId)).topicId).not.toBe((await attemptRow(failed.attemptId)).topicId);
    expect(topicsNow.map((topic) => topic.ownerUserId).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("a custom scenario exists for its owner alone (FR-3, NFR-9)", () => {
  it("is found by the owner and by nobody else, on every path a learner route takes", async () => {
    const owner = await createLearner("a@example.com");
    const { sessionId, attemptId, outcome } = await attempt(owner);
    expect(outcome).toBe("passed");
    const personaId = `custom-${attemptId}`;
    const other = await createLearner("b@example.com");

    expect(await getVisibleScenario(db(), personaId, owner.id)).not.toBeNull();
    expect(await getPlayableScenario(db(), personaId, true, owner.id)).not.toBeNull();
    for (const viewer of [other.id, null]) {
      expect(await getVisibleScenario(db(), personaId, viewer)).toBeNull();
      expect(await getPlayableScenario(db(), personaId, false, viewer)).toBeNull();
      expect(await getPlayableScenario(db(), personaId, true, viewer)).toBeNull();
    }
    // The operator's lookup is not filtered: it is used by commands that write the access log.
    expect(await getScenarioByPersona(db(), personaId)).not.toBeNull();

    expect(await getAttemptView(db(), other, attemptId)).toBeNull();
    expect(await getAttemptView(db(), other, randomUUID())).toBeNull();
    expect(await getPendingCustomSession(db(), other.id, sessionId)).toBeNull();
    expect(await reportCustomProblem(db(), other, sessionId)).toBe(false);
    expect(await listSessions(db(), other)).toEqual({ items: [], nextOffset: null, total: 0 });
    const refused = await runTurn(db(), other, sessionId, { text: "Chị kể em nghe được không ạ?", expectedIndex: 1, turnKey: randomUUID() }, { llmDeps: dbModels().llmDeps });
    expect(refused).toEqual({ ok: false, error: "not_found" });
  });

  it("hides a session that is being prepared, and one that failed, from another learner", async () => {
    const owner = await createLearner("a@example.com");
    const other = await createLearner("b@example.com");
    const running = await submit(owner);
    if (!running.result.ok) throw new Error("unreachable");

    expect(await getPendingCustomSession(db(), owner.id, running.result.sessionId)).toMatchObject({ session: { status: "generating" } });
    expect(await getPendingCustomSession(db(), other.id, running.result.sessionId)).toBeNull();
    expect(await getAttemptView(db(), other, running.result.attemptId)).toBeNull();
    // The owner is told where it stands, and that a run should be started: nobody is working on it yet.
    expect(await getAttemptView(db(), owner, running.result.attemptId)).toEqual({
      due: true,
      status: { outcome: "running", step: "generating", sessionId: running.result.sessionId, personaId: null },
    });
  });
});

describe("the canary: the learner's own words about what to practise reach the moderation call and nothing else (FR-53)", () => {
  const CANARY = "canary-7f3a9c-em-hay-quen-hoi-tiep";

  it("is in no prompt, metadata or stored row outside the moderation call and the focus_raw column, through generation and a played session", async () => {
    const learner = await createLearner("minh@example.com");
    const models = dbModels({
      moderation: { decision: "allow", reason_code: null, constraints: [], focus: "follow_up" },
      override: {
        END_JUDGE: () => ({ structured: { last_turn_verdict: NO_VERDICT, canvas_matches: [] } }),
        FEEDBACK: () => ({ structured: { claims: [] } }),
        VERIFIER: () => ({ structured: { claims: [] } }),
      },
    });
    const options = { llmDeps: models.llmDeps };

    // Màn 10 → the pipeline → three turns → the end → the reveal, all with the same recording models.
    const submitted = await submitCustomTopic(db(), learner, { topic: TOPIC, focus: `Em muốn luyện ${CANARY} ạ` }, options);
    if (!submitted.ok) throw new Error("unreachable");
    expect(await runGeneration(db(), submitted.attemptId, options)).toBe("passed");
    for (let index = 1; index <= 3; index += 1) {
      const turn = await runTurn(db(), learner, submitted.sessionId, { text: "Chị kể thêm cho em nghe được không ạ?", expectedIndex: index, turnKey: randomUUID() }, options);
      expect(turn).toMatchObject({ ok: true });
    }
    expect(await endSession(db(), learner, submitted.sessionId, { canvasText: "ghi chú của em" })).toEqual({ ok: true });
    expect(await runReveal(db(), submitted.sessionId, options)).toBe("finalised");
    expect(await submitGuess(db(), learner, submitted.sessionId, { guess: 2 })).toEqual({ ok: true });

    // Every role the product has was called at least once in this run, the reveal included.
    const roles = new Set(models.calls.map((call) => call.role));
    for (const role of ["MODERATION", "SCENARIO_GENERATOR", "SAFETY", "ANALYSIS", "PERSONA", "END_JUDGE", "FEEDBACK", "VERIFIER"]) {
      expect(roles, role).toContain(role);
    }
    const carrying = models.calls.filter((call) => JSON.stringify([call.prompt, call.metadata, call.tags]).includes(CANARY));
    expect(carrying.map((call) => call.role)).toEqual(["MODERATION"]);
    // 1 moderation + 2 generation + 3 turns of 2 calls + 3 reveal calls.
    expect(models.calls).toHaveLength(12);

    // Stored: the one column, and nowhere else.
    const stored = {
      attempts: await db().select().from(generationAttempts),
      sessions: await db().select().from(sessions),
      topics: await db().select().from(topics),
      scenarios: await db().select().from(scenarios),
      turns: await db().select().from(turns),
      events: await db().select().from(events),
      llmCalls: await db().select().from(llmCalls),
    };
    expect(stored.attempts[0].focusRaw).toContain(CANARY);
    const withoutColumn = { ...stored, attempts: stored.attempts.map((row) => ({ ...row, focusRaw: "" })) };
    expect(JSON.stringify(withoutColumn)).not.toContain(CANARY);
    expect(stored.sessions[0].focus).toBe("follow_up");
  }, 60_000);
});

describe("reportCustomProblem (FR-56)", () => {
  it("marks the learner's own custom session once it has a reveal, and pressing again changes nothing", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    // Not before the reveal: the button is on Màn 6.
    expect(await reportCustomProblem(db(), learner, sessionId)).toBe(false);

    await db().update(sessions).set({ status: "revealed" }).where(eq(sessions.id, sessionId));
    expect(await reportCustomProblem(db(), learner, sessionId)).toBe(true);
    const [first] = await sessionsOf(learner.id);
    expect(first.problemReportedAt).not.toBeNull();
    expect(await reportCustomProblem(db(), learner, sessionId)).toBe(true);
    expect((await sessionsOf(learner.id))[0].problemReportedAt).toEqual(first.problemReportedAt);
    expect(await generatedScenarios()).toHaveLength(1);
  });

  it("does nothing for a session with an authored persona", async () => {
    const { startSession } = await import("../helpers/test-db");
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await db().update(sessions).set({ status: "done" }).where(eq(sessions.id, session.id));
    expect(await reportCustomProblem(db(), learner, session.id)).toBe(false);
  });
});
