import { describe, expect, it } from "vitest";
import { resolveCanvasMatches } from "@/engine/reveal-compute";
import type { JudgePart, RevealBasis, RevealJson } from "@/engine/reveal-types";
import { toBrowserResult, toBrowserReveal, toBrowserTranscript } from "@/engine/seal";
import { SESSION_STATUSES } from "@/db/schema";
import type { ScenarioItem } from "@/scenario/schema";
import { DROPPED, a, chiThu, engineSession } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, generatedClaims, judgedNotes, playedSession, rangeOf, verifierFor } from "../helpers/reveal-fixtures";

type Fixture = { name: string; basis: RevealBasis; notes: string; reveal: RevealJson };

const itemOf = (id: string) => chiThu.items.find((item) => item.id === id)!;
const target = itemOf("paid-app");

/** Every authored string of an item, and its id: none may be in a payload while the item is sealed. */
const sealedStringsOf = (item: ScenarioItem) => [item.content, item.sample_question, item.topic_tag, item.hook_line, item.do_not_assert.text, item.do_not_assert.id, `"${item.id}"`];
const leaked = (payload: unknown, item: ScenarioItem) => sealedStringsOf(item).filter((text) => JSON.stringify(payload).includes(text));

function judgeOf(basis: RevealBasis, notes: string, noted: [phrase: string, itemId: string][]): JudgePart {
  const raw = noted.map(([phrase, itemId]) => ({ range: rangeOf(notes, phrase), kind: "item" as const, item_id: a("item", itemId), reason: "r" }));
  return { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches: resolveCanvasMatches(chiThu, basis.state, basis.canvasTokens, raw) };
}

const transcriptOf = (basis: RevealBasis) => basis.turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));

/** The words a transcript marks as added by the learner, per turn. */
const marks = (basis: RevealBasis, reveal: RevealJson | null, status: string) =>
  toBrowserTranscript(transcriptOf(basis), reveal, status).flatMap((turn) =>
    turn.leading ? [[turn.index, turn.learnerText!.slice(turn.leading.start, turn.leading.end)] as const] : [],
  );

// Three sessions whose replay target is paid-app, each with notes that match it.

function mainFixture(): Fixture {
  const basis = basisOf(playedSession(), NOTES);
  return { name: "told items, a leading turn elsewhere", basis, notes: NOTES, reveal: assemble(basis, fullParts(basis)) };
}

function notedFixture(): Fixture {
  const session = engineSession();
  session.turn({ topic_tags: [a("tag", "paid-app")] });
  session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "small-spend")], label: "leading", introduced_span: [0, 1] });
  session.turn({ prev_turn_verdict: DROPPED });
  const notes = "app trả phí bỏ không\nkhoản lặt vặt không ghi";
  const basis = basisOf(session, notes);
  const judge = judgeOf(basis, notes, [
    ["app trả phí bỏ không", "paid-app"],
    ["khoản lặt vặt không ghi", "small-spend"],
  ]);
  return { name: "a second ignored hook with a note comment", basis, notes, reveal: assemble(basis, fullParts(basis, judge)) };
}

function leadingHookFixture(): Fixture {
  const session = engineSession();
  // The question that got the hook dropped was leading: turn 1 is both the hook turn and a leading turn.
  session.turn({ topic_tags: [a("tag", "paid-app")], label: "leading", introduced_span: [0, 1] });
  session.turn({ prev_turn_verdict: DROPPED });
  session.turn({ label: "leading", introduced_span: [2, 3], topic_tags: [a("tag", "installment")] });
  const notes = "có vẻ đang trả tiền cho app nào đó";
  const basis = basisOf(session, notes);
  const judge = judgeOf(basis, notes, [["đang trả tiền cho app nào đó", "paid-app"]]);
  return { name: "the hook turn is itself a leading turn", basis, notes, reveal: assemble(basis, fullParts(basis, judge)) };
}

const PRIMARY = [mainFixture(), notedFixture(), leadingHookFixture()];

