import { describe, expect, it } from "vitest";
import { buildChecks, resolveClaims, resolveVerdicts, type RawClaim } from "@/engine/reveal-claims";
import { commentSlots, resolveCanvasMatches, settle } from "@/engine/reveal-compute";
import type { RevealBasis, RevealParts } from "@/engine/reveal-types";
import { DROPPED, a, chiThu, engineSession } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, generatedClaims, judgedNotes, playedSession, rangeOf, selectionOf, verifierFor } from "../helpers/reveal-fixtures";

const basis = basisOf(playedSession(), NOTES);
const selection = selectionOf(basis);
const slots = commentSlots(basis, selection, judgedNotes().matches);
const resolve = (raw: RawClaim[], on: RevealBasis = basis) => resolveClaims(raw, { basis: on, slots: commentSlots(on, selectionOf(on), []), selection: selectionOf(on) });

const claim = (overrides: Partial<RawClaim>): RawClaim => ({
  slot: "S3",
  text: "Bạn tự thêm một nguyên nhân vào câu hỏi.",
  cited_turns: [4],
  item_id: null,
  canvas_range: null,
  suggested_question: "Vì sao chị dừng ghi ạ?",
  ...overrides,
});

describe("resolveClaims: a claim with a broken reference is dropped whole (FR-21)", () => {
  it("keeps a well-formed claim, gives it an id of its own and the kind of its slot", () => {
    // Slots here: S1 praise [3], S2 hypothetical_future [5, 6], S3 leading [4], S4 habit [3, 4].
    expect(slots.map((slot) => slot.type)).toEqual(["praise", "hypothetical_future", "leading", "habit"]);
    expect(resolve([claim({})])).toEqual([
      { id: "C1", slot: "leading", text: "Bạn tự thêm một nguyên nhân vào câu hỏi.", citedTurns: [4], itemId: null, canvasRange: null, suggestedQuestion: "Vì sao chị dừng ghi ạ?", sealed: false },
    ]);
  });

  it.each([
    ["a slot code never opened", { slot: "S9" }],
    ["a turn that is not one of the slot's", { cited_turns: [4, 5] }],
    ["a turn that does not exist", { cited_turns: [44] }],
    ["an item that does not exist", { item_id: "I99" }],
    ["a scenario id instead of an alias", { item_id: "paid-app" }],
    ["a notes range outside the notes", { canvas_range: [0, 9999] }],
    ["an empty notes range", { canvas_range: [5, 2] }],
    ["no text", { text: "   " }],
    ["no turn and no notes range to cite", { cited_turns: [] }],
    ["a fault without a better question", { suggested_question: null }],
    ["a fault with a blank better question", { suggested_question: "  " }],
  ] as [string, Partial<RawClaim>][])("drops a claim with %s", (_name, overrides) => {
    expect(resolve([claim(overrides)])).toEqual([]);
  });

  it("keeps the first claim of a slot and ignores a second one", () => {
    const kept = resolve([claim({ text: "Thứ nhất." }), claim({ text: "Thứ hai." })]);
    expect(kept.map((entry) => entry.text)).toEqual(["Thứ nhất."]);
  });

  it("returns the claims in slot order whatever order the model wrote them in, praise and habit without a question", () => {
    const kept = resolve([
      claim({ slot: "S4", cited_turns: [3, 4], suggested_question: "Bị bỏ qua?" }),
      claim({}),
      claim({ slot: "S1", cited_turns: [3], suggested_question: "Bị bỏ qua?" }),
    ]);
    expect(kept.map((entry) => [entry.id, entry.slot, entry.suggestedQuestion])).toEqual([
      ["C1", "praise", null],
      ["C2", "leading", "Vì sao chị dừng ghi ạ?"],
      ["C3", "habit", null],
    ]);
  });

  it("drops one broken claim and keeps the others", () => {
    const kept = resolve([claim({ cited_turns: [99] }), claim({ slot: "S2", cited_turns: [5, 6] })]);
    expect(kept.map((entry) => entry.slot)).toEqual(["hypothetical_future"]);
  });
});

