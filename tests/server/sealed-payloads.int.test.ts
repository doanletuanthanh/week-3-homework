import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getSession, listTurns } from "@/db/repo/sessions";
import { sessions, type SESSION_STATUSES } from "@/db/schema";
import { toBrowserResult } from "@/engine/seal";
import type { ScenarioItem } from "@/scenario/schema";
import type { AppUser } from "@/server/auth";
import { getRevealView, getTranscriptView, runReveal, submitGuess } from "@/server/reveal";
import { buildSessionView } from "@/server/session-view";
import { runTurn } from "@/server/turns";
import { DROPPED, a, chiThu } from "../helpers/engine-fixtures";
import { NOTES } from "../helpers/reveal-fixtures";
import { LEADING_ONLY, PLAYED, agreeAll, endedSession, judgeStep, revealModels, sessionRow, type ScriptedTurn } from "../helpers/session-fixtures";
import type { ScriptedStep } from "../helpers/scripted-model";
import { resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const target = chiThu.items.find((item) => item.id === "paid-app")!;

/** Everything authored about an item that a payload could carry: none of it may be there while the item is sealed. */
const sealedStringsOf = (item: ScenarioItem) => [item.content, item.sample_question, item.topic_tag, item.do_not_assert.text, `"${item.id}"`, `"${item.do_not_assert.id}"`];
const leaked = (payload: unknown) => sealedStringsOf(target).filter((text) => JSON.stringify(payload).includes(text));

type Fixture = {
  name: string;
  script: ScriptedTurn[];
  notes: string;
  noted: [string, string][];
  /** One claim per slot the session opens. */
  claims: ScriptedStep;
  /** Claim texts that must not reach the browser before the replay ends. */
  sealedTexts: string[];
};

const claim = (slot: string, text: string, turns: number[], extra: object = {}) => ({ slot, text, cited_turns: turns, item_id: null, canvas_range: null, suggested_question: null, ...extra });

// Three sessions whose replay target is paid-app, each with notes that match it (PRD §12.2 item 5).
const PRIMARY: Fixture[] = [
  {
    name: "told items, a leading turn elsewhere",
    script: PLAYED,
    notes: NOTES,
    noted: [
      ["mỗi tháng gửi ba mẹ 3 triệu", "money-home"],
      ["đang trả phí cho một app mà không dùng?", "paid-app"],
    ],
    claims: {
      structured: {
        claims: [
          claim("S1", "Lời khen có căn cứ.", [3]),
          claim("S2", "Nhận xét về câu hỏi tương lai.", [5, 6], { suggested_question: "Lần gần nhất là khi nào ạ?" }),
          // The generator names the sealed item though it was told not to: code seals the claim.
          claim("S3", "NHẬN XÉT NHẮC ĐIỀU ĐANG GIỮ.", [4], { item_id: a("item", "paid-app"), suggested_question: "Vì sao chị dừng ạ?" }),
          // The habit card counts the target's ignored hook (turn 3), though it cites another turn only.
          claim("S4", "THẺ THÓI QUEN TẢ LẠI HOOK.", [4]),
        ],
      },
    },
    sealedTexts: ["NHẬN XÉT NHẮC ĐIỀU ĐANG GIỮ.", "THẺ THÓI QUEN TẢ LẠI HOOK."],
  },
  {
    name: "a second ignored hook with a note comment",
    script: [
      { analysis: { topic_tags: [a("tag", "paid-app")] } },
      { analysis: { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "small-spend")] } },
      { analysis: { prev_turn_verdict: DROPPED } },
    ],
    notes: "app trả phí bỏ không\nkhoản lặt vặt không ghi",
    noted: [
      ["app trả phí bỏ không", "paid-app"],
      ["khoản lặt vặt không ghi", "small-spend"],
    ],
    claims: {
      structured: {
        claims: [
          claim("S1", "Bạn đã ghi lại điều này.", [3], { canvas_range: [5, 9], item_id: a("item", "small-spend"), suggested_question: "Chị nói số không khớp, là sao ạ?" }),
          claim("S2", "THẺ THÓI QUEN CỦA BUỔI HAI.", [2, 3]),
        ],
      },
    },
    sealedTexts: ["THẺ THÓI QUEN CỦA BUỔI HAI."],
  },
  {
    name: "the hook turn is itself a leading turn",
    script: [
      { analysis: { topic_tags: [a("tag", "paid-app")], label: "leading", introduced_span: [0, 1] } },
      { analysis: { prev_turn_verdict: DROPPED } },
      { analysis: { label: "leading", introduced_span: [2, 3] } },
    ],
    notes: "có vẻ đang trả tiền cho app nào đó",
    noted: [["đang trả tiền cho app nào đó", "paid-app"]],
    claims: { structured: { claims: [claim("S1", "NHẬN XÉT TRÍCH LƯỢT THẢ HOOK.", [1, 3], { suggested_question: "Chị ghi thế nào ạ?" })] } },
    sealedTexts: ["NHẬN XÉT TRÍCH LƯỢT THẢ HOOK."],
  },
];

