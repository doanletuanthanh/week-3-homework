import type { OpennessLevel } from "./openness";
import type { Label, QuestionType } from "./types";

export const REPLY_SHAPES = ["story_brief", "story", "nod", "one_line", "vague", "short"] as const;
/** How long Call 2's reply is and what it holds; the prompt turns each into one direction. */
export type ReplyShape = (typeof REPLY_SHAPES)[number];

/** What code already knows about a turn when it picks the reply's shape: typed outputs, no text. */
export type ReplyInput = {
  /** Whether this reply tells an item: a new one, one more try at last turn's untold one, or none. */
  tell: "new" | "retry" | "none";
  label: Label;
  questionType: QuestionType;
  opennessLevel: OpennessLevel;
};

/**
 * The reply's shape, as a data table: the first row that matches wins. A story comes only when an
 * item is told. It stays brief while the persona is guarded, so the shape never asks for more than
 * the openness line allows, and on a retry, which is told in passing. A leading question gets a
 * nod, a closed one a single line.
 */
export const REPLY_RULES: { when: (input: ReplyInput) => boolean; shape: ReplyShape }[] = [
  { when: (input) => input.tell === "retry", shape: "story_brief" },
  { when: (input) => input.tell === "new" && input.opennessLevel === "guarded", shape: "story_brief" },
  { when: (input) => input.tell === "new", shape: "story" },
  { when: (input) => input.label === "leading", shape: "nod" },
  { when: (input) => input.questionType === "closed", shape: "one_line" },
  { when: (input) => input.questionType === "hypothetical_future", shape: "vague" },
];

export function replyShape(input: ReplyInput): ReplyShape {
  return REPLY_RULES.find((rule) => rule.when(input))?.shape ?? "short";
}
