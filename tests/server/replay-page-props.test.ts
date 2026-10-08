import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplayResult } from "@/components/replay/replay-result";
import type { BranchRow, LoadedReplay } from "@/db/repo/replay";
import type { ScenarioRow, SessionRow, TurnRow } from "@/db/repo/sessions";
import type { ReplayOutcome, ReplayResult as ReplayResultKind } from "@/engine/replay-result";
import { toBrowserReveal } from "@/engine/seal";
import { tokenize } from "@/engine/tokens";
import type { Label, Verdict } from "@/engine/types";
import { replayOutcomeOf, toReplayTurn } from "@/server/replay-outcome";
import { buildSessionView } from "@/server/session-view";
import { NO_VERDICT, chiThu } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, playedSession } from "../helpers/reveal-fixtures";

/**
 * The replay in the props of the session page. Props travel to the browser inside the page
 * payload, so they are read here serialised, as the browser receives them: while a replay runs
 * they carry the two speakers' words and nothing of what is held; once the session is `done`
 * they carry how the replay ended.
 */

const basis = basisOf(playedSession(), NOTES);
const reveal = assemble(basis, fullParts(basis));
const target = chiThu.items.find((item) => item.id === "paid-app")!;
const mainTurns = basis.turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));
const scenario = { id: "s", personaId: "chi-thu", topicId: "ux-chi-tieu", version: 1, content: chiThu } as ScenarioRow;

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "33333333-3333-4333-8333-333333333333";
const FORK = 2;

function sessionOf(status: SessionRow["status"]): SessionRow {
  return {
    id: SESSION_ID,
    userId: "22222222-2222-4222-8222-222222222222",
    scenarioId: "s",
    personaId: "chi-thu",
    status,
    isDemo: false,
    endedAt: new Date(),
    turnClaim: null,
    canvasText: NOTES,
    canvasTokens: tokenize(NOTES),
    canvasFrozenAt: new Date(),
    deviceClass: "desktop",
    guess: 4,
    revealedAt: new Date(),
    revealParts: fullParts(basis),
    revealJson: reveal,
    revealReadyAt: new Date(),
    revealRunToken: null,
    revealRunAttempt: 1,
    revealHeartbeatAt: null,
    startedAt: new Date("2026-09-25T15:30:00Z"),
    updatedAt: new Date("2026-09-25T16:00:00Z"),
  };
}

type TurnSpec = { question: string; reply: string; label?: Label; unlocked?: string; verdict?: Verdict | null; judgeLabel?: Label | null; span?: [number, number] };

function turnRow(position: number, spec: TurnSpec, fork = FORK): TurnRow {
  const label = spec.label ?? "open";
  return {
    sessionId: SESSION_ID,
    branchId: BRANCH_ID,
    index: fork + position + 1,
    turnKey: null,
    learnerText: spec.question,
    learnerTokens: tokenize(spec.question),
    personaText: spec.reply,
    personaTokens: tokenize(spec.reply),
    analysisJson: null,
    decisionJson: {
      analysis: { question_type: "other", label, grounded_turn_id: null, introduced_span: label === "leading" ? (spec.span ?? [0, 1]) : null, hook_item_id: null, tag_item_id: null },
      corrections: [],
      rules: [],
      unlockedItemId: spec.unlocked ?? null,
      opennessBefore: 4,
      opennessAfter: 4,
    },
    verdictJson: spec.verdict === undefined ? NO_VERDICT : spec.verdict,
    hookSelected: null,
    flagged: false,
    judgeLabel: spec.judgeLabel ?? null,
    latencyMs: 900,
    createdAt: new Date(),
  };
}

function replayOf(branch: Partial<BranchRow>, specs: TurnSpec[] = [], open: string[] = ["money-home", "last-attempt"]): LoadedReplay {
  const fork = branch.forkAfterTurn ?? FORK;
  return {
    branch: { id: BRANCH_ID, sessionId: SESSION_ID, kind: "replay", forkAfterTurn: fork, targetItemId: target.id, fallbackLevel: "primary", result: null, createdAt: new Date(), ...branch },
    turns: specs.map((spec, position) => turnRow(position, spec, fork)),
    openItemIds: open,
  };
}