function fallbackFixture(): Fixture {
  const session = engineSession();
  session.turn({ label: "leading", introduced_span: [0, 1], topic_tags: [a("tag", "installment")] });
  session.turn({});
  session.turn({ label: "leading", introduced_span: [2, 3] });
  const notes = "ghi vội vài dòng";
  const basis = basisOf(session, notes);
  return { name: "fallback 1", basis, notes, reveal: assemble(basis, fullParts(basis, judgeOf(basis, notes, []))) };
}

const view = (fixture: Fixture, status: string, guess: number | null = 4) =>
  toBrowserReveal({ status, guess, canvasText: fixture.notes, reveal: fixture.reveal });

describe("toBrowserReveal: default deny", () => {
  const fixture = mainFixture();

  it.each(SESSION_STATUSES.filter((status) => !["revealed", "replaying", "done"].includes(status)))("sends nothing for a %s session", (status) => {
    expect(view(fixture, status)).toBeNull();
    expect(toBrowserResult(status, fixture.reveal)).toBeNull();
  });

  it("sends nothing for a status it does not know", () => {
    expect(view(fixture, "something_new")).toBeNull();
    expect(toBrowserTranscript(transcriptOf(fixture.basis), fixture.reveal, "something_new").every((turn) => turn.leading === null)).toBe(true);
  });

  it("sends nothing before the guess is stored, or before a result exists", () => {
    expect(view(fixture, "revealed", null)).toBeNull();
    expect(toBrowserReveal({ status: "revealed", guess: 4, canvasText: NOTES, reveal: null })).toBeNull();
    expect(toBrowserReveal({ status: "done", guess: null, canvasText: NOTES, reveal: fixture.reveal })).toBeNull();
  });

  it("gives result numbers to a list for a done session only", () => {
    expect(toBrowserResult("done", fixture.reveal)).toEqual({ told: 2, total: 11, recognized: { state: "count", value: 2 } });
    expect(toBrowserResult("revealed", fixture.reveal)).toBeNull();
    expect(toBrowserResult("replaying", fixture.reveal)).toBeNull();
    expect(toBrowserResult("done", null)).toBeNull();
  });
});

describe.each(PRIMARY)("sealing a primary replay target: $name", (fixture) => {
  const { reveal, basis } = fixture;

  it("has paid-app as the target, noted in the notes", () => {
    expect(reveal.replay).toMatchObject({ level: "primary", targetItemId: "paid-app" });
    expect(reveal.canvasMatches.some((match) => match.itemId === "paid-app")).toBe(true);
    expect(reveal.items.find((item) => item.id === "paid-app")!.state).toBe("held");
  });

  it.each(["revealed", "replaying"])("%s: nothing of the target is in the reveal payload", (status) => {
    const payload = view(fixture, status)!;
    expect(leaked(payload, target)).toEqual([]);
    expect(payload.mode).toBe("offer");
    expect(payload.held).toBe(1);
    expect(payload.replay).toMatchObject({ level: "primary", target: null });

    // Neither told nor missed, and the missed count leaves it out.
    expect(payload.toldItems.length + payload.missedItems.length + 1).toBe(chiThu.items.length);
    expect(payload.missed).toBe(payload.missedItems.length);
    expect([...payload.toldItems, ...payload.missedItems].map((item) => item.content)).not.toContain(target.content);
  });

  it.each(["revealed", "replaying"])("%s: the note that matches the target is plain text and is not counted", (status) => {
    const payload = view(fixture, status)!;
    const full = reveal.counts.recognizedFull!;
    expect(payload.recognized).toEqual({ state: "count", value: full - 1 });
    expect(payload.notes!.filter((segment) => segment.match !== null)).toHaveLength(reveal.canvasMatches.length - 1);
    expect(payload.notes!.map((segment) => segment.text).join("")).toBe(fixture.notes);
    expect(payload.notes!.some((segment) => segment.match?.itemContent === target.content)).toBe(false);
  });

  it.each(["revealed", "replaying"])("%s: no claim about the target or its hook turn is in the payload", (status) => {
    const payload = view(fixture, status)!;
    const hookTurn = reveal.replay.level === "primary" ? reveal.replay.forkAfterTurn : -1;
    const sent = [payload.takeaway.praise, ...payload.takeaway.comments, payload.takeaway.habit].filter((claim) => claim !== null);
    expect(sent.every((claim) => !claim.turns.includes(hookTurn))).toBe(true);
    const sealedIds = reveal.claims.filter((claim) => claim.sealed).map((claim) => claim.id);
    expect(sent.map((claim) => claim.id).filter((id) => sealedIds.includes(id))).toEqual([]);
    expect(payload.missedItems.flatMap((item) => item.trustTurns)).not.toContain(hookTurn);
  });

  it.each(["revealed", "replaying"])("%s: the transcript has no mark on the target's hook turn", (status) => {
    const hookTurn = reveal.replay.level === "primary" ? reveal.replay.forkAfterTurn : -1;
    const turns = toBrowserTranscript(transcriptOf(basis), reveal, status);
    expect(turns.find((turn) => turn.index === hookTurn)!.leading).toBeNull();
    expect(leaked(turns, target)).toEqual([]);
    expect(Object.keys(turns[1]).sort()).toEqual(["index", "leading", "learnerText", "personaText"]);
  });

  it("done: everything that was held is there", () => {
    const payload = view(fixture, "done")!;
    expect(payload.mode).toBe("done");
    expect(payload.replay).toMatchObject({ level: "primary", target: { content: target.content, sampleQuestion: target.sample_question } });
    expect(payload.recognized).toEqual({ state: "count", value: reveal.counts.recognizedFull });
    expect(payload.notes!.filter((segment) => segment.match !== null)).toHaveLength(reveal.canvasMatches.length);
    expect(payload.notes!.some((segment) => segment.match?.itemContent === target.content)).toBe(true);
    const sent = [payload.takeaway.praise, ...payload.takeaway.comments, payload.takeaway.habit].filter((claim) => claim !== null);
    expect(sent.map((claim) => claim.id)).toEqual(reveal.claims.filter((claim) => claim.shown).map((claim) => claim.id));
    // The target is shown in its own card: it does not move into the told list, and the numbers of the session stand.
    expect(payload.toldItems.map((item) => item.content)).not.toContain(target.content);
    expect(payload.told).toBe(reveal.counts.told);
  });
});

