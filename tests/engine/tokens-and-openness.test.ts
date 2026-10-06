import { describe, expect, it } from "vitest";
import { nextOpenness, opennessDelta, opennessLevel } from "@/engine/openness";
import { isValidRange, sliceTokens, tokenize } from "@/engine/tokens";
import { LABELS, QUESTION_TYPES } from "@/engine/types";
import { engineSession } from "../helpers/engine-fixtures";

describe("tokenize", () => {
  it("splits on any whitespace and numbers tokens from 0", () => {
    expect(tokenize("  Chị có\tmuốn\n một app   không? ")).toEqual(["Chị", "có", "muốn", "một", "app", "không?"]);
  });

  it("returns no tokens for an empty or blank line", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(" \n\t")).toEqual([]);
  });
});

describe("token ranges", () => {
  const tokens = tokenize("Chị có muốn một app nhắc chị tiết kiệm không?");

  it("cuts a range by index, both ends included, word for word", () => {
    expect(sliceTokens(tokens, [4, 8])).toBe("app nhắc chị tiết kiệm");
    expect(sliceTokens(tokens, [0, 0])).toBe("Chị");
    expect(sliceTokens(tokens, [9, 9])).toBe("không?");
  });

  it.each([
    ["null", null],
    ["an empty array", []],
    ["one number", [3]],
    ["three numbers", [1, 2, 3]],
    ["end before start", [5, 4]],
    ["a negative start", [-1, 2]],
    ["an end past the last token", [8, 10]],
    ["a start past the last token", [10, 10]],
    ["fractions", [1.5, 2]],
    ["strings", ["1", "2"]],
    ["NaN", [Number.NaN, 2]],
  ])("rejects %s", (_name, range) => {
    expect(isValidRange(range, tokens.length)).toBe(false);
    expect(sliceTokens(tokens, range)).toBeNull();
  });

  it("rejects every range on a line with no tokens", () => {
    expect(isValidRange([0, 0], 0)).toBe(false);
  });
});

describe("openness", () => {
  it("changes by the table of addendum §3.1", () => {
    const table = Object.fromEntries(
      LABELS.map((label) => [label, Object.fromEntries(QUESTION_TYPES.map((type) => [type, opennessDelta(label, type)]))]),
    );
    expect(table).toEqual({
      confirm_grounded: { open: 1, closed: 1, hypothetical_future: 1, past_specific: 2, other: 1 },
      boundary_probe: { open: 1, closed: 1, hypothetical_future: 1, past_specific: 2, other: 1 },
      open: { open: 0, closed: 0, hypothetical_future: 0, past_specific: 1, other: 0 },
      // The past-story bonus is only for a question that does not lead.
      leading: { open: -2, closed: -2, hypothetical_future: -2, past_specific: -2, other: -2 },
    });
  });

  it("stays inside 0 to 10", () => {
    expect(nextOpenness(1, "leading", "other")).toBe(0);
    expect(nextOpenness(0, "leading", "other")).toBe(0);
    expect(nextOpenness(9, "confirm_grounded", "past_specific")).toBe(10);
    expect(nextOpenness(10, "boundary_probe", "open")).toBe(10);
  });

  it("gives the persona one of three levels, never the number", () => {
    expect([0, 3, 4, 6, 7, 10].map(opennessLevel)).toEqual(["guarded", "guarded", "neutral", "neutral", "warm", "warm"]);
  });

  it("starts at 4 and moves turn by turn with the checked label", () => {
    const session = engineSession();
    expect(session.state.openness).toBe(4);

    // A leading question with a valid span: 4 - 2.
    const leading = session.turn({ label: "leading", introduced_span: [4, 5] }, "Chị có muốn một app nhắc không?");
    expect([leading.opennessBefore, leading.opennessAfter]).toEqual([4, 2]);
    // An open question about a specific past event: + 1.
    expect(session.turn({ label: "open", question_type: "past_specific" }).opennessAfter).toBe(3);
    // A grounded follow-up on turn 2: + 1.
    expect(session.turn({ label: "confirm_grounded", grounded_turn_id: 2 }).opennessAfter).toBe(4);
    // A grounded question about a specific past event: + 2.
    expect(session.turn({ label: "boundary_probe", grounded_turn_id: 3, question_type: "past_specific" }).opennessAfter).toBe(6);
    // A plain open question: no change.
    expect(session.turn({ label: "open", question_type: "open" }).opennessAfter).toBe(6);
  });
});
