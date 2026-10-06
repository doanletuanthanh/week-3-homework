import type { TokenRange } from "./tokens";

export const QUESTION_TYPES = ["open", "closed", "hypothetical_future", "past_specific", "other"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const LABELS = ["confirm_grounded", "boundary_probe", "open", "leading"] as const;
export type Label = (typeof LABELS)[number];

/** A judgement about one persona turn, always made by a call other than the one that wrote it. */
export type Verdict = {
  /** Only meaningful when that turn had a hook selected. */
  hook_dropped: boolean;
  disclosed_item_ids: string[];
  violations: string[];
};

/**
 * Call 1 output as the model returned it. Ids are the aliases the prompt showed (I1, H1, T1, D1),
 * never scenario ids; anything in it is untrusted until `resolveAliases` and `checkAnalysis` ran.
 */
export type RawAnalysis = {
  prev_turn_verdict: Verdict;
  question_type: QuestionType;
  label: Label;
  grounded_turn_id: number | null;
  introduced_span: number[] | null;
  hook_id: string | null;
  topic_tags: string[];
};

/** Call 1 output after code checked every reference. Ids are scenario item ids. */
export type CheckedAnalysis = {
  question_type: QuestionType;
  label: Label;
  /** Set only with a good label: a persona turn before this one. */
  grounded_turn_id: number | null;
  /** Set only with `leading`: tokens of the learner's question. */
  introduced_span: TokenRange | null;
  /** Item whose hook the question picks up: dropped by verdict and still pickable. */
  hook_item_id: string | null;
  /** Item whose topic tag the question touches; at most one. */
  tag_item_id: string | null;
};

/** One change code made to the model's output, kept for `trace`. */
export type Correction = { field: string; from: unknown; to: unknown; reason: string };

export type UnlockedItem = { itemId: string; turn: number };

/** A hook exists in the ledger only once a verdict said the persona really dropped it. */
export type HookEntry = {
  itemId: string;
  droppedAt: number;
  /** First later turn whose `hook_id` was accepted. */
  pickedAt: number | null;
  /** Set when the turn right after the drop did not pick it up; the hook stays pickable. */
  ignoredAt: number | null;
  /** Set when its item opened. */
  closedAt: number | null;
};

/** Everything the controller remembers between turns; one snapshot per turn. */
export type EngineState = {
  turnIndex: number;
  unlocked: UnlockedItem[];
  ledger: HookEntry[];
  /** Unlocked items a verdict confirmed the persona told. */
  disclosed: UnlockedItem[];
  openness: number;
  /** Item whose hook the persona was asked to drop at `turnIndex`; its verdict arrives next turn. */
  selectedHook: string | null;
};

export const UNLOCK_RULE_OUTCOMES = ["satisfied", "not_satisfied", "prerequisite_locked"] as const;
/** One locked item's rule as it ran this turn. */
export type RuleRun = { itemId: string; path: string; outcome: (typeof UNLOCK_RULE_OUTCOMES)[number] };

export function isGoodLabel(label: Label): boolean {
  return label === "confirm_grounded" || label === "boundary_probe";
}

export function initialState(opennessStart: number): EngineState {
  return { turnIndex: 0, unlocked: [], ledger: [], disclosed: [], openness: opennessStart, selectedHook: null };
}