describe("what the primary fixtures seal, case by case", () => {
  it("a second ignored hook keeps its note comment while the target's note stays hidden", () => {
    const fixture = notedFixture();
    const payload = view(fixture, "revealed")!;
    expect(payload.takeaway.comments.map((claim) => [claim.type, claim.canvasQuote, claim.turns])).toEqual([
      ["leading", null, [2]],
      ["heard_not_followed", "khoản lặt vặt không ghi", [3]],
    ]);
    expect(payload.notes).toEqual([
      { text: "app trả phí bỏ không\n", match: null },
      { text: "khoản lặt vặt không ghi", match: { kind: "unconfirmed", itemContent: itemOf("small-spend").content, turn: 2, openedInReplay: false } },
    ]);
  });

  it("a leading comment that cites the hook turn is held whole, and that turn loses its mark and its trust mention", () => {
    const fixture = leadingHookFixture();
    expect(fixture.reveal.claims.find((claim) => claim.slot === "leading")).toMatchObject({ citedTurns: [1, 3], sealed: true, shown: true });

    const sealed = view(fixture, "revealed")!;
    expect(sealed.takeaway.comments).toEqual([]);
    // Something is held back, so the screen must not say there was nothing to note.
    expect(sealed.takeaway.emptyLine).toBe(false);
    expect(sealed.missedItems.find((item) => item.path === "trust")!.trustTurns).toEqual([3]);
    expect(marks(fixture.basis, fixture.reveal, "revealed")).toEqual([[3, "thêm cho"]]);

    const open = view(fixture, "done")!;
    expect(open.takeaway.comments.map((claim) => [claim.type, claim.turns, claim.addedWords])).toEqual([["leading", [1, 3], "Chị kể"]]);
    expect(open.missedItems.find((item) => item.path === "trust")!.trustTurns).toEqual([1, 3]);
    expect(marks(fixture.basis, fixture.reveal, "done")).toEqual([
      [1, "Chị kể"],
      [3, "thêm cho"],
    ]);
  });
});