const FALLBACK: Fixture = {
  name: "fallback 1",
  script: LEADING_ONLY,
  notes: "ghi vội vài dòng",
  noted: [],
  claims: { structured: { claims: [claim("S1", "NHẬN XÉT TRÍCH LƯỢT L.", [1, 3], { suggested_question: "Chị ghi thế nào ạ?" })] } },
  sealedTexts: ["NHẬN XÉT TRÍCH LƯỢT L."],
};

async function revealed(fixture: Fixture) {
  const { learner, sessionId } = await endedSession("linh@example.com", fixture.script, fixture.notes);
  const models = revealModels({ END_JUDGE: [judgeStep(fixture.notes, fixture.noted)], FEEDBACK: [fixture.claims], VERIFIER: [agreeAll()] });
  expect(await runReveal(db(), sessionId, { llmDeps: models.llmDeps })).toBe("finalised");
  return { learner, sessionId };
}

const setStatus = (sessionId: string, status: (typeof SESSION_STATUSES)[number]) => db().update(sessions).set({ status }).where(eq(sessions.id, sessionId));

/** Every payload a browser can get for a session, as the routes and the session page build them. */
async function payloads(learner: AppUser, sessionId: string) {
  const found = (await getSession(db(), learner.id, sessionId))!;
  const turns = await listTurns(db(), learner.id, sessionId);
  return {
    reveal: await getRevealView(db(), learner, sessionId),
    transcript: await getTranscriptView(db(), learner, sessionId),
    // The line a session list shows.
    list: toBrowserResult(found.session.status, found.session.revealJson),
    // A turn request: the session has ended, so it is refused, with an error state and nothing else.
    turn: await runTurn(db(), learner, sessionId, { text: "Thêm một câu nữa ạ?", expectedIndex: turns.length, turnKey: randomUUID() }),
    page: buildSessionView({ session: found.session, scenario: found.scenario, topicTitle: found.topic.title, turns, waitlisted: false }),
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe.each(PRIMARY)("sealed payloads, primary target: $name", (fixture) => {
  it("holds the session at revealed with paid-app as the target, noted in the notes", async () => {
    const { learner, sessionId } = await revealed(fixture);
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    const session = await sessionRow(sessionId);
    expect(session.status).toBe("revealed");
    expect(session.revealJson!.replay).toMatchObject({ level: "primary", targetItemId: "paid-app" });
    expect(session.revealJson!.canvasMatches.some((match) => match.itemId === "paid-app")).toBe(true);
  });

  it("before the guess: no payload carries any reveal data", async () => {
    const { learner, sessionId } = await revealed(fixture);
    const sent = await payloads(learner, sessionId);

    expect(sent.reveal).toEqual({ found: true, ready: false, due: false });
    expect(sent.list).toBeNull();
    expect(sent.page.screen).toBe("guess");
    expect(sent.transcript!.every((turn) => turn.leading === null)).toBe(true);
    expect(leaked(sent)).toEqual([]);
    // Not one item's content has left the server yet.
    for (const item of chiThu.items) expect(JSON.stringify(sent)).not.toContain(item.content);
  });

  it.each(["revealed", "replaying"] as const)("%s: no payload carries anything of the target", async (status) => {
    const { learner, sessionId } = await revealed(fixture);
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    await setStatus(sessionId, status);
    const stored = (await sessionRow(sessionId)).revealJson!;
    const sent = await payloads(learner, sessionId);

    expect(leaked(sent)).toEqual([]);
    for (const text of fixture.sealedTexts) expect(JSON.stringify(sent)).not.toContain(text);
    expect(sent.reveal).toMatchObject({ ready: true, reveal: { mode: "offer", held: 1, recognized: { state: "count", value: stored.counts.recognizedFull! - 1 } } });
    // A list shows numbers for a done session only.
    expect(sent.list).toBeNull();
    expect(sent.turn).toEqual({ ok: false, error: "session_ended" });
    // The session page hands its client component exactly what the reveal route sends.
    expect(sent.page).toMatchObject({ screen: "reveal", reveal: (sent.reveal as { reveal: object }).reveal });

    const hookTurn = (stored.replay as { forkAfterTurn: number }).forkAfterTurn;
    expect(sent.transcript!.find((turn) => turn.index === hookTurn)!.leading).toBeNull();
    const notes = (sent.reveal as { reveal: { notes: { text: string; match: unknown }[] } }).reveal.notes;
    expect(notes.filter((segment) => segment.match !== null)).toHaveLength(stored.canvasMatches.length - 1);
  });

  it("done: what was held is in the payloads", async () => {
    const { learner, sessionId } = await revealed(fixture);
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    await setStatus(sessionId, "done");
    const stored = (await sessionRow(sessionId)).revealJson!;
    const sent = await payloads(learner, sessionId);

    const text = JSON.stringify(sent.reveal);
    expect(text).toContain(target.content);
    expect(text).toContain(target.sample_question);
    for (const sealedText of fixture.sealedTexts) expect(text).toContain(sealedText);
    expect(sent.reveal).toMatchObject({ reveal: { mode: "done", recognized: { state: "count", value: stored.counts.recognizedFull } } });
    expect(sent.list).toEqual({ told: stored.counts.told, total: 11, recognized: { state: "count", value: stored.counts.recognizedFull } });
    // The stored result itself did not change: unsealing is a matter of what is sent.
    expect((await sessionRow(sessionId)).revealJson).toEqual(stored);
  });
});

describe("sealed payloads, fallback 1", () => {
  it.each(["revealed", "replaying"] as const)("%s: no claim, added words or mark of the replayed turn is sent", async (status) => {
    const { learner, sessionId } = await revealed(FALLBACK);
    await submitGuess(db(), learner, sessionId, { guess: 0 });
    await setStatus(sessionId, status);
    expect((await sessionRow(sessionId)).revealJson!.replay).toEqual({ level: "fallback1", forkAfterTurn: 0, leadingTurn: 1 });
    const sent = await payloads(learner, sessionId);

    const text = JSON.stringify(sent);
    expect(text).not.toContain("NHẬN XÉT TRÍCH LƯỢT L.");
    expect(sent.reveal).toMatchObject({ reveal: { mode: "offer", held: 0, replay: { level: "fallback1", returnTurn: 1, target: null }, takeaway: { comments: [] } } });
    expect(JSON.stringify((sent.reveal as { reveal: { takeaway: object } }).reveal.takeaway)).not.toContain("addedWords\":\"");
    expect(sent.transcript!.filter((turn) => turn.leading !== null).map((turn) => turn.index)).toEqual([3]);
  });

  it("done: the comment and the mark of that turn are sent", async () => {
    const { learner, sessionId } = await revealed(FALLBACK);
    await submitGuess(db(), learner, sessionId, { guess: 0 });
    await setStatus(sessionId, "done");
    const sent = await payloads(learner, sessionId);

    expect(JSON.stringify(sent.reveal)).toContain("NHẬN XÉT TRÍCH LƯỢT L.");
    expect(sent.reveal).toMatchObject({ reveal: { takeaway: { comments: [{ type: "leading", turns: [1, 3], addedWords: "Chị kể" }] } } });
    expect(sent.transcript!.filter((turn) => turn.leading !== null).map((turn) => turn.index)).toEqual([1, 3]);
  });
});

describe("payloads of the other session states", () => {
  it("interviewing: the transcript has no marks and the page carries no item content", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await setStatus(sessionId, "interviewing");
    await db().update(sessions).set({ endedAt: null, canvasFrozenAt: null }).where(eq(sessions.id, sessionId));
    const found = (await getSession(db(), learner.id, sessionId))!;
    const turns = await listTurns(db(), learner.id, sessionId);
    const page = buildSessionView({ session: found.session, scenario: found.scenario, topicTitle: found.topic.title, turns, waitlisted: false });

    expect(page.screen).toBe("interview");
    expect(Object.keys((await getTranscriptView(db(), learner, sessionId))![1]).sort()).toEqual(["index", "leading", "learnerText", "personaText"]);
    for (const item of chiThu.items) for (const text of sealedStringsOf(item)) expect(JSON.stringify(page)).not.toContain(text);
  });

  it("withdrawn: the reveal is not sent even when one is stored, and the transcript has no marks", async () => {
    const { learner, sessionId } = await revealed(PRIMARY[0]);
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    await setStatus(sessionId, "withdrawn");
    const sent = await payloads(learner, sessionId);

    expect(sent.reveal).toEqual({ found: true, ready: false, due: false });
    expect(sent.page.screen).toBe("withdrawn");
    expect(sent.list).toBeNull();
    expect(sent.transcript!.every((turn) => turn.leading === null)).toBe(true);
    for (const item of chiThu.items) expect(JSON.stringify(sent)).not.toContain(item.content);
  });
});