/** Two ignored hooks, both in the notes: paid-app is the replay target, small-spend gets the note comment. */
function notedSession() {
  const session = engineSession();
  session.turn({ topic_tags: [a("tag", "paid-app")] });
  session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "small-spend")], label: "leading", introduced_span: [0, 1] });
  session.turn({ prev_turn_verdict: DROPPED });
  const notes = "app trả phí bỏ không\nkhoản lặt vặt không ghi";
  const noted = basisOf(session, notes);
  const matches = resolveCanvasMatches(chiThu, noted.state, noted.canvasTokens, [
    { range: rangeOf(notes, "app trả phí bỏ không"), kind: "item", item_id: a("item", "paid-app"), reason: "r" },
    { range: rangeOf(notes, "khoản lặt vặt không ghi"), kind: "item", item_id: a("item", "small-spend"), reason: "r" },
  ]);
  const noteSlots = commentSlots(noted, selectionOf(noted), matches);
  return { noted, notes, matches, noteSlots, range: rangeOf(notes, "khoản lặt vặt không ghi") };
}

describe("resolveClaims: the note comment and sealing", () => {
  const { noted, noteSlots, range, notes } = notedSession();
  const heard = noteSlots.find((slot) => slot.type === "heard_not_followed")!;
  const resolveNoted = (raw: RawClaim[]) => resolveClaims(raw, { basis: noted, slots: noteSlots, selection: selectionOf(noted) });
  const noteClaim = (overrides: Partial<RawClaim>) => claim({ slot: heard.id, cited_turns: [3], canvas_range: [...range], item_id: a("item", "small-spend"), ...overrides });

  it("accepts the note comment only for the note and the item code matched", () => {
    expect(noteSlots.map((slot) => [slot.id, slot.type, slot.turns])).toEqual([
      ["S1", "leading", [2]],
      ["S2", "heard_not_followed", [3]],
      ["S3", "habit", [2, 3]],
    ]);
    expect(resolveNoted([noteClaim({})])).toMatchObject([{ slot: "heard_not_followed", itemId: "small-spend", canvasRange: range, citedTurns: [3], sealed: false }]);
    // The item is filled in from the slot when the model left it out.
    expect(resolveNoted([noteClaim({ item_id: null })])).toMatchObject([{ itemId: "small-spend" }]);
    expect(resolveNoted([noteClaim({ canvas_range: [...rangeOf(notes, "app trả phí bỏ không")] })])).toEqual([]);
    expect(resolveNoted([noteClaim({ canvas_range: null })])).toEqual([]);
    expect(resolveNoted([noteClaim({ item_id: a("item", "paid-app") })])).toEqual([]);
    expect(resolveNoted([noteClaim({ cited_turns: [] })])).toEqual([]);
  });

  it("seals a claim that names the replay target or cites the turn of its hook, whatever its text says", () => {
    // paid-app's hook was dropped at turn 1; the habit card cites the ignoring turns 2 and 3.
    const sealedByItem = resolveNoted([claim({ slot: "S1", cited_turns: [2], item_id: a("item", "paid-app") })]);
    expect(sealedByItem).toMatchObject([{ slot: "leading", sealed: true }]);
    expect(resolveNoted([claim({ slot: "S1", cited_turns: [2] })])).toMatchObject([{ sealed: false }]);

    const session = engineSession();
    // The question that got the hook dropped was itself leading: turn 1 is the hook turn and a leading turn.
    session.turn({ topic_tags: [a("tag", "paid-app")], label: "leading", introduced_span: [0, 0] });
    session.turn({ prev_turn_verdict: DROPPED });
    const hookTurnCited = basisOf(session);
    expect(selectionOf(hookTurnCited)).toEqual({ level: "primary", forkAfterTurn: 1, targetItemId: "paid-app" });
    expect(resolve([claim({ slot: "S1", cited_turns: [1], text: "Một câu vô hại." })], hookTurnCited)).toMatchObject([{ slot: "leading", sealed: true }]);
  });

  it("seals the habit card whenever its slot counts the target's ignored hook, whichever turns the claim cites", () => {
    // Main fixture: paid-app (the target) was ignored at turn 3, shame at turn 4; the habit slot is [3, 4].
    const habit = (turns: number[]) => resolve([claim({ slot: "S4", cited_turns: turns, text: "Một câu vô hại." })])[0];
    expect(habit([3, 4])).toMatchObject({ slot: "habit", sealed: true });
    // Citing only the other hook's turn does not get the card past the seal.
    expect(habit([4])).toMatchObject({ slot: "habit", citedTurns: [4], sealed: true });
  });

  it("does not seal the habit card when no item is held: fallback 1 and no replay", () => {
    const session = engineSession();
    // Two ignored hooks of items that cannot be replayed (trust and surface), and a leading question.
    session.turn({ topic_tags: [a("tag", "installment")] });
    session.turn({ prev_turn_verdict: DROPPED, label: "leading", introduced_span: [0, 1], topic_tags: [a("tag", "money-home")] });
    session.turn({ prev_turn_verdict: DROPPED });
    const fallback = basisOf(session);
    expect(selectionOf(fallback).level).toBe("fallback1");
    const slots = commentSlots(fallback, selectionOf(fallback), []);
    const habitSlot = slots.find((slot) => slot.type === "habit")!;
    // Turn 3 is not the replayed turn (2), so nothing about this claim is held.
    expect(resolveClaims([claim({ slot: habitSlot.id, cited_turns: [3] })], { basis: fallback, slots, selection: selectionOf(fallback) })).toMatchObject([{ slot: "habit", sealed: false }]);
  });

  it("fallback 1: seals every claim that cites the leading turn being replayed", () => {
    const session = engineSession();
    session.turn({ label: "leading", introduced_span: [0, 0] });
    session.turn({});
    session.turn({ label: "leading", introduced_span: [0, 0] });
    const fallback = basisOf(session);
    expect(selectionOf(fallback)).toEqual({ level: "fallback1", forkAfterTurn: 0, leadingTurn: 1 });
    expect(resolve([claim({ slot: "S1", cited_turns: [1, 3] })], fallback)).toMatchObject([{ sealed: true }]);
    // The better question rewrites the slot's first turn, which is the replayed one. A claim that
    // leaves that turn out of its citations would carry the rewrite past the seal: it is dropped.
    expect(resolve([claim({ slot: "S1", cited_turns: [3] })], fallback)).toEqual([]);
  });

  it("drops a fault claim that does not cite the first turn of its slot, the one its better question rewrites", () => {
    // S2 is the two questions about the future, turns 5 and 6.
    expect(resolve([claim({ slot: "S2", cited_turns: [6] })])).toEqual([]);
    expect(resolve([claim({ slot: "S2", cited_turns: [6, 5] })])).toMatchObject([{ citedTurns: [5, 6] }]);
    // Praise and the habit card carry no better question and may cite any of their turns.
    expect(resolve([claim({ slot: "S4", cited_turns: [4] })])).toMatchObject([{ slot: "habit", citedTurns: [4] }]);
  });

  it("keeps the note comment to the one turn that ignored the noted hook", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "small-spend")] });
    session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "work-fatigue")] });
    session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "paid-app")] });
    session.turn({ prev_turn_verdict: DROPPED });
    const text = "số không khớp vì khoản lặt vặt\nnhìn số cả ngày nên ngán";
    const three = basisOf(session, text);
    const matches = resolveCanvasMatches(chiThu, three.state, three.canvasTokens, [
      { range: rangeOf(text, "nhìn số cả ngày nên ngán"), kind: "item", item_id: a("item", "work-fatigue"), reason: "r" },
      { range: rangeOf(text, "số không khớp vì khoản lặt vặt"), kind: "item", item_id: a("item", "small-spend"), reason: "r" },
    ]);
    const threeSlots = commentSlots(three, selectionOf(three), matches);
    const slot = threeSlots.find((entry) => entry.type === "heard_not_followed")!;
    // Both noted items weigh the same: the note that comes first is the one cited; its hook was ignored at turn 2.
    expect(slot).toMatchObject({ turns: [2, 3], canvas: { itemId: "small-spend" } });
    const kept = resolveClaims([claim({ slot: slot.id, cited_turns: [3, 2], canvas_range: [...slot.canvas!.range] })], { basis: three, slots: threeSlots, selection: selectionOf(three) });
    expect(kept).toMatchObject([{ citedTurns: [2], itemId: "small-spend" }]);
  });
});

