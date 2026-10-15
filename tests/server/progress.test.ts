import { describe, expect, it } from "vitest";
import type { RevealItem } from "@/engine/reveal-types";
import { scoreGuideSet } from "@/eval/guide-check-set";
import { judgementExitCode } from "@/eval/judgement-eval";
import { progressOf, sessionProgress, type ProgressSource } from "@/server/progress";

const item = (state: RevealItem["state"], hooked: boolean) => ({ state, hook: hooked ? { turn: 1, personaText: "…", next: null } : null }) as RevealItem;

function source(overrides: Partial<ProgressSource> & { day: number }): ProgressSource {
  return {
    sessionId: `s${overrides.day}`,
    personaName: "chị Thu",
    revealedAt: new Date(2026, 9, overrides.day),
    guess: 5,
    reveal: { counts: { told: 5, total: 10, revealedCount: 6, recognizedFull: 2 }, canvasEmpty: false, items: [] },
    questions: [],
    ...overrides,
  };
}

describe("sessionProgress", () => {
  it("measures each habit and score from stored data", () => {
    const progress = sessionProgress(
      source({
        day: 1,
        guess: 8,
        reveal: { counts: { told: 4, total: 10, revealedCount: 5, recognizedFull: 3 }, canvasEmpty: false, items: [item("told", true), item("missed", true), item("held", true), item("missed", false)] },
        questions: [
          { label: "confirm_grounded", question_type: "open" },
          { label: "boundary_probe", question_type: "closed" },
          { label: "leading", question_type: "hypothetical_future" },
          { label: "open", question_type: "open" },
          null,
        ],
      }),
    );
    expect(progress).toMatchObject({ questions: 5, grounded: 0.5, told: 0.4, recognized: 0.3, guessAccuracy: 0.6 });
    expect(progress.habits).toEqual({ leading: 0.25, hypothetical_future: 0.25, heard_not_followed: 2 / 3 });
  });

  it("leaves unmeasured what a session gives nothing for: no judged question, no dropped hook, notes not judged or empty", () => {
    const progress = sessionProgress(source({ day: 1, reveal: { counts: { told: 0, total: 10, revealedCount: 0, recognizedFull: null }, canvasEmpty: false, items: [] }, questions: [null] }));
    expect(progress).toMatchObject({ grounded: null, recognized: null, habits: { leading: null, hypothetical_future: null, heard_not_followed: null } });
    const empty = sessionProgress(source({ day: 1, reveal: { counts: { told: 0, total: 10, revealedCount: 0, recognizedFull: 0 }, canvasEmpty: true, items: [] } }));
    expect(empty.recognized).toBeNull();
  });

  it("scores a guess as far off as the whole scenario as zero, never below", () => {
    expect(sessionProgress(source({ day: 1, guess: 10, reveal: { counts: { told: 0, total: 5, revealedCount: 0, recognizedFull: 0 }, canvasEmpty: false, items: [] } })).guessAccuracy).toBe(0);
  });
});

describe("progressOf", () => {
  it("keeps the ten newest sessions, oldest first, and names the habit with the highest average", () => {
    const leading = { label: "leading", question_type: "open" } as const;
    const open = { label: "open", question_type: "open" } as const;
    const newestFirst = Array.from({ length: 12 }, (_, index) => source({ day: 12 - index, questions: index % 2 === 0 ? [leading, open] : [open, open] }));

    const progress = progressOf(newestFirst);

    expect(progress.sessions.map((session) => session.sessionId)).toEqual(["s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"]);
    expect(progress.weakest).toEqual({ habit: "leading", name: "Câu hỏi dẫn dắt", rate: 0.25 });
  });

  it("names no habit when none showed, and has no session when there is none", () => {
    expect(progressOf([source({ day: 1, questions: [{ label: "open", question_type: "open" }] })]).weakest).toBeNull();
    expect(progressOf([])).toEqual({ sessions: [], weakest: null });
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
