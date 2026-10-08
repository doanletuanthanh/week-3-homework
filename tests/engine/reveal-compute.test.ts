import { describe, expect, it } from "vitest";
import { buildItems, commentSlots, recognizedCount, resolveCanvasMatches, settle, topLockedItemId, type RawCanvasMatch } from "@/engine/reveal-compute";
import type { CanvasMatchKind } from "@/engine/reveal-types";
import { toBrowserReveal } from "@/engine/seal";
import { tokenize } from "@/engine/tokens";
import { CANVAS_EXPLANATION } from "@/strings/product-strings";
import { DROPPED, a, chiThu, engineSession, told } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, judgedNotes, playedSession, rangeOf, selectionOf } from "../helpers/reveal-fixtures";

const session = playedSession();
const state = session.state;

/** A canvas with the matches the end judge is scripted to return for it. */
type Canvas = { name: string; text: string; raw: (text: string) => RawCanvasMatch[]; expected: [phrase: string, kind: CanvasMatchKind, itemId: string | null][] };

const item = (text: string, phrase: string, itemId: string): RawCanvasMatch => ({ range: rangeOf(text, phrase), kind: "item", item_id: a("item", itemId), reason: "r" });
const never = (text: string, phrase: string): RawCanvasMatch => ({ range: rangeOf(text, phrase), kind: "never_said", item_id: null, reason: "r" });

const CANVASES: Canvas[] = [
  {
    name: "a paraphrase of an item the persona told",
    text: "tháng nào cũng chuyển 3 triệu cho bố mẹ",
    raw: (text) => [item(text, "chuyển 3 triệu cho bố mẹ", "money-home")],
    expected: [["chuyển 3 triệu cho bố mẹ", "told", "money-home"]],
  },
  {
    name: "an item whose hook was dropped but that was not told",
    text: "hình như có app trả phí mà bỏ không",
    raw: (text) => [item(text, "app trả phí mà bỏ không", "paid-app")],
    expected: [["app trả phí mà bỏ không", "unconfirmed", "paid-app"]],
  },
  {
    name: "an item that never showed in the transcript",
    text: "đoán: đang nợ thẻ",
    raw: (text) => [item(text, "đang nợ thẻ", "installment")],
    expected: [["đang nợ thẻ", "unrevealed", "installment"]],
  },
  {
    name: "an invention: something nobody said",
    text: "lương thấp nên không để dành được",
    raw: (text) => [never(text, "lương thấp nên không để dành được")],
    expected: [["lương thấp nên không để dành được", "never_said", null]],
  },
  {
    name: "the same item noted twice: counted once, the first stretch kept",
    text: "gửi ba mẹ 3 triệu\nlại ghi: gửi về nhà hằng tháng",
    raw: (text) => [item(text, "gửi về nhà hằng tháng", "money-home"), item(text, "gửi ba mẹ 3 triệu", "money-home")],
    expected: [["gửi ba mẹ 3 triệu", "told", "money-home"]],
  },
  {
    name: "a range outside the notes is dropped",
    text: "gửi ba mẹ 3 triệu",
    raw: (text) => [
      { range: [2, 9], kind: "item", item_id: a("item", "money-home"), reason: "r" },
      { range: [-1, 1], kind: "never_said", item_id: null, reason: "r" },
      item(text, "3 triệu", "last-attempt"),
    ],
    expected: [["3 triệu", "told", "last-attempt"]],
  },
  {
    name: "an empty or malformed range is dropped",
    text: "gửi ba mẹ 3 triệu",
    raw: () => [
      { range: [3, 1], kind: "item", item_id: a("item", "money-home"), reason: "r" },
      { range: [], kind: "item", item_id: a("item", "money-home"), reason: "r" },
      { range: [1], kind: "never_said", item_id: null, reason: "r" },
      { range: [0.5, 2], kind: "never_said", item_id: null, reason: "r" },
    ],
    expected: [],
  },
  {
    name: "a topic touched without the content, a negation, and a surface fact: the judge reports nothing, nothing is marked",
    text: "có nói về app\nkhông hề gửi tiền về nhà\nlàm kế toán",
    raw: () => [],
    expected: [],
  },
  {
    name: "a match that names no real item is dropped",
    text: "gửi ba mẹ 3 triệu",
    raw: (text) => [
      { ...item(text, "gửi ba mẹ", "money-home"), item_id: "I99" },
      { ...item(text, "3 triệu", "money-home"), item_id: "money-home" },
      { ...item(text, "ba mẹ", "money-home"), item_id: null },
    ],
    expected: [],
  },
  {
    name: "stretches that overlap: the one that starts first stays",
    text: "gửi ba mẹ 3 triệu mỗi tháng đều đặn",
    raw: (text) => [never(text, "3 triệu mỗi tháng"), item(text, "gửi ba mẹ 3 triệu", "money-home"), never(text, "đều đặn")],
    expected: [
      ["gửi ba mẹ 3 triệu", "told", "money-home"],
      ["đều đặn", "never_said", null],
    ],
  },
];

