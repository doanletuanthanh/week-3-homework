import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, type Database } from "@/db/client";
import { loadReplay, loadReplayBasis } from "@/db/repo/replay";
import { getSession, listTurns } from "@/db/repo/sessions";
import * as schema from "@/db/schema";
import { branches, llmCalls, sessions, snapshots, turns } from "@/db/schema";
import { buildAnalysisContext, type AnalysisContext } from "@/engine/contexts";
import { assertIsolated } from "@/eval/isolation";
import type { ContextInspector } from "@/graphs/turn-graph";
import type { AppUser } from "@/server/auth";
import { canStartSession } from "@/server/cost-cap";
import { getReplayTranscriptView, runReplayTurn, skipReplay, startReplay, stopReplay } from "@/server/replay";
import { getRevealView, getTranscriptView } from "@/server/reveal";
import { buildSessionView } from "@/server/session-view";
import { postgresTurnStore } from "@/server/turn-store";
import { runTurn } from "@/server/turns";
import { a, chiThu, told } from "../helpers/engine-fixtures";
import { LOCAL_DATABASE_URL } from "../helpers/local-stack";
import {
  FALLBACK_CLAIM,
  LEADING,
  LEADING_QUESTION,
  PICK_UP,
  PRIMARY_FORK,
  TARGET_ID,
  branchRows,
  branchSnapshots,
  branchTurns,
  eventNames,
  failingJudge,
  fallbackSession,
  judged,
  mainBranch,
  mainData,
  replayBranch,
  replayCalls,
  replayTurn,
  revealedSession,
  toldItems,
  type ReplayStep,
} from "../helpers/replay-fixtures";
import { NOTES, QUESTIONS } from "../helpers/reveal-fixtures";
import { NO_REPLAY, eventRows, sessionRow } from "../helpers/session-fixtures";
import { createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const target = chiThu.items.find((item) => item.id === TARGET_ID)!;
const itemOf = (id: string) => chiThu.items.find((item) => item.id === id)!;
const HABIT_CLAIM = "Câu ngay sau thường hỏi sang chuyện khác.";

const targetStrings = [target.content, target.sample_question, target.topic_tag, target.do_not_assert.text, `"${target.id}"`, `"${target.do_not_assert.id}"`];
const leaked = (payload: unknown) => targetStrings.filter((text) => JSON.stringify(payload).includes(text));

const start = async (learner: AppUser, sessionId: string) => expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: true });
const statusOf = async (sessionId: string) => (await sessionRow(sessionId)).status;

/** Every payload a browser can get while a replay runs, as the routes and the session page build them. */
async function payloads(learner: AppUser, sessionId: string) {
  const found = (await getSession(db(), learner.id, sessionId))!;
  return {
    reveal: await getRevealView(db(), learner, sessionId),
    transcript: await getTranscriptView(db(), learner, sessionId),
    replayTranscript: await getReplayTranscriptView(db(), learner, sessionId),
    page: buildSessionView({
      session: found.session,
      scenario: found.scenario,
      topicTitle: found.topic.title,
      turns: await listTurns(db(), learner.id, sessionId),
      waitlisted: false,
      replay: await loadReplay(db(), sessionId),
    }),
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("startReplay", () => {
  it("creates the replay branch at the moment the reveal chose, with a copy of the main snapshot at the fork", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);

    expect(await statusOf(sessionId)).toBe("replaying");
    const branch = (await replayBranch(sessionId))!;
    expect(branch).toMatchObject({ kind: "replay", forkAfterTurn: PRIMARY_FORK, targetItemId: TARGET_ID, fallbackLevel: "primary", result: null });
    expect(await branchTurns(branch.id)).toEqual([]);

    const main = await mainBranch(sessionId);
    const [copy] = await branchSnapshots(branch.id);
    const original = (await branchSnapshots(main.id)).find((snapshot) => snapshot.index === PRIMARY_FORK)!;
    expect(await branchSnapshots(branch.id)).toHaveLength(1);
    expect({ ...copy, branchId: main.id, createdAt: original.createdAt }).toEqual(original);
    // The copy holds the verdict about the fork turn: the hook is in the ledger, not yet ignored.
    expect(copy.ledger).toEqual([{ itemId: TARGET_ID, droppedAt: 2, pickedAt: null, ignoredAt: null, closedAt: null }]);
    expect(copy.unlocked.map((entry) => entry.itemId)).toEqual(["money-home"]);

    expect((await eventRows(sessionId, "replay_started")).map((event) => event.props)).toEqual([{ level: "primary" }]);
  });

  it("forks just before the leading question on a fallback 1 session, with no target", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    expect(await replayBranch(sessionId)).toMatchObject({ forkAfterTurn: 0, targetItemId: null, fallbackLevel: "fallback1", result: null });
    expect((await eventRows(sessionId, "replay_started")).map((event) => event.props)).toEqual([{ level: "fallback1" }]);
  });

  it("two requests sent together create one branch", async () => {
    const { learner, sessionId } = await revealedSession();
    const clients = Array.from({ length: 4 }, () => postgres(LOCAL_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} }));
    try {
      const results = await Promise.all(clients.map((client) => startReplay(drizzle(client, { schema }) as Database, learner, sessionId)));
      expect(results).toEqual(Array.from({ length: 4 }, () => ({ ok: true })));
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
    expect((await branchRows(sessionId)).filter((branch) => branch.kind === "replay")).toHaveLength(1);
    expect(await eventRows(sessionId, "replay_started")).toHaveLength(1);
  });

  it("the database itself refuses a second replay branch for a session", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const second = db().insert(branches).values({ sessionId, kind: "replay", forkAfterTurn: 2, fallbackLevel: "primary" });
    await expect(second).rejects.toMatchObject({ cause: { constraint_name: "branch_session_replay_key" } });
  });

  it("is refused when no replay is on offer, and for someone else's session", async () => {
    const { learner, sessionId } = await revealedSession();
    const stranger = await createLearner("kha@example.com");
    expect(await startReplay(db(), stranger, sessionId)).toEqual({ ok: false, error: "not_found" });
    expect(await startReplay(db(), learner, randomUUID())).toEqual({ ok: false, error: "not_found" });

    // Before the guess the session is still `interviewing`: the reveal may be ready, but it is not offered.
    await db().update(sessions).set({ status: "interviewing" }).where(eq(sessions.id, sessionId));
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    // The result is not there yet.
    await db().update(sessions).set({ status: "revealed", revealReadyAt: null }).where(eq(sessions.id, sessionId));
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    expect(await replayBranch(sessionId)).toBeUndefined();
  });

  it("is refused for a session with no replay moment, which is done as soon as it is revealed", async () => {
    const { learner, sessionId } = await revealedSession(NO_REPLAY, "làm kế toán");
    expect(await statusOf(sessionId)).toBe("done");
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: true });
    expect(await replayBranch(sessionId)).toBeUndefined();
  });
});

