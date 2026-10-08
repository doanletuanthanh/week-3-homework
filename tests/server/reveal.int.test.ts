import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { isOnWaitlist, joinWaitlist } from "@/db/repo/waitlist";
import { llmCalls, sessions, snapshots, waitlist } from "@/db/schema";
import { endSession, freezeAbandonedCanvas } from "@/server/canvas";
import { getRevealView, getTranscriptView, runReveal, submitGuess } from "@/server/reveal";
import { DROPPED, a, chiThu } from "../helpers/engine-fixtures";
import { NOTES } from "../helpers/reveal-fixtures";
import {
  NO_REPLAY,
  PLAYED,
  agreeAll,
  endedSession,
  eventRows,
  failing,
  generatorStep,
  judgeStep,
  noClaims,
  playTurns,
  revealCalls,
  revealModels,
  revealScript,
  sessionRow,
  turnRows,
} from "../helpers/session-fixtures";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const target = chiThu.items.find((item) => item.id === "paid-app")!;
const countCalls = async () => (await db().select().from(llmCalls)).length;

beforeEach(async () => {
  await resetDatabase();
});

describe("runReveal: the three calls and the stored result", () => {
  it("makes exactly three logical calls after the session ends, in order, and stores the result once", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const models = revealModels(revealScript());

    expect(await runReveal(db(), sessionId, { llmDeps: models.llmDeps })).toBe("finalised");

    expect((await revealCalls(sessionId)).map((row) => [row.role, row.attempt, row.ok, row.scope, row.turnIndex])).toEqual([
      ["END_JUDGE", 1, true, "session", null],
      ["FEEDBACK", 1, true, "session", null],
      ["VERIFIER", 1, true, "session", null],
    ]);
    const session = await sessionRow(sessionId);
    expect(session.revealReadyAt).not.toBeNull();
    expect(session.revealRunToken).toBeNull();
    expect(session.revealRunAttempt).toBe(1);
    expect(Object.keys(session.revealParts).sort()).toEqual(["generator", "judge", "verifier"]);
    expect(session.revealJson).toMatchObject({
      replay: { level: "primary", forkAfterTurn: 2, targetItemId: "paid-app" },
      failed: { judge: false, generator: false, verifier: false },
      counts: { told: 2, total: 11, revealedCount: 4, recognizedFull: 2 },
      diagnosisKey: "heard_not_followed",
    });
    // The guess is not stored yet: the session waits on the guess screen.
    expect(session.status).toBe("interviewing");
    expect(session.guess).toBeNull();
  });

  it("needs no browser: the result is stored though nobody asked for it", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });

    // The learner comes back later and sends the guess: the result is already there.
    expect(await submitGuess(db(), learner, sessionId, { guess: 5 })).toEqual({ ok: true });
    expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ found: true, ready: true, reveal: { guess: 5, told: 2 } });
  });

  it("writes the end judge's verdict about the last persona turn to that turn and its snapshot", async () => {
    const { sessionId } = await endedSession("linh@example.com", [
      { analysis: { topic_tags: [a("tag", "money-home")] } },
      { analysis: { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "paid-app")] } },
    ]);
    expect((await turnRows(sessionId))[2]).toMatchObject({ hookSelected: "paid-app", verdictJson: null });

    const verdict = { hook_dropped: true, disclosed_item_ids: [a("item", "money-home")], violations: [a("doNotAssert", "shame")] };
    const models = revealModels({ END_JUDGE: [judgeStep(NOTES, [], verdict)], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] });
    await runReveal(db(), sessionId, { llmDeps: models.llmDeps });

    const [, , last] = await turnRows(sessionId);
    expect(last.verdictJson).toEqual({ hook_dropped: true, disclosed_item_ids: ["money-home"], violations: [chiThu.items.find((item) => item.id === "shame")!.do_not_assert.id] });
    expect(last.flagged).toBe(true);
    const [snapshot] = await db().select().from(snapshots).where(eq(snapshots.sessionId, sessionId)).orderBy(snapshots.index).offset(2);
    expect(snapshot.ledger).toMatchObject([{ itemId: "paid-app", droppedAt: 2 }]);
    expect(snapshot.disclosed).toEqual([{ itemId: "money-home", turn: 2 }]);
    expect((await sessionRow(sessionId)).revealJson!.counts).toMatchObject({ told: 1, revealedCount: 2 });
  });

  it("degrades instead of failing when a call fails after two retries, and still makes the other calls", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    const models = revealModels({ END_JUDGE: failing(), FEEDBACK: [generatorStep()], VERIFIER: [agreeAll()] });

    expect(await runReveal(db(), sessionId, { llmDeps: models.llmDeps })).toBe("finalised");

    expect((await revealCalls(sessionId)).map((row) => [row.role, row.attempt, row.ok])).toEqual([
      ["END_JUDGE", 1, false],
      ["END_JUDGE", 2, false],
      ["END_JUDGE", 3, false],
      ["FEEDBACK", 1, true],
      ["VERIFIER", 1, true],
    ]);
    await submitGuess(db(), learner, sessionId, { guess: 1 });
    const view = await getRevealView(db(), learner, sessionId);
    expect(view).toMatchObject({ ready: true, reveal: { recognized: { state: "ungraded" }, told: 2, notes: [{ text: NOTES, match: null }] } });
  });

  it("starts from the notes the fallback froze when the browser never sent the end request", async () => {
    const learner = await createLearner("linh@example.com");
    const sessionId = (await startSession(learner)).id;
    await playTurns(learner, sessionId, NO_REPLAY);
    await db().update(sessions).set({ endedAt: new Date(Date.now() - 120_000), canvasText: "ghi vội" }).where(eq(sessions.id, sessionId));

    // Not frozen yet: there is nothing to reveal.
    expect(await runReveal(db(), sessionId, { llmDeps: revealModels({}).llmDeps })).toBe("not_claimed");
    expect(await freezeAbandonedCanvas(db(), sessionId)).toBe(true);
    const models = revealModels({ END_JUDGE: [judgeStep("ghi vội", [])], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] });
    expect(await runReveal(db(), sessionId, { llmDeps: models.llmDeps })).toBe("finalised");
    expect(models.prompts("END_JUDGE")[0]).toContain("<ghi_chu>\n0:ghi 1:vội\n</ghi_chu>");
  });

  it("does not start for a session that is still being interviewed or was withdrawn", async () => {
    const learner = await createLearner("linh@example.com");
    const sessionId = (await startSession(learner)).id;
    await playTurns(learner, sessionId, NO_REPLAY);
    const none = revealModels({}).llmDeps;
    expect(await runReveal(db(), sessionId, { llmDeps: none })).toBe("not_claimed");

    const ended = await endedSession("minh@example.com", NO_REPLAY);
    await db().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, ended.sessionId));
    expect(await runReveal(db(), ended.sessionId, { llmDeps: none })).toBe("not_claimed");
    expect(await runReveal(db(), "00000000-0000-4000-8000-000000000000", { llmDeps: none })).toBe("not_claimed");
  });
});