describe("buildChecks and resolveVerdicts", () => {
  const parts: RevealParts = { judge: judgedNotes(), generator: generatedClaims(basis, judgedNotes()) };
  const claims = parts.generator!.ok ? parts.generator!.claims : [];
  const checks = buildChecks(settle(basis, parts.judge), claims);

  it("asks the verifier about every unlock, disclosure, leading turn, ignored hook, claim and suggested question", () => {
    expect(checks.map((check) => [check.kind, check.turn, check.itemId ?? check.claimId])).toEqual([
      ["unlock", 1, "money-home"],
      ["unlock", 3, "last-attempt"],
      ["disclosure", 1, "money-home"],
      ["disclosure", 3, "last-attempt"],
      ["leading_novelty", 4, null],
      ["hook_ignored", 2, "paid-app"],
      ["hook_ignored", 3, "shame"],
      ["praise", 3, "C1"],
      ["comment", 5, "C2"],
      ["comment", 4, "C3"],
      ["habit", 3, "C4"],
      ["suggested_question", 5, "C2"],
      ["suggested_question", 4, "C3"],
    ]);
    expect(checks.map((check) => check.id)).toEqual(checks.map((_, index) => `V${index + 1}`));
    expect(checks.find((check) => check.kind === "leading_novelty")!.text).toBe("tại chị lười");
  });

  it("does not ask about a hook that was dropped in a flagged persona turn", () => {
    const flagged = { ...basis, turns: basis.turns.map((turn) => (turn.index === 3 ? { ...turn, flagged: true } : turn)) };
    const asked = buildChecks(settle(flagged, parts.judge), []).filter((check) => check.kind === "hook_ignored");
    // shame's hook was dropped at turn 3; paid-app's, at turn 2, is still asked about.
    expect(asked.map((check) => [check.turn, check.itemId])).toEqual([[2, "paid-app"]]);
  });

  it("builds the same list from the same frozen data", () => {
    expect(buildChecks(settle(basis, parts.judge), claims)).toEqual(checks);
  });

  it("keeps the verifier's first answer per check and drops answers about anything else", () => {
    const verdicts = resolveVerdicts(
      [
        { claim_id: "V1", verdict: "agree", reason: "đúng", label: null },
        { claim_id: "V1", verdict: "disagree", reason: "lần hai", label: null },
        { claim_id: " V2 ", verdict: "disagree", reason: "sai", label: "leading" },
        { claim_id: "V99", verdict: "agree", reason: "không có", label: null },
        { claim_id: "V3", verdict: "maybe", reason: "", label: "made_up" },
      ],
      checks,
    );
    expect(verdicts).toEqual([
      { id: "V1", agree: true, label: null, reason: "đúng" },
      { id: "V2", agree: false, label: "leading", reason: "sai" },
      // Anything that is not a plain "agree" is not an agreement.
      { id: "V3", agree: false, label: null, reason: "" },
    ]);
  });
});