describe("context restore at the fork (PRD §9.3)", () => {
  it("the first replay turn starts from what the main interview had at that turn, and from nothing later", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const main = await mainBranch(sessionId);
    const branch = (await replayBranch(sessionId))!;
    const found = (await getSession(db(), learner.id, sessionId))!;

    // What the main turn store hands turn 3: snapshot 2 and turns 0 to 2.
    const atFork = await postgresTurnStore(db(), {
      sessionId,
      userId: learner.id,
      claim: { token: "t", branchId: main.id, turnIndex: PRIMARY_FORK + 1, isDemo: false, scenario: found.scenario },
    }).loadState();

    const basis = await loadReplayBasis(db(), { branch, mainBranchId: main.id, turnIndex: PRIMARY_FORK + 1 });
    expect(basis.shared.map((turn) => turn.index)).toEqual([0, 1, 2]);
    expect(basis.replayTurns).toEqual([]);

    const question = "Chị định ghi lại kiểu gì ạ?";
    let seen: AnalysisContext | undefined;
    await replayTurn(learner, sessionId, 1, { question }, { onContext: (subject) => void (subject.call === "ANALYSIS" && (seen = subject.context)) });
    expect(seen).toEqual(buildAnalysisContext(chiThu, atFork.state, atFork.transcript, question));
    expect(seen!.transcript.map((line) => line.index)).toEqual([0, 1, 2]);
  });

  it("later replay turns read the branch's own turns after the fork, never the main ones", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: "Câu luyện lại thứ nhất ạ?", persona: "Trả lời luyện lại thứ nhất." });
    const { models } = await replayTurn(learner, sessionId, 2);

    for (const role of ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] as const) {
      const [prompt] = models.prompts(role);
      expect(prompt, role).toContain("Câu luyện lại thứ nhất ạ?");
      expect(prompt, role).toContain("Trả lời luyện lại thứ nhất.");
      expect(prompt, role).toContain(QUESTIONS[2]);
      for (const later of [QUESTIONS[3], QUESTIONS[4], QUESTIONS[5], QUESTIONS[6], "Câu trả lời ở lượt 3."]) expect(prompt, role).not.toContain(later);
    }
  });
});

