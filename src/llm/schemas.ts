import { z } from "zod";
import { LABELS, QUESTION_TYPES } from "@/engine/types";

/**
 * Shapes the models must return. Ids in them are the aliases the prompt showed; they are
 * untrusted and resolved by `src/engine/aliases.ts`. Kept to plain objects, arrays and nullable
 * scalars so both providers accept them as a response schema.
 */
export const verdictSchema = z.object({
  hook_dropped: z.boolean(),
  disclosed_item_ids: z.array(z.string()),
  violations: z.array(z.string()),
});

/** Call 1 (addendum §2.1). */
export const analysisSchema = z.object({
  prev_turn_verdict: verdictSchema,
  question_type: z.enum(QUESTION_TYPES),
  label: z.enum(LABELS),
  grounded_turn_id: z.number().int().nullable(),
  introduced_span: z.array(z.number().int()).nullable(),
  hook_id: z.string().nullable(),
  topic_tags: z.array(z.string()),
});

/** The turn judge (addendum §2.6): a verdict for the persona turn that has no later Call 1. */
export const turnJudgeSchema = z.object({ prev_turn_verdict: verdictSchema });