const view = (status: SessionRow["status"], replay: LoadedReplay | null) =>
  buildSessionView({ session: sessionOf(status), scenario, topicTitle: "Chi tiêu hằng ngày", turns: mainTurns, waitlisted: false, replay });

const targetStrings = [target.content, target.sample_question, target.topic_tag, target.hook_line, target.do_not_assert.text, `"${target.id}"`];
const told = (...ids: string[]): Verdict => ({ hook_dropped: false, disclosed_item_ids: ids, violations: [] });

const NEUTRAL: TurnSpec = { question: "Hồi đó chị ghi vào đâu ạ?", reply: "Ghi vào ghi chú điện thoại thôi em." };
const OPENING: TurnSpec = { question: target.sample_question, reply: "Chị tải một cái app rồi quên hủy.", unlocked: target.id, verdict: told(target.id) };

describe("Màn 7 in the page props: a replay that is running", () => {
  it("opens the replay screen at the turn it stopped at, with the two turns before the fork", () => {
    const rendered = view("replaying", replayOf({}, [NEUTRAL]));
    expect(rendered).toEqual({
      screen: "replay",
      sessionId: SESSION_ID,
      persona: { displayName: "chị Thu", displayNameCapitalized: "Chị Thu" },
      date: "25/09",
      level: "primary",
      forkAfterTurn: 2,
      contextTurns: [mainTurns[1], mainTurns[2]],
      replayTurns: [{ index: 3, learnerText: NEUTRAL.question, personaText: NEUTRAL.reply, unchecked: false }],
    });
  });

  it("starts with no replay turn, and marks a turn the judge could not check", () => {
    expect(view("replaying", replayOf({}))).toMatchObject({ screen: "replay", replayTurns: [] });
    expect(view("replaying", replayOf({}, [NEUTRAL, { ...NEUTRAL, verdict: null }]))).toMatchObject({
      replayTurns: [
        { index: 3, unchecked: false },
        { index: 4, unchecked: true },
      ],
    });
  });

  it("shows only the opening line before a replay that forks at the very start", () => {
    const rendered = view("replaying", replayOf({ forkAfterTurn: 0, targetItemId: null, fallbackLevel: "fallback1" }));
    expect(rendered).toMatchObject({ screen: "replay", level: "fallback1", forkAfterTurn: 0, contextTurns: [mainTurns[0]] });
  });

  it("carries nothing of the target, of the result or of the main interview after the fork", () => {
    // Even on the turn that opened the target: the result goes out with the answer that ends the replay, not with the page.
    const text = JSON.stringify(view("replaying", replayOf({}, [NEUTRAL, { ...NEUTRAL, unlocked: target.id }])));
    for (const sealed of targetStrings) expect(text).not.toContain(sealed);
    for (const field of ["targetItemId", "outcome", "reveal", "target", "result", "decisionJson", "verdictJson", "analysisJson", "judgeLabel", "unlockedItemId"]) {
      expect(text).not.toContain(`"${field}"`);
    }
    for (const turn of mainTurns.filter((entry) => entry.index > FORK)) expect(text).not.toContain(turn.learnerText!);
  });

  it("falls back to the sealed offer when the session says replaying but has no branch", () => {
    const rendered = view("replaying", null);
    expect(rendered).toMatchObject({ screen: "reveal", reveal: { mode: "offer", replay: { target: null } }, replay: null });
    for (const sealed of targetStrings) expect(JSON.stringify(rendered)).not.toContain(sealed);
  });

  it.each(["revealed", "replaying"] as const)("%s: never carries an outcome, whatever the branch row says", (status) => {
    const rendered = view(status, replayOf({ result: "success" }, [OPENING]));
    expect(rendered).toMatchObject({ screen: "reveal", replay: null, reveal: { mode: "offer" } });
    for (const sealed of targetStrings) expect(JSON.stringify(rendered)).not.toContain(sealed);
  });
});