describe("runReplayTurn: a primary replay", () => {
  it("the sample question at replay turn 2 opens the target, the persona tells it at once, and the replay ends as a success", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);

    const first = await replayTurn(learner, sessionId, 1, { persona: "Ghi vào ghi chú điện thoại thôi em." });
    expect(first.result).toEqual({ ok: true, personaText: "Ghi vào ghi chú điện thoại thôi em.", replayTurnIndex: 1, unchecked: false, outcome: null });
    expect(await statusOf(sessionId)).toBe("replaying");

    const second = await replayTurn(learner, sessionId, 2, {
      question: target.sample_question,
      analysis: PICK_UP,
      persona: "Chị tải một cái app, giờ vẫn bị trừ tiền hằng tháng.",
      judge: [judged(toldItems(TARGET_ID))],
    });
    // Call 2 was told to say the item in this very reply.
    expect(second.models.prompts("PERSONA")[0]).toContain(`<dieu_noi_ngay>\n- ${target.content}\n</dieu_noi_ngay>`);
    expect(second.result).toEqual({
      ok: true,
      personaText: "Chị tải một cái app, giờ vẫn bị trừ tiền hằng tháng.",
      replayTurnIndex: 2,
      unchecked: false,
      outcome: { level: "primary", result: "success", target: { content: target.content, sampleQuestion: target.sample_question }, otherItem: null },
    });

    expect(await statusOf(sessionId)).toBe("done");
    const branch = (await replayBranch(sessionId))!;
    expect(branch.result).toBe("success");
    const rows = await branchTurns(branch.id);
    expect(rows.map((turn) => [turn.index, turn.decisionJson!.unlockedItemId, turn.verdictJson?.disclosed_item_ids])).toEqual([
      [3, null, []],
      [4, TARGET_ID, [TARGET_ID]],
    ]);
    const snapshot = (await branchSnapshots(branch.id)).at(-1)!;
    expect(snapshot).toMatchObject({ index: 4 });
    expect(snapshot.unlocked).toContainEqual({ itemId: TARGET_ID, turn: 4 });
    expect(snapshot.disclosed).toContainEqual({ itemId: TARGET_ID, turn: 4 });
    expect(snapshot.ledger.find((entry) => entry.itemId === TARGET_ID)).toMatchObject({ droppedAt: 2, ignoredAt: 3, pickedAt: 4, closedAt: 4 });

    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "primary", result: "success", turns: 2 }]);
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();
  });

  it("is a success only when the judge says the target was told: opening it is not enough", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);

    // The target opens at turn 1 and the judge finds it was not told, three turns running.
    const opened = await replayTurn(learner, sessionId, 1, { analysis: PICK_UP, persona: "Chị cũng không nhớ rõ nữa." });
    expect(opened.result).toMatchObject({ ok: true, outcome: null });
    expect((await replayBranch(sessionId))!.result).toBeNull();
    // From the next turn on the persona is asked to tell it when it fits.
    const next = await replayTurn(learner, sessionId, 2);
    expect(next.models.prompts("PERSONA")[0]).toContain(`<dieu_chua_ke>\n- ${target.content}\n</dieu_chua_ke>`);
    const last = await replayTurn(learner, sessionId, 3);

    expect(last.result).toMatchObject({ ok: true, replayTurnIndex: 3, outcome: { level: "primary", result: "fail", target: { content: target.content } } });
    expect((await replayBranch(sessionId))!.result).toBe("fail");
    expect(await statusOf(sessionId)).toBe("done");
  });

  it("is a success when the judge confirms the target in a later turn than the one that opened it", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { analysis: PICK_UP });
    const told2 = await replayTurn(learner, sessionId, 2, { judge: [judged(toldItems(TARGET_ID))] });
    expect(told2.result).toMatchObject({ ok: true, outcome: { result: "success" } });
    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "primary", result: "success", turns: 2 }]);
  });

  it("does not let the judge tell an item that is not open", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    // The judge names the target, but nothing opened it: code drops the claim.
    const { result } = await replayTurn(learner, sessionId, 1, { judge: [judged(toldItems(TARGET_ID))] });
    expect(result).toMatchObject({ ok: true, outcome: null });
    const [turn] = await branchTurns((await replayBranch(sessionId))!.id);
    expect(turn.verdictJson).toEqual({ hook_dropped: false, disclosed_item_ids: [], violations: [] });
  });

  it("ignores the verdict in Call 1's output on every replay turn", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { analysis: PICK_UP });
    // Call 1 of turn 2 claims the target was told at turn 1. Only the judge may say that.
    const { result } = await replayTurn(learner, sessionId, 2, { analysis: { prev_turn_verdict: told(TARGET_ID) } });
    expect(result).toMatchObject({ ok: true, outcome: null });

    const branch = (await replayBranch(sessionId))!;
    const snapshotRows = await branchSnapshots(branch.id);
    expect(snapshotRows.map((snapshot) => snapshot.disclosed.map((entry) => entry.itemId))).toEqual([["money-home"], ["money-home"], ["money-home"]]);
    // The earlier turn's row and snapshot were not rewritten by the later turn.
    expect((await branchTurns(branch.id))[0].verdictJson).toEqual({ hook_dropped: false, disclosed_item_ids: [], violations: [] });
  });

  it("a judge that fails after two retries: the turn counts, nothing is told, and the turn is marked unchecked", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const { result, models } = await replayTurn(learner, sessionId, 1, { analysis: PICK_UP, persona: "Giờ vẫn bị trừ tiền.", judge: failingJudge() });

    expect(result).toEqual({ ok: true, personaText: "Giờ vẫn bị trừ tiền.", replayTurnIndex: 1, unchecked: true, outcome: null });
    expect(models.calls("REPLAY_JUDGE")).toHaveLength(3);
    const branch = (await replayBranch(sessionId))!;
    const [turn] = await branchTurns(branch.id);
    expect(turn).toMatchObject({ index: 3, verdictJson: null, flagged: false, judgeLabel: null });
    expect((await branchSnapshots(branch.id)).at(-1)!.disclosed.map((entry) => entry.itemId)).toEqual(["money-home"]);
    // The next turn is replay turn 2: the unchecked one was counted.
    expect((await replayTurn(learner, sessionId, 2)).result).toMatchObject({ ok: true, replayTurnIndex: 2 });
  });

  it("partial: the persona told another item this replay opened, and not the target", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const opening = await replayTurn(learner, sessionId, 1, { analysis: { topic_tags: [a("tag", "tried-methods")] }, judge: [judged(toldItems("tried-methods"))] });
    expect(opening.result).toMatchObject({ ok: true, outcome: null });
    await replayTurn(learner, sessionId, 2);
    const { result } = await replayTurn(learner, sessionId, 3);

    expect(result).toMatchObject({
      ok: true,
      outcome: { level: "primary", result: "partial", otherItem: itemOf("tried-methods").content, target: { content: target.content, sampleQuestion: target.sample_question } },
    });
    expect((await replayBranch(sessionId))!.result).toBe("partial");
  });

  it("fail: three turns and nothing told", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const results = [];
    for (const turn of [1, 2, 3]) results.push((await replayTurn(learner, sessionId, turn)).result);

    expect(results.map((result) => result.ok && result.outcome?.result)).toEqual([undefined, undefined, "fail"]);
    expect((await replayBranch(sessionId))!.result).toBe("fail");
    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "primary", result: "fail", turns: 3 }]);
  });

  it("flags a replay reply that broke a do-not-assert, from the judge's verdict", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { judge: [judged({ hook_dropped: false, disclosed_item_ids: [], violations: [a("doNotAssert", "shame")] })] });
    const [turn] = await branchTurns((await replayBranch(sessionId))!.id);
    expect(turn.flagged).toBe(true);
    expect(turn.verdictJson!.violations).toEqual([itemOf("shame").do_not_assert.id]);
  });
});

