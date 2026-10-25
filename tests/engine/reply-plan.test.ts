import { describe, expect, it } from "vitest";
import { REPLY_SHAPES, replyShape, type ReplyInput } from "@/engine/reply-plan";

const base: ReplyInput = { tell: "none", label: "open", questionType: "open", opennessLevel: "neutral" };

describe("replyShape", () => {
  it("gives a story only when an item is told, brief while guarded", () => {
    expect(replyShape({ ...base, tell: "new" })).toBe("story");
    expect(replyShape({ ...base, tell: "new", opennessLevel: "warm" })).toBe("story");
    expect(replyShape({ ...base, tell: "new", opennessLevel: "guarded" })).toBe("story_brief");
  });

  it("tells last turn's untold item briefly, whatever the openness", () => {
    expect(replyShape({ ...base, tell: "retry", opennessLevel: "warm" })).toBe("story_brief");
    expect(replyShape({ ...base, tell: "retry", questionType: "closed" })).toBe("story_brief");
  });

  it("tells an item even when the question is closed or leading", () => {
    expect(replyShape({ ...base, tell: "new", questionType: "closed" })).toBe("story");
    expect(replyShape({ ...base, tell: "new", label: "leading", opennessLevel: "guarded" })).toBe("story_brief");
  });

  it("nods at a leading question, before its question type is read", () => {
    expect(replyShape({ ...base, label: "leading", questionType: "closed" })).toBe("nod");
    expect(replyShape({ ...base, label: "leading", questionType: "hypothetical_future" })).toBe("nod");
  });

  it("answers a closed question in one line and a future one vaguely", () => {
    expect(replyShape({ ...base, questionType: "closed" })).toBe("one_line");
    expect(replyShape({ ...base, questionType: "hypothetical_future" })).toBe("vague");
  });

  it("defaults to a short answer", () => {
    expect(replyShape(base)).toBe("short");
    expect(replyShape({ ...base, label: "confirm_grounded", questionType: "past_specific", opennessLevel: "warm" })).toBe("short");
  });

  it("reaches every shape", () => {
    const inputs: ReplyInput[] = [
      { ...base, tell: "new", opennessLevel: "guarded" },
      { ...base, tell: "new" },
      { ...base, label: "leading" },
      { ...base, questionType: "closed" },
      { ...base, questionType: "hypothetical_future" },
      base,
    ];
    expect(new Set(inputs.map(replyShape))).toEqual(new Set(REPLY_SHAPES));
  });
});