describe("resolveCanvasMatches: ten fixed canvases", () => {
  it.each(CANVASES)("$name", ({ text, raw, expected }) => {
    const matches = resolveCanvasMatches(chiThu, state, tokenize(text), raw(text));
    expect(matches.map((match) => [match.range, match.kind, match.itemId])).toEqual(expected.map(([phrase, kind, itemId]) => [rangeOf(text, phrase), kind, itemId]));
  });

  it.each(CANVASES)("$name: the notes are marked exactly where the matches are, each with its FR-48a sentence", ({ text, raw, expected }) => {
    const basis = basisOf(session, text);
    const matches = resolveCanvasMatches(chiThu, state, basis.canvasTokens, raw(text));
    const reveal = assemble(basis, { ...fullParts(basis), judge: { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches } });
    // `done`: nothing is held back, so every match is on the page.
    const notes = toBrowserReveal({ status: "done", guess: 3, canvasText: text, reveal })!.notes!;

    // Marked and plain stretches together are the notes as written, character for character.
    expect(notes.map((segment) => segment.text).join("")).toBe(text);
    const marked = notes.filter((segment) => segment.match !== null);
    expect(marked.map((segment) => [segment.text, segment.match!.kind])).toEqual(expected.map(([phrase, kind]) => [phrase, kind]));
    for (const segment of marked) expect(CANVAS_EXPLANATION[segment.match!.kind]).toBeTruthy();
  });

  it("counts an item towards NHẬN BIẾT only when the transcript showed it", () => {
    const basis = basisOf(session, NOTES);
    const matches = resolveCanvasMatches(
      chiThu,
      state,
      basis.canvasTokens,
      [
        item(NOTES, "mỗi tháng gửi ba mẹ 3 triệu", "money-home"),
        item(NOTES, "đang trả phí cho một app mà không dùng?", "paid-app"),
        item(NOTES, "chắc có nợ thẻ tín dụng", "installment"),
        never(NOTES, "lương thấp nên khó để dành"),
      ],
    );
    expect(matches.map((match) => match.kind)).toEqual(["told", "unconfirmed", "unrevealed", "never_said"]);
    expect(recognizedCount(matches)).toBe(2);
    expect(recognizedCount(matches, "paid-app")).toBe(1);
  });

  it("keeps the judge's reason with the match and nowhere a learner can see", () => {
    const basis = basisOf(session, NOTES);
    const reveal = assemble(basis, fullParts(basis));
    expect(reveal.canvasMatches.every((match) => match.reason === "lý do nội bộ của judge")).toBe(true);
    expect(JSON.stringify(toBrowserReveal({ status: "done", guess: 3, canvasText: NOTES, reveal }))).not.toContain("lý do nội bộ");
  });
});

describe("settle", () => {
  it("applies the end judge's verdict about the last turn, and applying it twice changes nothing", () => {
    const played = engineSession();
    played.turn({ topic_tags: [a("tag", "money-home")] });
    played.turn({ prev_turn_verdict: told("money-home"), topic_tags: [a("tag", "paid-app")] });
    const basis = basisOf(played);
    expect(basis.state.ledger).toEqual([]);

    const judge = { ok: true as const, verdict: { hook_dropped: true, disclosed_item_ids: [], violations: [] }, matches: [] };
    const once = settle(basis, judge);
    expect(once.state.ledger).toMatchObject([{ itemId: "paid-app", droppedAt: 2, ignoredAt: null }]);
    expect(settle(once, judge)).toEqual(once);
    expect(settle(basis, { ok: false })).toBe(basis);
    expect(settle(basis, undefined)).toBe(basis);
  });

  it("flags the last turn when the verdict found a violation", () => {
    const basis = basisOf(playedSession());
    const violated = settle(basis, { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: ["avoid-paid-app"] }, matches: [] });
    expect(violated.turns.map((turn) => turn.flagged)).toEqual([false, false, false, false, false, false, true]);
  });
});