describe("runReplayTurn: the replay of a leading question", () => {
  it("success: three questions without leading, at least one resting on the persona's words", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    const first = await replayTurn(learner, sessionId, 1);
    // A good label needs a persona turn to rest on: there is one from replay turn 2 on.
    const second = await replayTurn(learner, sessionId, 2, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } });
    expect(first.result).toMatchObject({ ok: true, outcome: null });
    expect(second.result).toMatchObject({ ok: true, outcome: null });
    const { result, models } = await replayTurn(learner, sessionId, 3, { analysis: { label: "boundary_probe", grounded_turn_id: 2 } });

    expect(result).toMatchObject({
      ok: true,
      replayTurnIndex: 3,
      outcome: { level: "fallback1", result: "success", leadingTurn: 1, grounded: 2, stillLeading: null, sampleQuestion: null },
    });
    expect(await statusOf(sessionId)).toBe("done");
    // The judge was also asked to label the question.
    expect(models.prompts("REPLAY_JUDGE")[0]).toContain("<cau_hoi_can_gan_nhan>");
    expect((await branchTurns((await replayBranch(sessionId))!.id)).map((turn) => [turn.index, turn.judgeLabel])).toEqual([
      [1, "open"],
      [2, "open"],
      [3, "open"],
    ]);
  });

  it("a question Call 1 found leading and the judge did not is not held against the learner", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    // Call 1 calls turn 1 leading; the judge finds it open. Turn 2 rests on the persona's words.
    await replayTurn(learner, sessionId, 1, { question: LEADING_QUESTION, analysis: LEADING, judge: [judged(undefined, "open", null)] });
    await replayTurn(learner, sessionId, 2, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } });
    const { result } = await replayTurn(learner, sessionId, 3);

    expect(result).toMatchObject({ ok: true, outcome: { level: "fallback1", result: "success", grounded: 1, stillLeading: null } });
    expect((await replayBranch(sessionId))!.result).toBe("success");
    // Only the result is judged this way: openness still fell on Call 1's label.
    const [first] = await branchTurns((await replayBranch(sessionId))!.id);
    expect(first.decisionJson!.opennessAfter).toBeLessThan(first.decisionJson!.opennessBefore);
    expect(first).toMatchObject({ judgeLabel: "open" });
  });

  it("a judge that failed on a leading question confirmed nothing", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: LEADING_QUESTION, analysis: LEADING, judge: failingJudge() });
    await replayTurn(learner, sessionId, 2, { analysis: { label: "boundary_probe", grounded_turn_id: 1 } });
    const { result } = await replayTurn(learner, sessionId, 3);
    expect(result).toMatchObject({ ok: true, outcome: { result: "success", grounded: 1 } });
  });

  it("Dừng after a grounded question and no confirmed leading one: the outcome says how many were grounded", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1);
    await replayTurn(learner, sessionId, 2, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } });
    expect(await stopReplay(db(), learner, sessionId)).toMatchObject({
      ok: true,
      outcome: { level: "fallback1", result: "stopped", grounded: 1, stillLeading: null, sampleQuestion: target.sample_question },
    });
  });

  it("Dừng after a confirmed leading question: it is quoted, grounded questions or not", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: LEADING_QUESTION, analysis: LEADING, judge: [judged(undefined, "leading", [1, 3])] });
    await replayTurn(learner, sessionId, 2, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } });
    expect(await stopReplay(db(), learner, sessionId)).toMatchObject({ ok: true, outcome: { result: "stopped", grounded: 1, stillLeading: { turn: 1, words: "tại chị lười" } } });
  });

  it("does not end early, however the first two questions went", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: LEADING_QUESTION, analysis: LEADING, judge: [judged(undefined, "leading", [1, 3])] });
    const { result } = await replayTurn(learner, sessionId, 2, { question: LEADING_QUESTION, analysis: LEADING, judge: [judged(undefined, "leading", [1, 3])] });
    expect(result).toMatchObject({ ok: true, outcome: null });
    expect(await statusOf(sessionId)).toBe("replaying");
  });

  it("fail: quotes the question that was still leading, when the replay judge found it leading too", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1);
    await replayTurn(learner, sessionId, 2, { question: LEADING_QUESTION, analysis: LEADING, judge: [judged(undefined, "leading", [1, 3])] });
    const { result } = await replayTurn(learner, sessionId, 3, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } });

    expect(result).toMatchObject({
      ok: true,
      outcome: { level: "fallback1", result: "fail", grounded: 1, stillLeading: { turn: 2, words: "tại chị lười" }, sampleQuestion: target.sample_question },
    });
    expect((await replayBranch(sessionId))!.result).toBe("fail");
  });

  it.each([
    ["the judge found the question open", [judged(undefined, "open", null)]],
    ["the judge's leading label pointed at no words of the question", [judged(undefined, "leading", [40, 44])]],
    ["the judge failed", failingJudge()],
  ])("fail without a quote when %s", async (_name, judge) => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: LEADING_QUESTION, analysis: LEADING, judge });
    await replayTurn(learner, sessionId, 2);
    const { result } = await replayTurn(learner, sessionId, 3);
    expect(result).toMatchObject({ ok: true, outcome: { level: "fallback1", result: "fail", stillLeading: null, grounded: 0 } });
  });

  it("fail: three questions that were not leading but rested on nothing the persona said", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    for (const turn of [1, 2]) await replayTurn(learner, sessionId, turn);
    const { result } = await replayTurn(learner, sessionId, 3);
    expect(result).toMatchObject({ ok: true, outcome: { result: "fail", grounded: 0, stillLeading: null } });
  });
});