describe("the guess (FR-18)", () => {
  it("is stored once, moves the session to revealed, and a second guess changes nothing", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");

    expect(await submitGuess(db(), learner, sessionId, { guess: 7 })).toEqual({ ok: true });
    const first = await sessionRow(sessionId);
    expect(first).toMatchObject({ guess: 7, status: "revealed" });
    expect(first.revealedAt).not.toBeNull();

    expect(await submitGuess(db(), learner, sessionId, { guess: 2 })).toEqual({ ok: true });
    const second = await sessionRow(sessionId);
    expect(second.guess).toBe(7);
    expect(second.revealedAt).toEqual(first.revealedAt);
  });

  it.each([
    ["more than the persona holds", { guess: 12 }],
    ["a negative number", { guess: -1 }],
    ["a fraction", { guess: 2.5 }],
    ["text", { guess: "7" }],
    ["nothing", {}],
    ["no body", null],
  ])("refuses %s", async (_name, body) => {
    const { learner, sessionId } = await endedSession("linh@example.com", NO_REPLAY);
    expect(await submitGuess(db(), learner, sessionId, body)).toEqual({ ok: false, error: "invalid_input" });
    expect((await sessionRow(sessionId)).guess).toBeNull();
  });

  it("accepts both ends of the slider", async () => {
    const low = await endedSession("linh@example.com", NO_REPLAY);
    expect(await submitGuess(db(), low.learner, low.sessionId, { guess: 0 })).toEqual({ ok: true });
    const high = await endedSession("minh@example.com", NO_REPLAY);
    expect(await submitGuess(db(), high.learner, high.sessionId, { guess: 11 })).toEqual({ ok: true });
  });

  it("refuses a guess before the session has ended, and for a session of someone else", async () => {
    const learner = await createLearner("linh@example.com");
    const sessionId = (await startSession(learner)).id;
    await playTurns(learner, sessionId, NO_REPLAY);
    expect(await submitGuess(db(), learner, sessionId, { guess: 1 })).toEqual({ ok: false, error: "not_ended" });

    const other = await endedSession("minh@example.com", NO_REPLAY);
    expect(await submitGuess(db(), learner, other.sessionId, { guess: 1 })).toEqual({ ok: false, error: "not_found" });
    expect((await sessionRow(other.sessionId)).guess).toBeNull();
  });

  it("never reaches a model: the three prompts are the same whatever the guess, and whether it came first or last", async () => {
    const prompts = async (email: string, guess: number | null) => {
      const { learner, sessionId } = await endedSession(email);
      if (guess !== null) await submitGuess(db(), learner, sessionId, { guess });
      const models = revealModels(revealScript());
      await runReveal(db(), sessionId, { llmDeps: models.llmDeps });
      return [models.prompts("END_JUDGE"), models.prompts("FEEDBACK"), models.prompts("VERIFIER")];
    };
    const before = await prompts("linh@example.com", null);
    expect(await prompts("minh@example.com", 0)).toEqual(before);
    expect(await prompts("an@example.com", 11)).toEqual(before);
  });
});

