import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { getConfig, setConfig } from "@/db/repo/config";
import { llmCalls } from "@/db/schema";
import type { AppUser } from "@/server/auth";
import { endSession } from "@/server/canvas";
import { canStartSession, sessionSpendToday } from "@/server/cost-cap";
import { startReplay } from "@/server/replay";
import { runReveal, submitGuess } from "@/server/reveal";
import { openSession, sessionEntryPath } from "@/server/sessions";
import { runTurn } from "@/server/turns";
import { addGenerationSpend, attempt, dbModels, sessionsOf, setBudget, submit } from "../helpers/custom-db";
import { replayTurn, revealedSession } from "../helpers/replay-fixtures";
import { endedSession, playTurns, revealModels, revealScript, sessionRow, turnRows } from "../helpers/session-fixtures";
import { PERSONA_ID, createLearner, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const DEMO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] };
const CAP_REACHED = { ok: false, reason: "cap_reached" };
const question = (index: number) => ({ text: "Chị kể thêm cho em nghe được không ạ?", expectedIndex: index, turnKey: randomUUID() });

const spend = (usd: number) =>
  db().insert(llmCalls).values({ scope: "session", role: "TEST_SPEND", model: "gpt-6-luna", tokensIn: 0, tokensOut: 0, tokensCached: 0, tokensReasoning: 0, costUsd: usd, latencyMs: 0, attempt: 1, ok: true });

/**
 * What an operator does to close the day: `il config set session_daily_cap_usd` to what learners
 * may spend, which is already spent. The demo reserve stays on top of it.
 */
