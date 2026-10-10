import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { loadReplay } from "@/db/repo/replay";
import { getSession, hasGeneratingSession, listTurns } from "@/db/repo/sessions";
import { events, llmCalls, sessions } from "@/db/schema";
import { getReplayTranscriptView, skipReplay, startReplay, stopReplay } from "@/server/replay";
import { getRevealView, getTranscriptView, recordTakeawayDownload } from "@/server/reveal";
import { SESSION_PAGE_SIZE, listSessions } from "@/server/session-list";
import { buildSessionView } from "@/server/session-view";
import { openSession } from "@/server/sessions";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { runUnpublish } from "../../cli/commands/publish";
import { chiThu } from "../helpers/engine-fixtures";
import { replayTurn, revealedSession } from "../helpers/replay-fixtures";
import { NO_REPLAY, agreeAll, endedSession, judgeStep, noClaims, sessionRow } from "../helpers/session-fixtures";
import { PERSONA_FILE, PERSONA_ID, createLearner, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const DEMO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] };
const TOPIC = "Chi tiêu hằng ngày của người trẻ đi làm";
const silent = { out: () => {}, err: () => {} };
const sealedStrings = chiThu.items.flatMap((item) => [item.content, item.sample_question, item.topic_tag, item.hook_line]);

beforeEach(resetDatabase);

describe("listSessions: whose, and in what order", () => {
  it("is empty for a learner who has not practised", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await listSessions(db(), learner)).toEqual({ items: [], nextOffset: null, total: 0 });
  });

  it("lists a learner's own sessions only", async () => {
    const linh = await createLearner("linh@example.com");
    const an = await createLearner("an@example.com");
    const own = await startSession(linh);
    await startSession(an);

    const page = await listSessions(db(), linh);

    expect(page).toMatchObject({ total: 1, nextOffset: null });
    expect(page.items).toMatchObject([{ id: own.id, personaName: "Chị Thu", topicTitle: TOPIC, state: "in_progress", result: null }]);
    expect(page.items[0].date).toMatch(/^\d{2}\/\d{2}$/u);
  });

  it("is newest first, twenty at a time, and the pages together hold every session once", async () => {
    const demo = await createLearner("demo@example.com", DEMO_LISTS);
    const started: string[] = [];
    for (let count = 0; count < SESSION_PAGE_SIZE * 2 + 3; count += 1) started.push((await startSession(demo)).id);
    const newestFirst = [...started].reverse();

    const first = await listSessions(db(), demo);
    const second = await listSessions(db(), demo, first.nextOffset!);
    const third = await listSessions(db(), demo, second.nextOffset!);

    expect(first).toMatchObject({ total: 43, nextOffset: 20 });
    expect(second).toMatchObject({ total: 43, nextOffset: 40 });
    expect(third).toMatchObject({ total: 43, nextOffset: null });
    expect(first.items).toHaveLength(SESSION_PAGE_SIZE);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(newestFirst);
    // Past the end there is nothing, and no next page.
    expect(await listSessions(db(), demo, 43)).toEqual({ items: [], nextOffset: null, total: 43 });
  });

  it("says a page is the last one when it holds exactly the twentieth session", async () => {
    const demo = await createLearner("demo@example.com", DEMO_LISTS);
    for (let count = 0; count < SESSION_PAGE_SIZE; count += 1) await startSession(demo);

    expect(await listSessions(db(), demo)).toMatchObject({ total: 20, nextOffset: null });
  });
});

