import { describe, expect, it } from "vitest";
import type { LeadingTurn, RevealItem } from "@/engine/reveal-types";
import type { Label } from "@/engine/types";
import { scoreGuideSet } from "@/eval/guide-check-set";
import { judgementExitCode } from "@/eval/judgement-eval";
import { compareProgress, factsOf, type ProgressSource } from "@/server/progress";

/** An item, its hook dropped in turn 1 with a question after it unless `lastReply`. */
const item = (state: RevealItem["state"], hooked: boolean, lastReply = false) =>
  ({ state, hook: hooked ? { turn: 1, personaText: "…", next: lastReply ? null : { turn: 2, learnerText: "…" } } : null }) as RevealItem;
/** Questions in turn order from turn 1, as the repo returns them. */
const turnsOf = (...questions: [string, Label | null][]) =>
  questions.map(([text, label], index) => ({ turn: index + 1, text, analysis: label === null ? null : { label, question_type: "open" as const } }));
const novel = (turn: number, isNovel = true): LeadingTurn => ({ turn, span: [0, 1], spanText: "x", novel: isNovel });

function source(overrides: Partial<ProgressSource> & { day: number; told?: number; total?: number }): ProgressSource {
  const { day, told = 3, total = 11, ...rest } = overrides;
  return {
    sessionId: `s${day}`,
    personaId: "chi-thu",
    personaName: "chị Thu",
    revealedAt: new Date(2026, 9, day),
    reveal: { counts: { told, total, revealedCount: told, recognizedFull: null }, items: [], leading: [] },
    questions: [],
    ...rest,
  };
}

describe("factsOf", () => {
  it("counts what was told, leading questions and hooks never followed up (not one dropped in the last reply), and picks the learner's own questions", () => {
    const facts = factsOf(
      source({
        day: 1,
        told: 4,
        reveal: { counts: { told: 4, total: 11, revealedCount: 5, recognizedFull: null }, items: [item("told", true), item("missed", true), item("held", true), item("missed", true, true), item("missed", false)], leading: [] },
        questions: turnsOf(["Chị kể em nghe?", "open"], ["Chắc tại lười hả chị?", "leading"], ["Lần đó chị ghi bằng gì?", "confirm_grounded"], ["Cũ?", null]),
      }),
    );
    expect(facts).toMatchObject({ told: 4, total: 11, leading: 1, ignoredHints: 2, leadingExample: "Chắc tại lười hả chị?", groundedExample: "Lần đó chị ghi bằng gì?" });
  });

  it("prefers a leading question the verifier agreed added new words", () => {
    const questions = turnsOf(["Dẫn dắt một?", "leading"], ["Mở?", "open"], ["Dẫn dắt hai?", "leading"]);
    const facts = factsOf(source({ day: 1, questions, reveal: { counts: { told: 3, total: 11, revealedCount: 3, recognizedFull: null }, items: [], leading: [novel(1, false), novel(3)] } }));
    expect(facts.leadingExample).toBe("Dẫn dắt hai?");
  });

  it("gives no example from a session whose questions were stored before the analysis was", () => {
    const facts = factsOf(source({ day: 1, questions: turnsOf(["Một?", null], ["Hai?", null]) }));
    expect(facts).toMatchObject({ leading: 0, leadingExample: null, groundedExample: null });
  });
});