describe("what leaves the server, and when", () => {
  it("sends nothing of the reveal before the guess is stored, even when the result is ready", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });

    expect(await getRevealView(db(), learner, sessionId)).toEqual({ found: true, ready: false, due: false });
    const transcript = await getTranscriptView(db(), learner, sessionId);
    expect(transcript!.every((turn) => turn.leading === null)).toBe(true);
  });

  it("says the result is not ready, and that a runner is due, while nothing is computing it", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    expect(await getRevealView(db(), learner, sessionId)).toEqual({ found: true, ready: false, due: true });
  });

  it("sends the sealed reveal once both exist, and writes one reveal event with the true numbers", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });
    expect(await eventRows(sessionId, "reveal")).toEqual([]);

    await submitGuess(db(), learner, sessionId, { guess: 7 });

    const view = await getRevealView(db(), learner, sessionId);
    expect(view).toMatchObject({ ready: true, reveal: { mode: "offer", guess: 7, told: 2, total: 11, held: 1, recognized: { state: "count", value: 1 } } });
    expect(JSON.stringify(view)).not.toContain(target.content);
    expect((await sessionRow(sessionId)).status).toBe("revealed");

    const [event, ...more] = await eventRows(sessionId, "reveal");
    expect(more).toEqual([]);
    // NHẬN BIẾT in the event is the true count, with the held item: the screen showed one less.
    expect(event.props).toEqual({ guess: 7, told: 2, recognized: 2, total: 11, revealed_count: 4, replay_level: "primary", latency_ms: 0 });
    expect(event.userId).toBe(learner.id);
  });

  it("marks leading turns in the transcript only after the guess, and never the turn the replay is about", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });
    await submitGuess(db(), learner, sessionId, { guess: 7 });

    const transcript = (await getTranscriptView(db(), learner, sessionId))!;
    expect(transcript.filter((turn) => turn.leading !== null).map((turn) => [turn.index, turn.learnerText!.slice(turn.leading!.start, turn.leading!.end)])).toEqual([[4, "tại chị lười"]]);
    expect(Object.keys(transcript[0]).sort()).toEqual(["index", "leading", "learnerText", "personaText"]);
  });

  it("does not show another learner the reveal or the transcript", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });
    await submitGuess(db(), learner, sessionId, { guess: 7 });
    const other = await createLearner("minh@example.com");

    expect(await getRevealView(db(), other, sessionId)).toEqual({ found: false });
    expect(await getTranscriptView(db(), other, sessionId)).toBeNull();
  });

  it("reopening a revealed session calls no model", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });
    await submitGuess(db(), learner, sessionId, { guess: 7 });
    const before = await countCalls();
    const stored = (await sessionRow(sessionId)).revealJson;

    // A model with no scripted reply fails the test if anything calls it.
    const none = revealModels({});
    for (let visit = 0; visit < 3; visit += 1) {
      expect((await getRevealView(db(), learner, sessionId)).found).toBe(true);
      await getTranscriptView(db(), learner, sessionId);
      expect(await runReveal(db(), sessionId, { llmDeps: none.llmDeps })).toBe("not_claimed");
    }
    expect(await countCalls()).toBe(before);
    expect(none.records).toEqual([]);
    expect((await sessionRow(sessionId)).revealJson).toEqual(stored);
  });

  it("writes no reveal event for a demo session", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    const sessionId = (await startSession(demo)).id;
    await playTurns(demo, sessionId, PLAYED);
    await endSession(db(), demo, sessionId, { canvasText: NOTES });
    await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps });
    await submitGuess(db(), demo, sessionId, { guess: 3 });

    expect((await sessionRow(sessionId)).status).toBe("revealed");
    expect(await eventRows(sessionId, "reveal")).toEqual([]);
  });
});

describe("waitlist (FR-32)", () => {
  it("records a learner once per context, however often they ask", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await isOnWaitlist(db(), learner.id, "no_more_personas")).toBe(false);

    await joinWaitlist(db(), learner.id, "no_more_personas");
    const [first] = await db().select().from(waitlist);
    await joinWaitlist(db(), learner.id, "no_more_personas");

    expect(await db().select().from(waitlist)).toEqual([first]);
    expect(first).toMatchObject({ userId: learner.id, context: "no_more_personas" });
    expect(await isOnWaitlist(db(), learner.id, "no_more_personas")).toBe(true);
    expect(await isOnWaitlist(db(), (await createLearner("minh@example.com")).id, "no_more_personas")).toBe(false);
  });
});