describe("stopReplay and skipReplay", () => {
  it("Dừng ends the replay where it is: stopped, done, and the answer carries what was held", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1);

    expect(await stopReplay(db(), learner, sessionId)).toEqual({
      ok: true,
      outcome: { level: "primary", result: "stopped", target: { content: target.content, sampleQuestion: target.sample_question }, otherItem: null },
    });
    expect(await statusOf(sessionId)).toBe("done");
    expect(await replayBranch(sessionId)).toMatchObject({ result: "stopped" });
    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "primary", result: "stopped", turns: 1 }]);

    // Asked again, it answers the same and writes nothing more.
    expect(await stopReplay(db(), learner, sessionId)).toMatchObject({ ok: true, outcome: { result: "stopped" } });
    expect(await eventRows(sessionId, "replay_result")).toHaveLength(1);
    // No turn can be added to a stopped replay.
    expect((await replayTurn(learner, sessionId, 2)).result).toEqual({ ok: false, error: "replay_ended" });
  });

  it("Dừng before the first question, and on a fallback 1 replay", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    expect(await stopReplay(db(), learner, sessionId)).toMatchObject({
      ok: true,
      outcome: { level: "fallback1", result: "stopped", grounded: 0, stillLeading: null, sampleQuestion: target.sample_question },
    });
    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "fallback1", result: "stopped", turns: 0 }]);
  });

  it("Dừng is refused while a replay question is being answered, and for a session that is not replaying", async () => {
    const { learner, sessionId } = await revealedSession();
    expect(await stopReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_replaying" });
    await start(learner, sessionId);

    await db().update(sessions).set({ turnClaim: { token: randomUUID(), at: new Date().toISOString() } }).where(eq(sessions.id, sessionId));
    expect(await stopReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "in_flight" });
    expect(await statusOf(sessionId)).toBe("replaying");

    // A claim left by a request that died does not block it.
    await db().update(sessions).set({ turnClaim: { token: randomUUID(), at: new Date(Date.now() - 10 * 60_000).toISOString() } }).where(eq(sessions.id, sessionId));
    expect(await stopReplay(db(), learner, sessionId)).toMatchObject({ ok: true });
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();

    const stranger = await createLearner("kha@example.com");
    expect(await stopReplay(db(), stranger, sessionId)).toEqual({ ok: false, error: "not_found" });
  });

  it("Bỏ qua records a skipped replay with no turns, and the session is done", async () => {
    const { learner, sessionId } = await revealedSession();
    expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: true });

    expect(await statusOf(sessionId)).toBe("done");
    const branch = (await replayBranch(sessionId))!;
    expect(branch).toMatchObject({ forkAfterTurn: 2, targetItemId: TARGET_ID, fallbackLevel: "primary", result: "skipped" });
    expect(await branchTurns(branch.id)).toEqual([]);
    expect(await branchSnapshots(branch.id)).toEqual([]);
    expect((await eventRows(sessionId, "replay_result")).map((event) => event.props)).toEqual([{ level: "primary", result: "skipped", turns: 0 }]);
    expect(await eventRows(sessionId, "replay_started")).toEqual([]);

    // Nothing can be replayed afterwards, and skipping again changes nothing.
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: true });
    expect(await eventRows(sessionId, "replay_result")).toHaveLength(1);
  });

  it("Bỏ qua is not a way out of a replay that is running, or of someone else's session", async () => {
    const { learner, sessionId } = await revealedSession();
    const stranger = await createLearner("kha@example.com");
    expect(await skipReplay(db(), stranger, sessionId)).toEqual({ ok: false, error: "not_found" });
    await start(learner, sessionId);
    expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    expect(await statusOf(sessionId)).toBe("replaying");
  });

  it("one replay per session: once it has ended, by any route, no other can start", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    // Starting again while it runs is a no-op.
    await start(learner, sessionId);
    for (const turn of [1, 2, 3]) await replayTurn(learner, sessionId, turn);
    expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: false, error: "not_offered" });
    expect((await branchRows(sessionId)).map((branch) => branch.kind).sort()).toEqual(["main", "replay"]);
  });
});

describe("runReplayTurn: the same claim, key and limits as a main turn", () => {
  it("refuses bad input before any model is called", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const send = (body: unknown) => runReplayTurn(db(), learner, sessionId, body);
    const key = randomUUID();

    expect(await send({ text: "   ", expectedIndex: 1, turnKey: key })).toEqual({ ok: false, error: "invalid_input" });
    expect(await send({ text: "x".repeat(501), expectedIndex: 1, turnKey: key })).toEqual({ ok: false, error: "invalid_input" });
    expect(await send({ text: "Chị kể thêm ạ?", expectedIndex: 4, turnKey: key })).toEqual({ ok: false, error: "invalid_input" });
    expect(await send({ text: "Chị kể thêm ạ?", expectedIndex: 0, turnKey: key })).toEqual({ ok: false, error: "invalid_input" });
    expect(await send({ text: "Chị kể thêm ạ?", expectedIndex: 1, turnKey: "not-a-uuid" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await send(null)).toEqual({ ok: false, error: "invalid_input" });
    expect(await replayCalls(sessionId)).toEqual([]);
  });

  it("refuses a turn out of order, a session that is not replaying, and someone else's session", async () => {
    const { learner, sessionId } = await revealedSession();
    // Not started yet.
    expect((await replayTurn(learner, sessionId, 1)).result).toEqual({ ok: false, error: "replay_ended" });
    await start(learner, sessionId);

    expect((await replayTurn(learner, sessionId, 2)).result).toEqual({ ok: false, error: "conflict" });
    const stranger = await createLearner("kha@example.com");
    expect((await replayTurn(stranger, sessionId, 1)).result).toEqual({ ok: false, error: "not_found" });
    expect(await replayCalls(sessionId)).toEqual([]);
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();
  });

  it("sending the same question again returns the stored reply and calls no model", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const turnKey = randomUUID();
    const first = await replayTurn(learner, sessionId, 1, { turnKey, persona: "Trả lời một lần thôi." });
    const calls = (await replayCalls(sessionId)).length;

    const again = await replayTurn(learner, sessionId, 1, { turnKey });
    expect(again.result).toEqual(first.result);
    expect(again.models.records).toEqual([]);
    expect(await replayCalls(sessionId)).toHaveLength(calls);
    expect(await branchTurns((await replayBranch(sessionId))!.id)).toHaveLength(1);
  });

  it("sending the question that ended the replay again returns its outcome again, and only for that question", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const firstKey = randomUUID();
    const lastKey = randomUUID();
    await replayTurn(learner, sessionId, 1, { turnKey: firstKey });
    const ending = await replayTurn(learner, sessionId, 2, { turnKey: lastKey, analysis: PICK_UP, judge: [judged(toldItems(TARGET_ID))] });
    expect(ending.result).toMatchObject({ ok: true, outcome: { result: "success" } });

    expect((await replayTurn(learner, sessionId, 2, { turnKey: lastKey })).result).toEqual(ending.result);
    expect((await replayTurn(learner, sessionId, 1, { turnKey: firstKey })).result).toMatchObject({ ok: true, replayTurnIndex: 1, outcome: null });
    // A new question after the end is refused.
    expect((await replayTurn(learner, sessionId, 3)).result).toEqual({ ok: false, error: "replay_ended" });
  });

  it("keeps main and replay questions apart: a key is looked up on its own branch", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const turnKey = randomUUID();
    await replayTurn(learner, sessionId, 1, { turnKey, persona: "Lời của nhánh luyện lại." });
    // The main turn API does not hand out a replay reply for that key.
    expect(await runTurn(db(), learner, sessionId, { text: "Câu hỏi luyện lại 1 của em ạ?", expectedIndex: 7, turnKey })).toEqual({ ok: false, error: "session_ended" });
  });

  it("refuses a key a main turn already carries, before any model call", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const main = await branchTurns((await mainBranch(sessionId)).id);
    const { result, models } = await replayTurn(learner, sessionId, 1, { turnKey: main[1].turnKey! });

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(models.records).toEqual([]);
    expect(await replayCalls(sessionId)).toEqual([]);
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();
    // The replay turn is still to be played.
    expect((await replayTurn(learner, sessionId, 1)).result).toMatchObject({ ok: true, replayTurnIndex: 1 });
  });

  it("answers one replay question at a time", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    let second: Awaited<ReturnType<typeof replayTurn>>["result"] | undefined;
    const { result } = await replayTurn(learner, sessionId, 1, {
      personaSteps: [
        {
          text: "Trả lời của yêu cầu chậm.",
          before: async () => {
            second = (await replayTurn(learner, sessionId, 1)).result;
          },
        },
      ],
    });
    expect(second).toEqual({ ok: false, error: "in_flight" });
    expect(result).toMatchObject({ ok: true, personaText: "Trả lời của yêu cầu chậm.", replayTurnIndex: 1 });
    expect(await branchTurns((await replayBranch(sessionId))!.id)).toHaveLength(1);
  });

  it("a failed Call 1 or Call 2 writes no turn and does not count: the same replay turn can be asked again", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const down = Array.from({ length: 3 }, () => ({ error: new Error("provider down") }));

    expect((await replayTurn(learner, sessionId, 1, { analysisSteps: down })).result).toEqual({ ok: false, error: "llm_failed" });
    const noPersona = await replayTurn(learner, sessionId, 1, { personaSteps: down });
    expect(noPersona.result).toEqual({ ok: false, error: "llm_failed" });
    expect(noPersona.models.calls("REPLAY_JUDGE")).toHaveLength(0);

    const branch = (await replayBranch(sessionId))!;
    expect(await branchTurns(branch.id)).toEqual([]);
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();
    // The failed attempts are still on the bill.
    expect((await replayCalls(sessionId)).filter((call) => !call.ok)).toHaveLength(6);
    expect((await replayTurn(learner, sessionId, 1)).result).toMatchObject({ ok: true, replayTurnIndex: 1 });
  });

  it("writes nothing when the session was withdrawn while the question was being answered", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const { result } = await replayTurn(learner, sessionId, 1, {
      personaSteps: [{ text: "Trả lời tới muộn.", before: async () => void (await db().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, sessionId))) }],
    });
    expect(result).toEqual({ ok: false, error: "replay_ended" });
    const branch = (await replayBranch(sessionId))!;
    expect(await branchTurns(branch.id)).toEqual([]);
    expect(branch.result).toBeNull();
    expect((await sessionRow(sessionId)).turnClaim).toBeNull();
  });

  it("runs to its end after the daily cost cap is reached (FR-37)", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await db().insert(llmCalls).values({ scope: "session", role: "TEST_SPEND", model: "gpt-6-luna", tokensIn: 0, tokensOut: 0, tokensCached: 0, tokensReasoning: 0, costUsd: 50, latencyMs: 0, attempt: 1, ok: true });
    expect(await canStartSession(db(), false)).toBe(false);

    for (const turn of [1, 2]) expect((await replayTurn(learner, sessionId, turn)).result).toMatchObject({ ok: true, replayTurnIndex: turn });
    expect((await replayTurn(learner, sessionId, 3)).result).toMatchObject({ ok: true, outcome: { result: "fail" } });
  });
});