describe("Màn 6 in done mode: how the replay ended", () => {
  const done = (result: ReplayResultKind, specs: TurnSpec[], branch: Partial<BranchRow> = {}) => {
    const rendered = view("done", replayOf({ result, ...branch }, specs));
    if (rendered.screen !== "reveal") throw new Error(`expected the reveal screen, got ${rendered.screen}`);
    return rendered;
  };
  const targetNote = (rendered: ReturnType<typeof done>) => rendered.reveal.notes!.find((segment) => segment.match?.itemContent === target.content)!;

  it("success: the target is in the outcome, its note says the replay opened it, and it is not moved into what was told", () => {
    const rendered = done("success", [NEUTRAL, OPENING]);
    expect(rendered.replay).toEqual({
      outcome: { level: "primary", result: "success", target: { content: target.content, sampleQuestion: target.sample_question }, otherItem: null },
      turnCount: 2,
    });
    expect(targetNote(rendered).match).toEqual({ kind: "unconfirmed", itemContent: target.content, turn: 2, openedInReplay: true });
    // The numbers of the main interview are what they were.
    expect(rendered.reveal).toMatchObject({ mode: "done", told: 2, held: 1, missed: 8, recognized: { state: "count", value: 2 } });
    expect(rendered.reveal.toldItems.map((item) => item.content)).not.toContain(target.content);
    expect(rendered.reveal.missedItems.map((item) => item.content)).not.toContain(target.content);
    // No other note is said to have been opened in the replay.
    expect(rendered.reveal.notes!.filter((segment) => segment.match?.openedInReplay)).toHaveLength(1);
  });

  it.each([
    ["fail", [NEUTRAL, NEUTRAL, NEUTRAL]],
    ["stopped", [NEUTRAL]],
    ["skipped", []],
  ] as [ReplayResultKind, TurnSpec[]][])("%s: the target is shown, and its note keeps the sentence of the main interview alone", (result, specs) => {
    const rendered = done(result, specs);
    expect(rendered.replay).toMatchObject({ outcome: { level: "primary", result, target: { content: target.content }, otherItem: null }, turnCount: specs.length });
    expect(targetNote(rendered).match).toMatchObject({ kind: "unconfirmed", openedInReplay: false });
  });

  it("partial: names the other item, and the target's note is not marked as opened", () => {
    const other = chiThu.items.find((item) => item.id === "tried-methods")!;
    const rendered = done("partial", [{ ...NEUTRAL, unlocked: other.id, verdict: told(other.id) }, NEUTRAL, NEUTRAL]);
    expect(rendered.replay).toMatchObject({ outcome: { result: "partial", otherItem: other.content } });
    expect(targetNote(rendered).match).toMatchObject({ openedInReplay: false });
  });

  it("an opened target whose judge failed is not a told one", () => {
    const row = turnRow(0, { ...OPENING, verdict: null });
    expect(toReplayTurn(row)).toMatchObject({ unlockedItemId: target.id, disclosedItemIds: null });
  });

  it("fallback 1: how the three questions went, and the leading turn that was replayed", () => {
    const branch = { forkAfterTurn: 3, targetItemId: null, fallbackLevel: "fallback1" as const };
    const grounded: TurnSpec = { ...NEUTRAL, label: "confirm_grounded" };
    expect(done("success", [grounded, NEUTRAL, grounded], branch).replay).toEqual({
      outcome: { level: "fallback1", result: "success", leadingTurn: 4, grounded: 2, stillLeading: null, sampleQuestion: null },
      turnCount: 3,
    });

    const leading: TurnSpec = { question: "Chắc tại chị lười nên mới bỏ đúng không ạ?", reply: "Cũng không hẳn em.", label: "leading", span: [1, 3], judgeLabel: "leading" };
    expect(done("fail", [NEUTRAL, leading, NEUTRAL], branch).replay).toMatchObject({
      outcome: { result: "fail", stillLeading: { turn: 5, words: "tại chị lười" }, sampleQuestion: target.sample_question },
    });
    expect(done("fail", [NEUTRAL, { ...leading, judgeLabel: "open" }, NEUTRAL], branch).replay).toMatchObject({ outcome: { stillLeading: null } });
  });

  it("a session that had no replay moment has no outcome", () => {
    expect(view("done", null)).toMatchObject({ screen: "reveal", replay: null });
  });

  it("keeps ids, verdicts and decisions out of the props", () => {
    const text = JSON.stringify(done("partial", [{ ...NEUTRAL, unlocked: "tried-methods", verdict: told("tried-methods") }, NEUTRAL, NEUTRAL]));
    for (const field of ["targetItemId", "decisionJson", "verdictJson", "analysisJson", "judgeLabel", "unlockedItemId", "disclosedItemIds", "itemId"]) expect(text).not.toContain(`"${field}"`);
    expect(text).not.toContain('"tried-methods"');
  });
});