describe("sealing fallback 1: the leading turn being replayed", () => {
  const fixture = fallbackFixture();
  const { reveal, basis } = fixture;

  it("replays turn 1", () => {
    expect(reveal.replay).toEqual({ level: "fallback1", forkAfterTurn: 0, leadingTurn: 1 });
    expect(reveal.claims.find((claim) => claim.slot === "leading")).toMatchObject({ citedTurns: [1, 3], sealed: true, shown: true });
  });

  it.each(["revealed", "replaying"])("%s: no claim, added words or mark of that turn is in a payload", (status) => {
    const payload = view(fixture, status)!;
    expect(payload.replay).toEqual({ level: "fallback1", returnTurn: 1, diagnosis: { key: "added_own_idea", turn: 1 }, target: null });
    // There is no held item in fallback 1.
    expect(payload.held).toBe(0);
    expect(payload.takeaway.comments).toEqual([]);
    expect(JSON.stringify(payload.takeaway)).not.toContain("Chị kể");
    expect(payload.missedItems.flatMap((item) => item.trustTurns)).not.toContain(1);
    expect(marks(basis, reveal, status)).toEqual([[3, "thêm cho"]]);
  });

  it("done: the comment and the mark of that turn are there", () => {
    const payload = view(fixture, "done")!;
    expect(payload.takeaway.comments.map((claim) => [claim.turns, claim.addedWords])).toEqual([[[1, 3], "Chị kể"]]);
    expect(marks(basis, reveal, "done")).toEqual([
      [1, "Chị kể"],
      [3, "thêm cho"],
    ]);
  });
});

describe("toBrowserReveal: the offer screen of the main fixture", () => {
  const fixture = mainFixture();
  const payload = view(fixture, "revealed")!;

  it("carries the two numbers, the replay offer and the lists in the order of the screen", () => {
    expect(payload).toMatchObject({
      mode: "offer",
      guess: 4,
      told: 2,
      total: 11,
      held: 1,
      missed: 8,
      recognized: { state: "count", value: 1 },
      replay: { level: "primary", returnTurn: 3, diagnosis: { key: "heard_not_followed", turn: 2 }, target: null },
    });
    expect(payload.toldItems).toEqual([
      { content: itemOf("last-attempt").content, turn: 3 },
      { content: itemOf("money-home").content, turn: 1 },
    ]);
  });

  it("gives each marked note what its FR-48a sentence needs: the kind, the item, and a turn to link to", () => {
    expect(payload.notes).toEqual([
      { text: "kế toán, ở trọ với bạn\n", match: null },
      { text: "mỗi tháng gửi ba mẹ 3 triệu", match: { kind: "told", itemContent: itemOf("money-home").content, turn: 1, openedInReplay: false } },
      // The target's note, as plain text.
      { text: "\nđang trả phí cho một app mà không dùng?\n", match: null },
      { text: "chắc có nợ thẻ tín dụng", match: { kind: "unrevealed", itemContent: itemOf("installment").content, turn: null, openedInReplay: false } },
      { text: "\n", match: null },
      { text: "lương thấp nên khó để dành", match: { kind: "never_said", itemContent: null, turn: null, openedInReplay: false } },
    ]);
  });

  it("sends the comments the verifier passed, praise apart, with the quotes cut by code", () => {
    expect(payload.takeaway.praise).toMatchObject({ type: "praise", turns: [3], quote: "Lần gần nhất chị ghi chi tiêu là khi nào ạ?", suggestedQuestion: null });
    expect(payload.takeaway.comments.map((claim) => [claim.type, claim.turns, claim.addedWords])).toEqual([
      ["hypothetical_future", [5, 6], null],
      ["leading", [4], "tại chị lười"],
    ]);
    // The habit card counts the target's ignored hook, so it waits for the replay to end.
    expect(payload.takeaway.habit).toBeNull();
    expect(view(fixture, "replaying")!.takeaway.habit).toBeNull();
    expect(view(fixture, "done")!.takeaway.habit).toMatchObject({ type: "habit", turns: [3, 4] });
    expect(payload.takeaway.emptyLine).toBe(false);
  });

  it("never sends the internal fields of a claim or a match", () => {
    const text = JSON.stringify(payload);
    for (const field of ["sealed", "shown", "reason", "itemId", "verifierChecks", "canvasMatches", "weight"]) expect(text).not.toContain(`"${field}"`);
    for (const item of chiThu.items) expect(text).not.toContain(`"${item.id}"`);
  });

  it("marks a leading question in the transcript only where the verifier agreed the words were new", () => {
    expect(marks(fixture.basis, fixture.reveal, "revealed")).toEqual([[4, "tại chị lười"]]);

    const parts = { judge: judgedNotes(), generator: generatedClaims(fixture.basis, judgedNotes()) };
    const disputed = assemble(fixture.basis, { ...parts, verifier: verifierFor(fixture.basis, parts, (check) => check.kind === "leading_novelty") });
    expect(marks(fixture.basis, disputed, "done")).toEqual([]);
  });

  it("sends a transcript of plain texts while the session has no reveal to show", () => {
    for (const status of ["interviewing", "withdrawn"]) expect(marks(fixture.basis, fixture.reveal, status)).toEqual([]);
    expect(marks(fixture.basis, null, "revealed")).toEqual([]);
  });
});

