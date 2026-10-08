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

/** The replay judge of a leading-question replay: the verdict, and its own label for the learner's question. */
export const replayJudgeSchema = z.object({
  prev_turn_verdict: verdictSchema,
  label: z.enum(LABELS),
  introduced_span: z.array(z.number().int()).nullable(),
});

/** Reveal call 1, the end judge (addendum §2.3). */
export const endJudgeSchema = z.object({
  last_turn_verdict: verdictSchema,
  canvas_matches: z.array(
    z.object({
      range: z.array(z.number().int()),
      kind: z.enum(["item", "never_said"]),
      item_id: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

/**
 * Reveal call 2, the feedback generator (addendum §2.4). A claim names the slot it answers; its
 * id and its kind are given by code from that slot, not taken from the model.
 */
export const feedbackSchema = z.object({
  claims: z.array(
    z.object({
      slot: z.string(),
      text: z.string(),
      cited_turns: z.array(z.number().int()),
      item_id: z.string().nullable(),
      canvas_range: z.array(z.number().int()).nullable(),
      suggested_question: z.string().nullable(),
    }),
  ),
});

/** Reveal call 3, the verifier (addendum §2.5). `label` is set for a suggested question only. */
export const verifierSchema = z.object({
  claims: z.array(
    z.object({
      claim_id: z.string(),
      verdict: z.enum(["agree", "disagree"]),
      reason: z.string(),
      label: z.enum(LABELS).nullable(),
    }),
  ),
});