describe("model calls of a replay (NFR-1)", () => {
  it("makes three logical calls per replay turn, attributed to the replay branch", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    for (const turn of [1, 2, 3]) await replayTurn(learner, sessionId, turn);

    const branch = (await replayBranch(sessionId))!;
    const calls = await replayCalls(sessionId);
    expect(calls.every((call) => call.branchId === branch.id && call.scope === "session" && call.ok)).toBe(true);
    expect(calls.map((call) => [call.turnIndex, call.role])).toEqual(
      [3, 4, 5].flatMap((index) => [
        [index, "ANALYSIS"],
        [index, "PERSONA"],
        [index, "REPLAY_JUDGE"],
      ]),
    );
    // Calls of the main interview carry no branch, so its turns still count two each.
    const mainCalls = (await db().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId))).filter((call) => call.branchId === null);
    for (const index of [1, 2, 3, 4, 5, 6]) expect(mainCalls.filter((call) => call.turnIndex === index).map((call) => call.role).sort()).toEqual(["ANALYSIS", "PERSONA"]);
  });

  it("counts a judge's technical retries as one logical call", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { judge: [{ error: new Error("blip") }, judged()] });
    const calls = await replayCalls(sessionId);
    expect(calls.map((call) => [call.role, call.attempt, call.ok])).toEqual([
      ["ANALYSIS", 1, true],
      ["PERSONA", 1, true],
      ["REPLAY_JUDGE", 1, false],
      ["REPLAY_JUDGE", 2, true],
    ]);
    expect((await branchTurns((await replayBranch(sessionId))!.id))[0].verdictJson).not.toBeNull();
  });
});

