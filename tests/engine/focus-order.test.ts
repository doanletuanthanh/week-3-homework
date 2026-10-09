import { describe, expect, it } from "vitest";
import type { Focus } from "@/db/schema";
import { commentSlots } from "@/engine/reveal-compute";
import { NOTES, basisOf, judgedNotes, playedSession, selectionOf } from "../helpers/reveal-fixtures";

/**
 * PRD §4: in a custom session the comment about what the learner asked to practise comes first,
 * right after the praise. The played session has two questions about the future (turns 5, 6) and
 * one leading question (turn 4); without a focus the fault more turns show comes first.
 */
const order = (focus?: Focus | null) => {
  const basis = { ...basisOf(playedSession(), NOTES), focus };
  return commentSlots(basis, selectionOf(basis), judgedNotes().matches).map((slot) => slot.type);
};

describe("commentSlots with a focus", () => {
  it("keeps the usual order with no focus, with `general`, and in an authored session", () => {
    const usual = ["praise", "hypothetical_future", "leading", "habit"];
    expect(order()).toEqual(usual);
    expect(order(null)).toEqual(usual);
    expect(order("general")).toEqual(usual);
  });

  it.each(["trust", "no_leading"] as const)("puts the leading comment first for the focus %s", (focus) => {
    expect(order(focus)).toEqual(["praise", "leading", "hypothetical_future", "habit"]);
  });

  it("keeps the future-question comment first for `past_story`, where it already is", () => {
    expect(order("past_story")).toEqual(["praise", "hypothetical_future", "leading", "habit"]);
  });

  it("changes nothing for `follow_up` when the session has no ignored hook to comment on", () => {
    // The only noted ignored hook of this session is the replay target, which the diagnosis line covers.
    expect(order("follow_up")).toEqual(["praise", "hypothetical_future", "leading", "habit"]);
  });

  it("never moves the praise from the first place or the habit card from the last, and adds no comment", () => {
    for (const focus of ["follow_up", "past_story", "trust", "no_leading", "general"] as const) {
      const types = order(focus);
      expect(types[0]).toBe("praise");
      expect(types.at(-1)).toBe("habit");
      expect([...types].sort()).toEqual(["habit", "hypothetical_future", "leading", "praise"]);
    }
  });

  it("numbers the slots by their new position, so a claim still names the slot it is for", () => {
    const basis = { ...basisOf(playedSession(), NOTES), focus: "no_leading" as const };
    const slots = commentSlots(basis, selectionOf(basis), judgedNotes().matches);
    expect(slots.map((slot) => [slot.id, slot.type, slot.turns])).toEqual([
      ["S1", "praise", [3]],
      ["S2", "leading", [4]],
      ["S3", "hypothetical_future", [5, 6]],
      ["S4", "habit", [3, 4]],
    ]);
  });
});