describe("listSessions: the numbers are for a finished session only (FR-39)", () => {
  it("sends no number and nothing sealed while the session is not done, at every step on the way", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    const sent = async () => {
      const page = await listSessions(db(), learner);
      expect(page.items).toMatchObject([{ id: sessionId, state: "in_progress", result: null }]);
      const text = JSON.stringify(page);
      expect(text).not.toMatch(/told|recognized/u);
      for (const sealed of sealedStrings) expect(text).not.toContain(sealed);
    };

    await sent(); // ended, no guess
    await db().update(sessions).set({ status: "revealed", guess: 4, revealedAt: new Date() }).where(eq(sessions.id, sessionId));
    await sent(); // guessed, result being computed
  });

  it("revealed with the replay on offer, then replaying: still no number, though the result is stored", async () => {
    const { learner, sessionId } = await revealedSession();
    expect((await sessionRow(sessionId)).revealJson).not.toBeNull();

    expect((await listSessions(db(), learner)).items).toMatchObject([{ state: "in_progress", result: null }]);
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: true });
    await replayTurn(learner, sessionId, 1);
    const page = await listSessions(db(), learner);

    expect(page.items).toMatchObject([{ state: "in_progress", result: null }]);
    for (const sealed of sealedStrings) expect(JSON.stringify(page)).not.toContain(sealed);
  });

  it("done: the two numbers of the main interview, the same ones the review shows", async () => {
    const { learner, sessionId } = await revealedSession();
    await skipReplay(db(), learner, sessionId);
    const stored = (await sessionRow(sessionId)).revealJson!;

    const [item] = (await listSessions(db(), learner)).items;
    const review = await getRevealView(db(), learner, sessionId);

    expect(item).toMatchObject({ state: "done", result: { told: 2, total: 11, recognized: { state: "count", value: stored.counts.recognizedFull } } });
    expect(review).toMatchObject({ ready: true, reveal: { mode: "done", told: item.result!.told, total: item.result!.total, recognized: item.result!.recognized } });
  });

  it("done after a replay that opened its target: the numbers are still those of the main interview", async () => {
    const { learner, sessionId } = await revealedSession();
    await startReplay(db(), learner, sessionId);
    const { result } = await replayTurn(learner, sessionId, 1, {
      analysis: { hook_id: "H2", label: "confirm_grounded", grounded_turn_id: 2 },
      judge: [{ structured: { prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: ["I2"], violations: [] }, label: "open", introduced_span: null } }],
    });
    expect(result).toMatchObject({ ok: true, outcome: { result: "success" } });

    const [item] = (await listSessions(db(), learner)).items;

    // Two items were told in the interview; the one opened in the replay is not added to them.
    expect(item).toMatchObject({ state: "done", result: { told: 2, total: 11 } });
  });

  it("done with empty notes says so, and done with unreadable notes sends KHAI THÁC alone", async () => {
    const empty = await revealedSession(NO_REPLAY, "", { END_JUDGE: [judgeStep("", [])], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] }, "trong@example.com");
    const failed = { error: new Error("judge down") };
    const ungraded = await revealedSession(NO_REPLAY, "ghi vội", { END_JUDGE: [failed, failed, failed], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] }, "loi@example.com");

    expect((await listSessions(db(), empty.learner)).items).toMatchObject([{ state: "done", result: { told: 1, total: 11, recognized: { state: "empty" } } }]);
    expect((await listSessions(db(), ungraded.learner)).items).toMatchObject([{ state: "done", result: { told: 1, total: 11, recognized: { state: "ungraded" } } }]);
  });
});

describe("a withdrawn session", () => {
  it("unpublish --stop-sessions: the list says it was stopped, its page is the read-only transcript, and it no longer counts", async () => {
    const learner = await createLearner("linh@example.com");
    const { learner: finished, sessionId: finishedId } = await revealedSession(NO_REPLAY, "", { END_JUDGE: [judgeStep("", [])], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] }, "xong@example.com");
    const session = await startSession(learner);

    expect(await runUnpublish([PERSONA_ID, "--stop-sessions"], silent, db(), () => "admin@example.com")).toBe(0);

    expect((await listSessions(db(), learner)).items).toMatchObject([{ id: session.id, state: "withdrawn", result: null }]);
    const found = (await getSession(db(), learner.id, session.id))!;
    const view = buildSessionView({ ...found, topicTitle: found.topic.title, turns: await listTurns(db(), learner.id, session.id), waitlisted: false, next: { kind: "all_practised" } });
    expect(view).toMatchObject({ screen: "withdrawn", personaName: "Chị Thu", topicTitle: TOPIC, turnCount: 0 });
    // A session that was already finished keeps its result.
    expect((await listSessions(db(), finished)).items).toMatchObject([{ id: finishedId, state: "done", result: { told: 1 } }]);

    // The persona comes back as a new version: the learner whose session was stopped starts again.
    await importScenarioFile(db(), PERSONA_FILE);
    const again = await openSession(db(), learner, PERSONA_ID);
    expect(again).toMatchObject({ ok: true });
    expect((await listSessions(db(), learner)).items.map((item) => item.state)).toEqual(["in_progress", "withdrawn"]);
    // The learner who finished has had their one session: the new version opens no second one.
    expect(await openSession(db(), finished, PERSONA_ID)).toMatchObject({ ok: true, session: { id: finishedId } });
    expect(await db().select().from(sessions).where(eq(sessions.userId, finished.id))).toHaveLength(1);
  });
});