describe("isolation on every replay turn (PRD §12.2 item 3)", () => {
  const CANVAS_LINES = NOTES.split("\n");

  const cases: [string, () => Promise<{ learner: AppUser; sessionId: string }>, ReplayStep[]][] = [
    ["primary", () => revealedSession(), [{}, { analysis: PICK_UP, judge: [judged(toldItems(TARGET_ID))] }]],
    ["fallback 1", () => fallbackSession(), [{}, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } }, {}]],
  ];

  it.each(cases)("%s: no call sees a locked item, the notes, or anything after the fork", async (_name, setup, steps) => {
    const { learner, sessionId } = await setup();
    await start(learner, sessionId);
    const fork = (await replayBranch(sessionId))!.forkAfterTurn!;
    const main = await branchTurns((await mainBranch(sessionId)).id);
    const afterFork = main.filter((turn) => turn.index > fork).flatMap((turn) => [turn.learnerText!, turn.personaText]);
    const canvas = (await sessionRow(sessionId)).canvasText.split("\n");

    const seen: string[] = [];
    const inspect: ContextInspector = (subject, state) => {
      seen.push(subject.call);
      // Throws, and so fails the turn, when the context holds content, secret terms or ids of a locked item.
      assertIsolated(chiThu, state, subject);
      const context = JSON.stringify(subject.context);
      for (const line of [...afterFork, ...canvas]) expect(context, `${subject.call}: "${line}"`).not.toContain(line);
      expect(subject.context.transcript.every((line) => line.index <= fork || line.learnerText?.startsWith("Câu hỏi luyện lại") === true)).toBe(true);
    };

    for (const [position, step] of steps.entries()) {
      const { result, models } = await replayTurn(learner, sessionId, position + 1, step, { onContext: inspect });
      expect(result.ok, `replay turn ${position + 1}`).toBe(true);
      // The rendered prompts, as the provider received them.
      for (const role of ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] as const) {
        const [prompt] = models.prompts(role);
        for (const line of [...afterFork, ...canvas]) expect(prompt, `${role}: "${line}"`).not.toContain(line);
      }
    }
    expect(seen).toEqual(steps.flatMap(() => ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"]));
    expect(afterFork.length).toBeGreaterThan(0);
    expect(canvas.length).toBeGreaterThan(0);
  });

  it("the notes used in these checks really are the frozen canvas", () => {
    expect(CANVAS_LINES).toContain("lương thấp nên khó để dành");
  });

  it("before the target opens, its content is in no prompt of the replay", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const { models } = await replayTurn(learner, sessionId, 1);
    for (const role of ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] as const) {
      const [prompt] = models.prompts(role);
      expect(prompt, role).not.toContain(target.content);
      expect(prompt, role).not.toContain(target.sample_question);
      for (const term of target.secret_terms) expect(prompt.toLowerCase(), `${role}: ${term}`).not.toContain(term.toLowerCase());
    }
    // The hook the persona dropped is public by now: Call 1 and the judge are given its line.
    expect(models.prompts("ANALYSIS")[0]).toContain(target.hook_line);
  });
});

describe("sealing while the replay runs (PRD §12.2 item 5)", () => {
  it("no payload carries anything of the target, and a replay turn answers with the reply and the count alone", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    const { result } = await replayTurn(learner, sessionId, 1, { analysis: { topic_tags: [a("tag", TARGET_ID)] } });
    expect(result).toEqual({ ok: true, personaText: "Câu trả lời luyện lại 1.", replayTurnIndex: 1, unchecked: false, outcome: null });

    const sent = await payloads(learner, sessionId);
    expect(leaked({ sent, result })).toEqual([]);
    expect(JSON.stringify(sent)).not.toContain(HABIT_CLAIM);
    expect(sent.page).toMatchObject({ screen: "replay", level: "primary", forkAfterTurn: 2, replayTurns: [{ index: 3, unchecked: false }] });
    expect(sent.reveal).toMatchObject({ ready: true, reveal: { mode: "offer", held: 1, replay: { target: null } } });
    // The replay's turns are on its own screen; the transcript route does not hand them out before the end.
    expect(sent.replayTranscript).toEqual([]);
    // The hook turn carries no mark in the main transcript.
    expect(sent.transcript!.filter((turn) => turn.leading !== null).map((turn) => turn.index)).toEqual([4]);
  });

  it("fallback 1: the leading turn's mark and the comment about it stay held while the replay runs", async () => {
    const { learner, sessionId } = await fallbackSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1);
    const sent = await payloads(learner, sessionId);
    expect(JSON.stringify(sent)).not.toContain(FALLBACK_CLAIM);
    expect(sent.transcript!.find((turn) => turn.index === 1)!.leading).toBeNull();
    expect(sent.page).toMatchObject({ screen: "replay", level: "fallback1", forkAfterTurn: 0 });
  });

  it("the replay transcript is the learner's own, and is not handed to anyone else", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { question: "Hồi đó chị ghi vào đâu ạ?", persona: "Ghi vào ghi chú điện thoại thôi em." });
    await stopReplay(db(), learner, sessionId);

    expect(await getReplayTranscriptView(db(), learner, sessionId)).toEqual([
      { index: 3, learnerText: "Hồi đó chị ghi vào đâu ạ?", personaText: "Ghi vào ghi chú điện thoại thôi em.", leading: null },
    ]);
    const stranger = await createLearner("kha@example.com");
    expect(await getReplayTranscriptView(db(), stranger, sessionId)).toBeNull();
    // The main transcript does not grow by the replay's turns.
    expect((await getTranscriptView(db(), learner, sessionId))!.map((turn) => turn.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

type Ending = {
  name: string;
  setup: () => Promise<{ learner: AppUser; sessionId: string }>;
  /** Plays the session from the offer to its end. */
  play: (learner: AppUser, sessionId: string) => Promise<void>;
  result: string | null;
  /** Text held back before the end that must be in the payloads after it. */
  unsealed: string[];
};

const playTurns = async (learner: AppUser, sessionId: string, steps: ReplayStep[]) => {
  await start(learner, sessionId);
  for (const [position, step] of steps.entries()) expect((await replayTurn(learner, sessionId, position + 1, step)).result.ok).toBe(true);
};

const PRIMARY_UNSEALED = [target.content, target.sample_question, HABIT_CLAIM];

// FR-41: every way a session can end.
const ENDINGS: Ending[] = [
  {
    name: "primary replay, success",
    setup: () => revealedSession(),
    play: (learner, sessionId) => playTurns(learner, sessionId, [{ analysis: PICK_UP, judge: [judged(toldItems(TARGET_ID))] }]),
    result: "success",
    unsealed: PRIMARY_UNSEALED,
  },
  {
    name: "primary replay, partial",
    setup: () => revealedSession(),
    play: (learner, sessionId) => playTurns(learner, sessionId, [{ analysis: { topic_tags: [a("tag", "tried-methods")] }, judge: [judged(toldItems("tried-methods"))] }, {}, {}]),
    result: "partial",
    unsealed: PRIMARY_UNSEALED,
  },
  { name: "primary replay, fail", setup: () => revealedSession(), play: (learner, sessionId) => playTurns(learner, sessionId, [{}, {}, {}]), result: "fail", unsealed: PRIMARY_UNSEALED },
  {
    name: "fallback 1 replay, success",
    setup: () => fallbackSession(),
    play: (learner, sessionId) => playTurns(learner, sessionId, [{}, { analysis: { label: "confirm_grounded", grounded_turn_id: 1 } }, {}]),
    result: "success",
    unsealed: [FALLBACK_CLAIM],
  },
  { name: "fallback 1 replay, fail", setup: () => fallbackSession(), play: (learner, sessionId) => playTurns(learner, sessionId, [{}, {}, {}]), result: "fail", unsealed: [FALLBACK_CLAIM] },
  {
    name: "Dừng",
    setup: () => revealedSession(),
    play: async (learner, sessionId) => {
      await playTurns(learner, sessionId, [{}]);
      expect(await stopReplay(db(), learner, sessionId)).toMatchObject({ ok: true });
    },
    result: "stopped",
    unsealed: PRIMARY_UNSEALED,
  },
  {
    name: "Bỏ qua",
    setup: () => revealedSession(),
    play: async (learner, sessionId) => expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: true }),
    result: "skipped",
    unsealed: PRIMARY_UNSEALED,
  },
  { name: "no replay moment", setup: () => revealedSession(NO_REPLAY, "làm kế toán"), play: async () => {}, result: null, unsealed: [] },
];