async function lowerCapToCurrentSpend(): Promise<void> {
  // The scripted models of a test cost next to nothing: the day has a spend worth capping.
  await spend(0.25);
  const reserve = await getConfig(db(), "session_demo_reserve_usd");
  // To the cent below, as an operator types it: the learners' part of the cap is then spent already.
  const spentCents = Math.floor((await sessionSpendToday(db())) * 100) / 100;
  await setConfig(db(), "session_daily_cap_usd", spentCents + reserve, "admin@example.com");
}

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("FR-37: the session cap lowered to what the day has spent", () => {
  it("blocks a new session with the fixed message and writes nothing", async () => {
    await lowerCapToCurrentSpend();
    const learner = await createLearner("linh@example.com");

    const result = await openSession(db(), learner, PERSONA_ID);

    expect(result).toEqual(CAP_REACHED);
    expect(sessionEntryPath(result, PERSONA_ID)).toBe("/prep/chi-thu?blocked=cap");
    expect(await sessionsOf(learner.id)).toEqual([]);
  });

  it("blocks at spend equal to the learners' part of the cap, and opens when the cap is one cent higher", async () => {
    await lowerCapToCurrentSpend();
    const cap = await getConfig(db(), "session_daily_cap_usd");
    expect(await canStartSession(db(), false)).toBe(false);

    await setConfig(db(), "session_daily_cap_usd", cap + 0.01, "admin@example.com");
    expect(await canStartSession(db(), false)).toBe(true);
  });

  // Amounts whose `cap - reserve` is a hair above the spend in floating point (1.3 - 1 > 0.3).
  it.each([0.3, 0.55, 0.8, 1.1, 2.4])("blocks when exactly %s USD is spent and the cap is typed as that plus the reserve", async (spent) => {
    await spend(spent);
    await setConfig(db(), "session_daily_cap_usd", Number((spent + 1).toFixed(2)), "admin@example.com");

    expect(await sessionSpendToday(db())).toBeCloseTo(spent, 9);
    expect(await canStartSession(db(), false)).toBe(false);
    expect(await canStartSession(db(), true)).toBe(true);
  });

  it("lets an interview that is running go on to its last turn and its end", async () => {
    const learner = await createLearner("linh@example.com");
    const sessionId = (await startSession(learner)).id;
    await playTurns(learner, sessionId, [{}]);
    await lowerCapToCurrentSpend();

    // The session the learner has is handed back, not refused.
    expect(await openSession(db(), learner, PERSONA_ID)).toMatchObject({ ok: true, session: { id: sessionId } });
    const { llmDeps } = dbModels();
    expect(await runTurn(db(), learner, sessionId, question(2), { llmDeps })).toMatchObject({ ok: true, turnIndex: 2 });
    expect(await endSession(db(), learner, sessionId, { canvasText: "ghi chú" })).toEqual({ ok: true });
    // Another learner is refused all the while: the cap is about new sessions.
    expect(await openSession(db(), await createLearner("khac@example.com"), PERSONA_ID)).toEqual(CAP_REACHED);
  });

  it("lets a session that ended before the cap finish its reveal and its replay", async () => {
    const ended = await endedSession("an@example.com");
    const replaying = await revealedSession(undefined, undefined, undefined, "binh@example.com");
    expect(await startReplay(db(), replaying.learner, replaying.sessionId)).toEqual({ ok: true });
    await lowerCapToCurrentSpend();
    expect(await canStartSession(db(), false)).toBe(false);

    // Reveal: three more model calls, paid for after the cap.
    expect(await runReveal(db(), ended.sessionId, { llmDeps: revealModels(revealScript()).llmDeps })).toBe("finalised");
    expect(await submitGuess(db(), ended.learner, ended.sessionId, { guess: 4 })).toEqual({ ok: true });
    expect(await startReplay(db(), ended.learner, ended.sessionId)).toEqual({ ok: true });

    // Replay: every turn of it, to the result.
    for (const turn of [1, 2]) expect((await replayTurn(replaying.learner, replaying.sessionId, turn)).result).toMatchObject({ ok: true, replayTurnIndex: turn });
    expect((await replayTurn(replaying.learner, replaying.sessionId, 3)).result).toMatchObject({ ok: true, outcome: { result: "fail" } });
    expect((await sessionRow(replaying.sessionId)).status).toBe("done");

    // What they spent counts: the day is further over the limit, and still closed to new sessions.
    expect(await canStartSession(db(), false)).toBe(false);
  });

  it("still starts a demo account, until the reserve is spent as well", async () => {
    await lowerCapToCurrentSpend();
    const demo = await createLearner("demo@example.com", DEMO_LISTS);
    expect(demo.isDemo).toBe(true);

    expect(await openSession(db(), demo, PERSONA_ID)).toMatchObject({ ok: true, session: { isDemo: true, status: "interviewing" } });

    await spend(await getConfig(db(), "session_demo_reserve_usd"));
    expect(await canStartSession(db(), true)).toBe(false);
    // A demo account always gets a new session, and that one is refused too.
    expect(await openSession(db(), demo, PERSONA_ID)).toEqual(CAP_REACHED);
  });

  it("blocks a custom session at its first turn, with no model call, and not after it", async () => {
    const waiting = await createLearner("minh@example.com");
    const started = await createLearner("nga@example.com");
    const waitingSession = (await attempt(waiting)).sessionId;
    const startedSession = (await attempt(started)).sessionId;
    const models = dbModels();
    expect(await runTurn(db(), started, startedSession, question(1), { llmDeps: models.llmDeps })).toMatchObject({ ok: true, turnIndex: 1 });
    const callsBefore = models.calls.length;
    await lowerCapToCurrentSpend();

    expect(await runTurn(db(), waiting, waitingSession, question(1), { llmDeps: models.llmDeps })).toEqual({ ok: false, error: "cap_reached" });
    expect(models.calls).toHaveLength(callsBefore);
    expect(await turnRows(waitingSession)).toHaveLength(1);
    expect(await sessionRow(waitingSession)).toMatchObject({ status: "interviewing", endedAt: null, turnClaim: null });

    // The one that had its first turn is a running session like any other.
    expect(await runTurn(db(), started, startedSession, question(2), { llmDeps: models.llmDeps })).toMatchObject({ ok: true, turnIndex: 2 });
  });

  it("opens again when the cap is raised: the custom session waiting at turn 0 takes its first question", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    await lowerCapToCurrentSpend();
    const { llmDeps } = dbModels();
    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps })).toEqual({ ok: false, error: "cap_reached" });

    await setConfig(db(), "session_daily_cap_usd", 100, "admin@example.com");

    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps })).toMatchObject({ ok: true, turnIndex: 1 });
    expect(await openSession(db(), await createLearner("linh@example.com"), PERSONA_ID)).toMatchObject({ ok: true });
  });
});

describe("FR-56: the generation budget is apart from the session cap", () => {
  const blocked = (learner: AppUser) => submit(learner).then(({ result }) => result);

  it("blocks new attempts when it is spent, and leaves sessions alone", async () => {
    await setBudget(1, 0.1);
    await addGenerationSpend(0.95);
    const learner = await createLearner("minh@example.com");

    expect(await blocked(learner)).toMatchObject({ ok: false, error: "blocked", block: "budget_exhausted" });

    expect(await sessionSpendToday(db())).toBe(0);
    expect(await canStartSession(db(), false)).toBe(true);
    const session = await startSession(learner);
    await playTurns(learner, session.id, [{}]);
    expect(await turnRows(session.id)).toHaveLength(2);
  });

  it("does not block attempts when it is the session cap that is reached", async () => {
    await lowerCapToCurrentSpend();
    const learner = await createLearner("minh@example.com");

    expect(await openSession(db(), learner, PERSONA_ID)).toEqual(CAP_REACHED);
    // The scenario is made; its session then waits at the first turn, as above.
    const { sessionId, outcome } = await attempt(learner);
    expect(outcome).toBe("passed");
    expect(await runTurn(db(), learner, sessionId, question(1), { llmDeps: dbModels().llmDeps })).toEqual({ ok: false, error: "cap_reached" });
  });
});