describe("assembleReveal: what the verifier decides (addendum §2.5)", () => {
  const judge = judgedNotes();
  const parts: RevealParts = { judge, generator: generatedClaims(basis, judge) };
  const shown = (verifierParts: RevealParts) => assemble(basis, verifierParts).claims.filter((entry) => entry.shown).map((entry) => entry.slot);

  it("shows every claim the verifier agreed with, with the learner's question quoted word for word", () => {
    const reveal = assemble(basis, fullParts(basis));
    expect(reveal.claims.map((entry) => [entry.slot, entry.shown, entry.quote])).toEqual([
      ["praise", true, "Lần gần nhất chị ghi chi tiêu là khi nào ạ?"],
      ["hypothetical_future", true, "Sau này chị có định ghi lại không ạ?"],
      ["leading", true, "Chắc tại chị lười nên mới bỏ đúng không ạ?"],
      ["habit", true, "Lần gần nhất chị ghi chi tiêu là khi nào ạ?"],
    ]);
    expect(reveal.leading).toEqual([{ turn: 4, span: [1, 3], spanText: "tại chị lười", novel: true }]);
    expect(reveal.failed).toEqual({ judge: false, generator: false, verifier: false });
  });

  it("hides a claim the verifier disagreed with, and only that one", () => {
    expect(shown({ ...parts, verifier: verifierFor(basis, parts, (check) => check.kind === "praise") })).toEqual(["hypothetical_future", "leading", "habit"]);
  });

  it("hides a comment whose suggested question the verifier labelled leading or disagreed with", () => {
    const leadingSuggestion = verifierFor(
      basis,
      parts,
      () => false,
      (check) => (check.kind === "suggested_question" && check.claimId === "C2" ? "leading" : check.kind === "suggested_question" ? "open" : null),
    );
    expect(shown({ ...parts, verifier: leadingSuggestion })).toEqual(["praise", "leading", "habit"]);
    const rejected = verifierFor(basis, parts, (check) => check.kind === "suggested_question" && check.claimId === "C3");
    expect(shown({ ...parts, verifier: rejected })).toEqual(["praise", "hypothetical_future", "habit"]);
  });

  it("hides the leading comment and the leading mark when the verifier found the added words were not new", () => {
    const reveal = assemble(basis, { ...parts, verifier: verifierFor(basis, parts, (check) => check.kind === "leading_novelty") });
    expect(reveal.claims.find((entry) => entry.slot === "leading")).toMatchObject({ shown: false, citedTurns: [] });
    expect(reveal.leading).toMatchObject([{ turn: 4, novel: false }]);
  });

  it("hides a leading comment whose first turn was not new, even when a later turn was: its pair is about the first", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "paid-app")] });
    session.turn({ prev_turn_verdict: DROPPED, label: "leading", introduced_span: [0, 1] });
    session.turn({ label: "leading", introduced_span: [2, 3] });
    const two = basisOf(session);
    const twoParts: RevealParts = { judge: { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches: [] }, generator: generatedClaims(two) };
    const leadingOf = (verifier: RevealParts["verifier"]) => assemble(two, { ...twoParts, verifier }).claims.find((entry) => entry.slot === "leading")!;

    expect(leadingOf(verifierFor(two, twoParts))).toMatchObject({ citedTurns: [2, 3], shown: true, quote: "Chị kể thêm cho em nghe được không ạ?" });
    // Turn 3 alone was not new: the comment stays, about turn 2, and no longer points at turn 3.
    expect(leadingOf(verifierFor(two, twoParts, (check) => check.kind === "leading_novelty" && check.turn === 3))).toMatchObject({ citedTurns: [2], shown: true });
    // Turn 2 was not new: the question written to replace it must not be paired with turn 3.
    expect(leadingOf(verifierFor(two, twoParts, (check) => check.kind === "leading_novelty" && check.turn === 2))).toMatchObject({ shown: false });
  });

  it("hides the habit card when the verifier agreed with fewer ignored hooks than the threshold", () => {
    const oneRejected = verifierFor(basis, parts, (check) => check.kind === "hook_ignored" && check.itemId === "shame");
    expect(shown({ ...parts, verifier: oneRejected })).toEqual(["praise", "hypothetical_future", "leading"]);
  });

  it("keeps on the habit card only the turns the verifier agreed ignored a hook", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "paid-app")] });
    session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "small-spend")] });
    session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "work-fatigue")] });
    session.turn({ prev_turn_verdict: DROPPED });
    const three = basisOf(session);
    const threeParts: RevealParts = { judge: { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches: [] }, generator: generatedClaims(three) };
    const habitOf = (verifier: RevealParts["verifier"]) => assemble(three, { ...threeParts, verifier }).claims.find((entry) => entry.slot === "habit")!;

    expect(habitOf(verifierFor(three, threeParts))).toMatchObject({ citedTurns: [2, 3, 4], shown: true });
    // small-spend's hook (ignored at turn 3) was in fact followed up: two agreed hooks still meet the threshold of 2.
    const oneRejected = verifierFor(three, threeParts, (check) => check.kind === "hook_ignored" && check.itemId === "small-spend");
    expect(habitOf(oneRejected)).toMatchObject({ citedTurns: [2, 4], shown: true });
    const twoRejected = verifierFor(three, threeParts, (check) => check.kind === "hook_ignored" && check.itemId !== "paid-app");
    expect(habitOf(twoRejected)).toMatchObject({ citedTurns: [2], shown: false });
  });

  it("hides the note comment when the verifier disagreed that its hook was ignored", () => {
    const { noted, matches } = notedSession();
    const noteJudge = { ok: true as const, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches };
    const noteParts: RevealParts = { judge: noteJudge, generator: generatedClaims(noted, noteJudge) };
    const all = assemble(noted, { ...noteParts, verifier: verifierFor(noted, noteParts) });
    expect(all.claims.find((entry) => entry.slot === "heard_not_followed")).toMatchObject({ shown: true, canvasQuote: "khoản lặt vặt không ghi", quote: "Chị kể thêm cho em nghe được không ạ?" });

    const rejected = verifierFor(noted, noteParts, (check) => check.kind === "hook_ignored" && check.itemId === "small-spend");
    expect(assemble(noted, { ...noteParts, verifier: rejected }).claims.find((entry) => entry.slot === "heard_not_followed")!.shown).toBe(false);
  });

  it("keeps the credit of an unlock or a disclosure the verifier disagreed with, and only counts it (NFR-8)", () => {
    const reveal = assemble(basis, { ...parts, verifier: verifierFor(basis, parts, (check) => check.kind === "unlock" || (check.kind === "disclosure" && check.itemId === "money-home")) });
    expect(reveal.counts.told).toBe(2);
    expect(reveal.items.filter((entry) => entry.state === "told").map((entry) => entry.id)).toEqual(["last-attempt", "money-home"]);
    expect(reveal.verifierChecks).toMatchObject({ unlock: { agree: 0, disagree: 2 }, disclosure: { agree: 1, disagree: 1 }, hook_ignored: { agree: 2, disagree: 0 } });
  });

  it("shows nothing a verifier did not confirm: a failed or silent verifier hides every claim and every leading mark", () => {
    for (const verifier of [{ ok: false as const }, { ok: true as const, verdicts: [] }, undefined]) {
      const reveal = assemble(basis, { ...parts, verifier });
      expect(reveal.claims.some((entry) => entry.shown)).toBe(false);
      expect(reveal.leading.some((entry) => entry.novel)).toBe(false);
    }
    expect(assemble(basis, { ...parts, verifier: { ok: false } }).failed.verifier).toBe(true);
    expect(assemble(basis, { ...parts, verifier: { ok: false } }).verifierChecks).toBeNull();
  });

  it("degrades without the generator: no claims, the numbers and the diagnosis unchanged", () => {
    const failed: RevealParts = { judge, generator: { ok: false } };
    const reveal = assemble(basis, { ...failed, verifier: verifierFor(basis, failed) });
    expect(reveal.claims).toEqual([]);
    expect(reveal.failed.generator).toBe(true);
    expect(reveal.counts).toEqual({ told: 2, total: 11, revealedCount: 4, recognizedFull: 2 });
    expect(reveal.diagnosisKey).toBe("heard_not_followed");
  });

  it("degrades without the end judge: the notes are not judged, NHẬN BIẾT is unknown, KHAI THÁC stands", () => {
    const failed: RevealParts = { judge: { ok: false }, generator: generatedClaims(basis, { ok: false }) };
    const reveal = assemble(basis, { ...failed, verifier: verifierFor(basis, failed) });
    expect(reveal.failed.judge).toBe(true);
    expect(reveal.canvasMatches).toEqual([]);
    expect(reveal.counts).toEqual({ told: 2, total: 11, revealedCount: 4, recognizedFull: null });
  });

  it("counts the numbers of PRD §8.1 from the settled state", () => {
    const reveal = assemble(basis, fullParts(basis));
    // Told: money-home, last-attempt. Shown: those two plus the dropped hooks of paid-app and shame.
    expect(reveal.counts).toEqual({ told: 2, total: 11, revealedCount: 4, recognizedFull: 2 });
    expect(reveal.canvasEmpty).toBe(false);
    expect(assemble(basisOf(playedSession(), "  \n "), fullParts(basisOf(playedSession(), "  \n "), { ...judgedNotes(), matches: [] })).canvasEmpty).toBe(true);
  });

  it("assembles the same result from the same parts, also when the last turn's verdict is already in the state", () => {
    const lastVerdict = { ...judge, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: ["avoid-shame"] } };
    const withVerdict: RevealParts = { ...parts, judge: lastVerdict };
    const full = { ...withVerdict, verifier: verifierFor(basis, withVerdict) };
    const first = assemble(basis, full);
    // A run that resumes after the judge reads the session with that verdict already written.
    const resumed = assemble(settle(basis, lastVerdict), full);
    expect(resumed).toEqual(first);
    expect(assemble(basis, full)).toEqual(first);
  });
});