describe.each(ENDINGS)("after the session ends: $name (FR-27, FR-41)", ({ setup, play, result, unsealed }) => {
  it("the main interview's data is byte-identical, except the status flag", async () => {
    const { learner, sessionId } = await setup();
    const before = await mainData(sessionId);
    const mainEvents = await eventNames(sessionId);

    await play(learner, sessionId);

    expect(await statusOf(sessionId)).toBe("done");
    expect(await mainData(sessionId)).toBe(before);
    expect((await replayBranch(sessionId))?.result ?? null).toBe(result);
    // The events of the main interview are still there, once each.
    expect((await eventNames(sessionId)).filter((name) => !name.startsWith("replay_"))).toEqual(mainEvents);
  });

  it("nothing stays sealed: every held part is in what the browser gets", async () => {
    const { learner, sessionId } = await setup();
    if (unsealed.length > 0) {
      const held = JSON.stringify(await payloads(learner, sessionId));
      for (const text of unsealed) expect(held, `held before the end: ${text}`).not.toContain(text);
    }

    await play(learner, sessionId);

    const stored = (await sessionRow(sessionId)).revealJson!;
    const sent = await payloads(learner, sessionId);
    const text = JSON.stringify(sent);
    for (const part of unsealed) expect(text, `unsealed: ${part}`).toContain(part);

    if (!sent.reveal.found || !sent.reveal.ready) throw new Error("the reveal is not ready");
    const { reveal } = sent.reveal;
    expect(reveal.mode).toBe("done");
    // NHẬN BIẾT is the full count, the item that was held included.
    expect(reveal.recognized).toEqual(stored.canvasEmpty ? { state: "empty" } : { state: "count", value: stored.counts.recognizedFull });
    // Every claim the verifier passed is shown, and every question it found leading is marked.
    const visible = [reveal.takeaway.praise, reveal.takeaway.habit, ...reveal.takeaway.comments].filter((claim) => claim !== null);
    expect(visible.map((claim) => claim.id).sort()).toEqual(stored.claims.filter((claim) => claim.shown).map((claim) => claim.id).sort());
    expect(sent.transcript!.filter((turn) => turn.leading !== null).map((turn) => turn.index)).toEqual(stored.leading.filter((turn) => turn.novel).map((turn) => turn.turn));
    if (stored.replay.level === "primary") expect(reveal.replay).toMatchObject({ level: "primary", target: { content: target.content, sampleQuestion: target.sample_question } });

    // The page shows how the replay ended; a session without a replay moment has no card.
    expect(sent.page).toMatchObject({ screen: "reveal", replay: result === null ? null : { outcome: { result } } });
  });
});

describe("resuming a session", () => {
  it("a replaying session opens Màn 7 at the replay turn it stopped at", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    expect((await payloads(learner, sessionId)).page).toMatchObject({ screen: "replay", replayTurns: [] });

    await replayTurn(learner, sessionId, 1, { question: "Hồi đó chị ghi vào đâu ạ?", persona: "Ghi vào ghi chú thôi em." });
    await replayTurn(learner, sessionId, 2, { judge: failingJudge() });
    const { page } = await payloads(learner, sessionId);
    expect(page).toMatchObject({
      screen: "replay",
      date: expect.stringMatching(/^\d{2}\/\d{2}$/),
      contextTurns: [{ index: 1 }, { index: 2 }],
      replayTurns: [
        { index: 3, learnerText: "Hồi đó chị ghi vào đâu ạ?", personaText: "Ghi vào ghi chú thôi em.", unchecked: false },
        { index: 4, unchecked: true },
      ],
    });
  });

  it("a done session opens the result with its replay card, reading stored rows only", async () => {
    const { learner, sessionId } = await revealedSession();
    await start(learner, sessionId);
    await replayTurn(learner, sessionId, 1, { analysis: PICK_UP, judge: [judged(toldItems(TARGET_ID))] });
    const calls = (await db().select({ count: sql<number>`count(*)::int` }).from(llmCalls))[0].count;

    const first = await payloads(learner, sessionId);
    const second = await payloads(learner, sessionId);
    expect(second).toEqual(first);
    expect(first.page).toMatchObject({ screen: "reveal", replay: { outcome: { result: "success" }, turnCount: 1 } });
    expect((await db().select({ count: sql<number>`count(*)::int` }).from(llmCalls))[0].count).toBe(calls);
    // Nothing of the replay was written into the main branch.
    const main = await mainBranch(sessionId);
    expect((await db().select().from(turns).where(eq(turns.branchId, main.id))).map((turn) => turn.index).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(await db().select().from(snapshots).where(eq(snapshots.branchId, main.id))).toHaveLength(7);
  });
});