describe("compareProgress", () => {
  it("has nothing to show without a session, and a first-session view with one", () => {
    expect(compareProgress(null, null, null)).toBeNull();
    const only = source({ day: 1 });
    expect(compareProgress(only, null, only)).toMatchObject({ kind: "single", latest: { sessionId: "s1" } });
  });

  it("compares the newest with the previous session of the same persona, not the first one", () => {
    const newest = source({ day: 5, told: 6, questions: turnsOf(["Lần đó chị ghi bằng gì?", "boundary_probe"]) });
    const previous = source({ day: 3, told: 2, questions: turnsOf(["Chắc tại lười hả chị?", "leading"], ["Rồi sao?", "leading"]) });
    const comparison = compareProgress(newest, previous, source({ day: 1 }));
    expect(comparison).toMatchObject({ kind: "pair", samePersona: true, before: { sessionId: "s3" }, after: { sessionId: "s5" } });
    if (comparison?.kind !== "pair") throw new Error("pair expected");
    expect(comparison.lines).toEqual([
      { key: "told", before: 2, after: 6, trend: "better" },
      { key: "leading", before: 2, after: 0, trend: "better" },
      { key: "ignored", before: 0, after: 0, trend: "same" },
    ]);
    expect(comparison.pair).toEqual({ before: "Chắc tại lười hả chị?", after: "Lần đó chị ghi bằng gì?" });
  });

  it("falls back to the first session when the newest persona was never played before, comparing what was told as a share", () => {
    const newest = source({ day: 5, personaId: "anh-tung", personaName: "anh Tùng", told: 3, total: 6 });
    const first = source({ day: 1, told: 4, total: 11 });
    const comparison = compareProgress(newest, null, first);
    expect(comparison).toMatchObject({ kind: "pair", samePersona: false, before: { sessionId: "s1" } });
    if (comparison?.kind !== "pair") throw new Error("pair expected");
    // 4 of 11 before, 3 of 6 after: fewer items, a bigger share.
    expect(comparison.lines[0]).toEqual({ key: "told", before: 4, after: 3, trend: "better" });
  });

  it("calls more leading questions and more ignored hints worse, and shows no pair without both questions", () => {
    const before = source({ day: 1, reveal: { counts: { told: 3, total: 11, revealedCount: 3, recognizedFull: null }, items: [], leading: [] } });
    const after = source({ day: 2, questions: turnsOf(["Chắc vậy hả?", "leading"]), reveal: { counts: { told: 3, total: 11, revealedCount: 3, recognizedFull: null }, items: [item("missed", true)], leading: [] } });
    const comparison = compareProgress(after, before, before);
    if (comparison?.kind !== "pair") throw new Error("pair expected");
    expect(comparison.lines.map((line) => line.trend)).toEqual(["same", "worse", "worse"]);
    expect(comparison.pair).toBeNull();
  });

  it("compares what was told as a share, so a newer version of the same persona with fewer items is judged fairly", () => {
    const comparison = compareProgress(source({ day: 2, told: 4, total: 8 }), source({ day: 1, told: 4, total: 11 }), null);
    if (comparison?.kind !== "pair") throw new Error("pair expected");
    expect(comparison).toMatchObject({ samePersona: true, before: { total: 11 }, after: { total: 8 } });
    expect(comparison.lines[0]).toEqual({ key: "told", before: 4, after: 4, trend: "better" });
  });
});

describe("scoreGuideSet", () => {
  it("counts leading recall question by question, and a guide split differently as missing its leading questions", () => {
    const score = scoreGuideSet([
      { id: "g1", expected: ["open", "leading", "closed"], predicted: ["open", "leading", "open"] },
      { id: "g2", expected: ["leading", "open"], predicted: ["leading", "open", "open"] },
      { id: "g3", expected: ["leading"], predicted: ["leading"] },
    ]);
    expect(score.rates).toEqual([expect.objectContaining({ key: "leading_recall", count: "2/3", met: false })]);
    expect(score.mismatches).toEqual(["g1 câu 3: cần closed, nhận open", "g2: trả về 3 câu, bộ có 2 câu"]);
    expect(score.notes).toEqual(["Nhãn khớp: 75% (3/4 câu so được)", "Độ chính xác của nhãn leading: 100% (2/2)"]);
    expect(judgementExitCode(score)).toBe(1);
  });

  it("passes at 90% recall, and calls a set of fewer than thirty guides a starter set", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ id: `g${index}`, expected: ["leading" as const], predicted: [index === 0 ? ("open" as const) : ("leading" as const)] }));
    const score = scoreGuideSet(rows);
    expect(score.rates[0]).toMatchObject({ value: 0.9, met: true });
    expect(judgementExitCode(score)).toBe(2);
  });
});