describe("one session per persona across versions (FR-5)", () => {
  it.each(["interviewing", "done"] as const)("a new version of the persona opens no second session for a learner whose session is %s", async (status) => {
    const learner = await createLearner("linh@example.com");
    const first = await startSession(learner);
    await db().update(sessions).set({ status }).where(eq(sessions.id, first.id));

    await importScenarioFile(db(), PERSONA_FILE); // version 2

    expect(await openSession(db(), learner, PERSONA_ID)).toMatchObject({ ok: true, session: { id: first.id, scenarioId: first.scenarioId } });
    expect(await db().select().from(sessions)).toHaveLength(1);
    // A learner who has not played starts on the new version.
    const other = await startSession(await createLearner("an@example.com"));
    expect(other.scenarioId).not.toBe(first.scenarioId);
  });
});

describe("the review of a finished session (FR-40)", () => {
  it("makes no model call, however often it is opened", async () => {
    const { learner, sessionId } = await revealedSession();
    await startReplay(db(), learner, sessionId);
    await replayTurn(learner, sessionId, 1);
    await skipReplayOrStop(learner, sessionId);
    const callsBefore = await db().select().from(llmCalls);
    const rowBefore = JSON.stringify(await sessionRow(sessionId));

    for (let visit = 0; visit < 3; visit += 1) {
      const found = (await getSession(db(), learner.id, sessionId))!;
      const view = buildSessionView({
        ...found,
        topicTitle: found.topic.title,
        turns: await listTurns(db(), learner.id, sessionId),
        waitlisted: false, next: { kind: "all_practised" },
        replay: await loadReplay(db(), sessionId),
      });
      expect(view).toMatchObject({ screen: "reveal", reveal: { mode: "done" } });
      expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ ready: true });
      expect(await getTranscriptView(db(), learner, sessionId)).toHaveLength(7);
      expect(await getReplayTranscriptView(db(), learner, sessionId)).toHaveLength(1);
      await listSessions(db(), learner);
    }

    expect(await db().select().from(llmCalls)).toEqual(callsBefore);
    expect(JSON.stringify(await sessionRow(sessionId))).toBe(rowBefore);
  });
});

/** Ends the replay the way "Dừng" does. */
async function skipReplayOrStop(learner: Parameters<typeof skipReplay>[1], sessionId: string) {
  expect(await stopReplay(db(), learner, sessionId)).toMatchObject({ ok: true });
  expect((await sessionRow(sessionId)).status).toBe("done");
}

describe("hasGeneratingSession", () => {
  it("is true only while one of the learner's own sessions is being prepared", async () => {
    const learner = await createLearner("linh@example.com");
    const other = await createLearner("an@example.com");
    const session = await startSession(learner);
    const theirs = await startSession(other);
    expect(await hasGeneratingSession(db(), learner.id)).toBe(false);

    await db().update(sessions).set({ status: "generating" }).where(eq(sessions.id, theirs.id));
    expect(await hasGeneratingSession(db(), learner.id)).toBe(false);

    await db().update(sessions).set({ status: "generating" }).where(eq(sessions.id, session.id));
    expect(await hasGeneratingSession(db(), learner.id)).toBe(true);
  });
});

describe("recordTakeawayDownload", () => {
  const downloads = async () => (await db().select().from(events)).filter((event) => event.name === "takeaway_downloaded");

  it("writes one event per press, for the owner of a finished session", async () => {
    const { learner, sessionId } = await revealedSession();
    await skipReplay(db(), learner, sessionId);

    expect(await recordTakeawayDownload(db(), learner, sessionId)).toBe("recorded");
    expect(await recordTakeawayDownload(db(), learner, sessionId)).toBe("recorded");

    expect(await downloads()).toMatchObject([
      { userId: learner.id, sessionId, props: {} },
      { userId: learner.id, sessionId, props: {} },
    ]);
  });

  it("writes nothing while the sheet cannot be taken away yet, or for a session of someone else", async () => {
    const { learner, sessionId } = await revealedSession();
    const other = await createLearner("an@example.com");

    expect(await recordTakeawayDownload(db(), learner, sessionId)).toBe("not_done");
    await skipReplay(db(), learner, sessionId);
    expect(await recordTakeawayDownload(db(), other, sessionId)).toBe("not_found");

    expect(await downloads()).toEqual([]);
  });

  it("writes nothing for a demo session", async () => {
    const demo = await createLearner("demo@example.com", DEMO_LISTS);
    const session = await startSession(demo);
    await db().update(sessions).set({ status: "done" }).where(eq(sessions.id, session.id));

    expect(await recordTakeawayDownload(db(), demo, session.id)).toBe("recorded");
    expect(await downloads()).toEqual([]);
  });
});