describe("ReplayResult: the fixed line of a leading-question replay that failed", () => {
  const base = { level: "fallback1" as const, result: "fail" as const, leadingTurn: 1, sampleQuestion: "Câu hỏi mẫu ạ?" };
  const html = (outcome: ReplayOutcome) => renderToStaticMarkup(createElement(ReplayResult, { outcome, persona: { displayName: "chị Thu", displayNameCapitalized: "Chị Thu" } }));

  it("quotes the question that was still leading", () => {
    expect(html({ ...base, grounded: 1, stillLeading: { turn: 2, words: "tại chị lười" } })).toContain("Lượt 2 vẫn thêm ý của bạn: “tại chị lười”.");
  });

  it("success: three questions without leading, and how many were grounded", () => {
    const shown = html({ ...base, result: "success", grounded: 2, stillLeading: null, sampleQuestion: null });
    expect(shown).toContain("Ba câu không dẫn dắt, có 2 câu bám vào lời chị Thu.");
    expect(shown).not.toContain("Câu hỏi mẫu");
  });

  it("a confirmed leading question is quoted on a stop too, before anything else", () => {
    expect(html({ ...base, result: "stopped", grounded: 1, stillLeading: { turn: 1, words: "tại chị lười" } })).toContain("Lượt 1 vẫn thêm ý của bạn: “tại chị lười”.");
  });

  it("Dừng with grounded questions and no confirmed leading one: how many were grounded before the stop", () => {
    const shown = html({ ...base, result: "stopped", grounded: 2, stillLeading: null });
    expect(shown).toContain("Có 2 câu bám vào lời chị Thu trước khi bạn dừng.");
    expect(shown).not.toContain("chưa có câu nào bám vào");
    expect(shown).toContain("Câu hỏi mẫu ạ?");
  });

  it("everything else: no question rested on the persona's words", () => {
    for (const result of ["fail", "stopped"] as const) {
      const shown = html({ ...base, result, grounded: 0, stillLeading: null });
      expect(shown).toContain("Lần này chưa có câu nào bám vào lời chị Thu.");
      expect(shown).not.toContain("trước khi bạn dừng");
      expect(shown).toContain("Câu hỏi mẫu ạ?");
    }
  });

  it("says nothing about the questions of a replay that was skipped", () => {
    const skipped = html({ ...base, result: "skipped", grounded: 0, stillLeading: null });
    expect(skipped).not.toContain("chưa có câu nào");
    expect(skipped).toContain("Câu hỏi mẫu ạ?");
  });

  it("renders an item's text as text, never as markup", () => {
    const hostile = html({ level: "primary", result: "fail", target: { content: "<img src=x onerror=alert(1)>", sampleQuestion: "<b>hỏi</b>" }, otherItem: null });
    expect(hostile).not.toContain("<img");
    expect(hostile).not.toContain("<b>");
  });
});

describe("replayOutcomeOf", () => {
  it("is null while the replay runs, so nothing held can be built from a branch without a result", () => {
    expect(replayOutcomeOf(chiThu, replayOf({}, [OPENING]))).toBeNull();
    expect(replayOutcomeOf(chiThu, replayOf({ result: "success", fallbackLevel: null }))).toBeNull();
  });
});

describe("toBrowserReveal: the note about a target the replay opened", () => {
  const notes = (status: string, replaySucceeded: boolean | undefined) => toBrowserReveal({ status, guess: 4, canvasText: NOTES, reveal, replaySucceeded })?.notes ?? [];
  const opened = (status: string, replaySucceeded: boolean | undefined) => notes(status, replaySucceeded).filter((segment) => segment.match?.openedInReplay);

  it("is marked only for a done session whose replay succeeded", () => {
    expect(opened("done", true).map((segment) => segment.text)).toEqual(["đang trả phí cho một app mà không dùng?"]);
    expect(opened("done", false)).toEqual([]);
    expect(opened("done", undefined)).toEqual([]);
  });

  it.each(["revealed", "replaying"])("%s: the flag changes nothing, and the target's note stays plain text", (status) => {
    expect(notes(status, true)).toEqual(notes(status, undefined));
    expect(opened(status, true)).toEqual([]);
    expect(JSON.stringify(notes(status, true))).not.toContain(target.content);
  });
});