describe("buildItems", () => {
  const basis = basisOf(session);
  const items = buildItems(basis, selectionOf(basis));
  const of = (id: string) => items.find((entry) => entry.id === id)!;

  it("lists every item once: told, held for the replay, or missed", () => {
    expect(items.map((entry) => entry.id)).toEqual(chiThu.items.map((entry) => entry.id));
    expect(items.filter((entry) => entry.state === "told").map((entry) => [entry.id, entry.toldTurn])).toEqual([
      ["last-attempt", 3],
      ["money-home", 1],
    ]);
    expect(items.filter((entry) => entry.state === "held").map((entry) => entry.id)).toEqual(["paid-app"]);
    expect(items.filter((entry) => entry.state === "missed")).toHaveLength(chiThu.items.length - 3);
  });

  it("gives a missed item the turn of its hook and the question asked right after", () => {
    expect(of("shame").hook).toEqual({
      turn: 3,
      personaText: "Câu trả lời ở lượt 3.",
      next: { turn: 4, learnerText: "Chắc tại chị lười nên mới bỏ đúng không ạ?" },
    });
    expect(of("small-spend").hook).toBeNull();
  });

  it("gives a missed trust item the turns that lowered openness, and no other item any", () => {
    expect(of("installment").trustTurns).toEqual([4]);
    expect(of("roommate").trustTurns).toEqual([4]);
    expect(items.filter((entry) => entry.path !== "trust").every((entry) => entry.trustTurns.length === 0)).toBe(true);
  });

  it("drops the hook evidence of a persona turn that broke a do-not-assert", () => {
    const flagged = { ...basis, turns: basis.turns.map((turn) => (turn.index === 3 ? { ...turn, flagged: true } : turn)) };
    expect(buildItems(flagged, selectionOf(flagged)).find((entry) => entry.id === "shame")!.hook).toBeNull();
  });

  it("names the heaviest item still locked, first in scenario order", () => {
    // paid-app, shame and installment all weigh 3; paid-app comes first.
    expect(topLockedItemId(chiThu, state)).toBe("paid-app");
    expect(topLockedItemId(chiThu, { ...state, unlocked: chiThu.items.map((entry) => ({ itemId: entry.id, turn: 1 })) })).toBeNull();
  });
});