describe("toBrowserReveal: empty, unmatched and degraded states", () => {
  const session = playedSession();

  it("empty notes: no NHẬN BIẾT number at all, and no notes section", () => {
    const basis = basisOf(session, "");
    const reveal = assemble(basis, fullParts(basis, { ...judgedNotes(), matches: [] }));
    const payload = toBrowserReveal({ status: "revealed", guess: 0, canvasText: "", reveal })!;
    expect(payload.recognized).toEqual({ state: "empty" });
    expect(payload.notes).toBeNull();
    expect(payload.replay).toMatchObject({ diagnosis: { key: "changed_topic", turn: 2 } });
  });

  it("notes that match nothing: a count of zero, shown as the 'none yet' line, and the notes as plain text", () => {
    const basis = basisOf(session, "kế toán");
    const reveal = assemble(basis, fullParts(basis, { ...judgedNotes(), matches: [] }));
    const payload = toBrowserReveal({ status: "revealed", guess: 0, canvasText: "kế toán", reveal })!;
    expect(payload.recognized).toEqual({ state: "count", value: 0 });
    expect(payload.notes).toEqual([{ text: "kế toán", match: null }]);
  });

  it("end judge failed: the notes are shown ungraded and NHẬN BIẾT is hidden", () => {
    const basis = basisOf(session, NOTES);
    const reveal = assemble(basis, { ...fullParts(basis), judge: { ok: false } });
    const payload = toBrowserReveal({ status: "revealed", guess: 2, canvasText: NOTES, reveal })!;
    expect(payload.recognized).toEqual({ state: "ungraded" });
    expect(payload.notes).toEqual([{ text: NOTES, match: null }]);
    expect(toBrowserResult("done", reveal)).toEqual({ told: 2, total: 11, recognized: { state: "ungraded" } });
  });

  it("generator or verifier failed: only the empty line is left of the takeaway, without praise", () => {
    const basis = basisOf(session, NOTES);
    for (const parts of [
      { ...fullParts(basis), verifier: { ok: false as const } },
      { judge: judgedNotes(), generator: { ok: false as const }, verifier: verifierFor(basis, { judge: judgedNotes(), generator: { ok: false } }) },
    ]) {
      const payload = toBrowserReveal({ status: "revealed", guess: 2, canvasText: NOTES, reveal: assemble(basis, parts) })!;
      expect(payload.takeaway).toEqual({ praise: null, comments: [], habit: null, emptyLine: true });
    }
  });

  it("no replay moment: the sample question of the heaviest locked item stands in for the offer", () => {
    const plain = engineSession();
    plain.turn({});
    const basis = basisOf(plain);
    const reveal = assemble(basis, fullParts(basis, { ...judgedNotes(), matches: [] }));
    const payload = toBrowserReveal({ status: "done", guess: 0, canvasText: "", reveal })!;
    expect(payload.replay).toEqual({ level: "none", sampleQuestion: itemOf("paid-app").sample_question });
    expect(payload.held).toBe(0);
    expect(payload.missed).toBe(11);
    expect(payload.takeaway).toEqual({ praise: null, comments: [], habit: null, emptyLine: true });
  });
});
