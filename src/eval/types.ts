import type { Label, QuestionType } from "@/engine/types";

export const EVAL_PROFILES = ["quick", "full", "reduced"] as const;
export type EvalProfile = (typeof EVAL_PROFILES)[number];

/**
 * Who asks the questions of an episode. `good` and `bad` are simulated learners, `adversarial`
 * is a scripted attack on the engine, `baseline` is the same attack on a prompt-only persona.
 */
export const EPISODE_KINDS = ["good", "bad", "adversarial", "baseline"] as const;
export type EpisodeKind = (typeof EPISODE_KINDS)[number];

/** One episode a run must play. `key` names it inside the run ("good-1", "adversarial-07"). */
export type EpisodeSpec = { key: string; kind: EpisodeKind; attackId?: string; turns: number };

export type EpisodeTurn = {
  index: number;
  question: string;
  personaText: string;
  // The fields below are what the engine decided; a baseline turn has no engine and leaves them empty.
  label: Label | null;
  questionType: QuestionType | null;
  unlockedItemId: string | null;
  /** Item whose hook the persona was asked to drop in this turn. */
  hookSelected: string | null;
  /** The verdict on that hook; null when no hook was selected. */
  hookDropped: boolean | null;
};

export const LEAK_KINDS = ["content", "topic"] as const;
/** FR-34: (a) content of an item that was not open; (b) a locked topic named outside the allowed hook. */
export type LeakKind = (typeof LEAK_KINDS)[number];

/** A possible leak in one persona turn. It counts only once two admins have ruled on it. */
export type LeakFlagDraft = {
  turn: number;
  itemId: string;
  kind: LeakKind;
  excerpt: string;
  /** Hook lines the persona was allowed to say at that turn. */
  allowedHooks: string[];
  reason: string;
};

/** The persona said something after an item opened that does not fit what it said before, or the reverse. */
export type Contradiction = { turn: number; itemId: string; excerpt: string; reason: string };

export type EpisodeResult = {
  key: string;
  kind: EpisodeKind;
  attackId?: string;
  turns: EpisodeTurn[];
  /** Items the engine opened, in order. Always empty for a baseline episode. */
  openedItemIds: string[];
  flags: LeakFlagDraft[];
  contradictions: Contradiction[];
  costUsd: number;
};

export type Threshold = { key: string; label: string; met: boolean; detail: string };

type OpenedStat = { runs: number[]; median: number };
type LeakStat = { episodes: number; flags: number; perEpisode: number };

/** FR-34 report of one run. Stored in `eval_run.report_json`. */
export type EvalReport = {
  profile: EvalProfile;
  /** Learner turns per episode. */
  turns: number;
  itemCount: number;
  opened: { good: OpenedStat; bad: OpenedStat };
  /** Share of the items a good run opens, against the 50–75 % target. */
  calibration: { ratio: number; inTarget: boolean };
  leaks: { learner: LeakStat; adversarial: LeakStat; baseline: LeakStat };
  hookTransmission: { selected: number; dropped: number; rate: number | null };
  contradictions: { count: number; openedItems: number; rate: number | null };
  /** Added with the reveal pipeline; until then the gate treats it as not met. */
  verifierDisagreement: number | null;
  thresholds: Threshold[];
  cost: { estimateUsd: number; actualUsd: number };
};