describe("commentSlots (addendum §3.3)", () => {
  const basis = basisOf(session, NOTES);
  const slots = commentSlots(basis, selectionOf(basis), judgedNotes().matches);

  it("orders praise first, then the faults by how many turns show them, then the habit card", () => {
    expect(slots.map((slot) => [slot.id, slot.type, slot.turns])).toEqual([
      ["S1", "praise", [3]],
      ["S2", "hypothetical_future", [5, 6]],
      ["S3", "leading", [4]],
      ["S4", "habit", [3, 4]],
    ]);
  });

  it("hands the generator the learner's added words, cut by token index", () => {
    expect(slots.find((slot) => slot.type === "leading")!.spans).toEqual([{ turn: 4, text: "tại chị lười" }]);
  });

  it("needs two questions about the future, and one leading question", () => {
    const played = engineSession();
    played.turn({ question_type: "hypothetical_future" });
    played.turn({ label: "leading", introduced_span: [0, 0] });
    const one = basisOf(played);
    expect(commentSlots(one, selectionOf(one), []).map((slot) => slot.type)).toEqual(["leading"]);
  });

  it("praises the grounded question that opened the heaviest item, else the earliest one", () => {
    const played = engineSession();
    played.turn({ topic_tags: [a("tag", "paid-app")] });
    played.turn({ prev_turn_verdict: DROPPED, label: "boundary_probe", grounded_turn_id: 1 });
    played.turn({ hook_id: a("hook", "paid-app"), label: "confirm_grounded", grounded_turn_id: 1 });
    const opened = basisOf(played);
    expect(opened.state.unlocked).toEqual([{ itemId: "paid-app", turn: 3 }]);
    expect(commentSlots(opened, selectionOf(opened), [])[0]).toMatchObject({ type: "praise", turns: [3] });

    const none = engineSession();
    none.turn({});
    none.turn({ label: "boundary_probe", grounded_turn_id: 1 });
    none.turn({ label: "confirm_grounded", grounded_turn_id: 2 });
    const plain = basisOf(none);
    expect(commentSlots(plain, selectionOf(plain), [])[0]).toMatchObject({ type: "praise", turns: [2] });
  });

  it("writes no praise when there was no grounded question", () => {
    const played = engineSession();
    played.turn({});
    const basis = basisOf(played);
    expect(commentSlots(basis, selectionOf(basis), [])).toEqual([]);
  });

  it("triggers 'heard but did not follow up' for a noted item whose hook was ignored, never for the replay target", () => {
    // Two ignored hooks: paid-app (the heavier one, so the replay target) and small-spend.
    const played = engineSession();
    played.turn({ topic_tags: [a("tag", "paid-app")] });
    played.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "small-spend")] });
    played.turn({ prev_turn_verdict: DROPPED });
    const notes = "app trả phí bỏ không\nkhoản lặt vặt không ghi";
    const noted = basisOf(played, notes);
    const selection = selectionOf(noted);
    expect(selection).toMatchObject({ level: "primary", targetItemId: "paid-app" });

    const matches = resolveCanvasMatches(chiThu, noted.state, noted.canvasTokens, [
      item(notes, "app trả phí bỏ không", "paid-app"),
      item(notes, "khoản lặt vặt không ghi", "small-spend"),
    ]);
    const heard = commentSlots(noted, selection, matches).find((slot) => slot.type === "heard_not_followed")!;
    expect(heard).toMatchObject({
      turns: [3],
      canvas: { range: rangeOf(notes, "khoản lặt vặt không ghi"), text: "khoản lặt vặt không ghi", itemId: "small-spend" },
    });

    // Only the target is in the notes: the fixed diagnosis line covers it, no comment is triggered.
    const targetOnly = matches.filter((match) => match.itemId === "paid-app");
    expect(commentSlots(noted, selection, targetOnly).map((slot) => slot.type)).toEqual(["habit"]);
  });

  it("shows the habit card only from the scenario's threshold of ignored hooks", () => {
    const played = engineSession();
    played.turn({ topic_tags: [a("tag", "paid-app")] });
    played.turn({ prev_turn_verdict: DROPPED });
    const once = basisOf(played);
    expect(chiThu.habit_threshold).toBe(2);
    expect(commentSlots(once, selectionOf(once), []).some((slot) => slot.type === "habit")).toBe(false);
  });

  it("puts each turn in one comment only and never shows more than three", () => {
    const played = engineSession();
    // Turns 1 and 2 are both leading and about the future; turns 3 and 4 only about the future.
    played.turn({ label: "leading", introduced_span: [0, 0], question_type: "hypothetical_future" });
    played.turn({ label: "leading", introduced_span: [0, 0], question_type: "hypothetical_future" });
    played.turn({ question_type: "hypothetical_future" });
    played.turn({ question_type: "hypothetical_future" });
    played.turn({ label: "boundary_probe", grounded_turn_id: 4 });
    const basis = basisOf(played);
    const slots = commentSlots(basis, selectionOf(basis), []);

    expect(slots.map((slot) => [slot.type, slot.turns])).toEqual([
      ["praise", [5]],
      ["hypothetical_future", [1, 2, 3, 4]],
    ]);
    const cited = slots.flatMap((slot) => slot.turns);
    expect(new Set(cited).size).toBe(cited.length);
  });

  it("does not build a comment on a persona turn that broke a do-not-assert", () => {
    const flagged = { ...basis, turns: basis.turns.map((turn) => (turn.index === 2 ? { ...turn, flagged: true } : turn)) };
    // The praised question at turn 3 was grounded on turn 2, and paid-app's hook was dropped there.
    const slots = commentSlots(flagged, selectionOf(flagged), []);
    expect(slots.some((slot) => slot.type === "praise")).toBe(false);
    expect(slots.some((slot) => slot.type === "habit")).toBe(false);
  });
});
