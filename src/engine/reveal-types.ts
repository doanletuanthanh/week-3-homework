import type { Scenario, UnlockPath } from "@/scenario/schema";
import type { TokenRange } from "./tokens";
import type { CheckedAnalysis, EngineState, Label, Verdict } from "./types";

/**
 * The moment the learner is offered to replay (PRD §9.2). `primary` targets one item whose hook
 * was ignored; `fallback1` replays the earliest leading question; `none` means no replay.
 */
export type ReplaySelection =
  | { level: "primary"; forkAfterTurn: number; targetItemId: string }
  | { level: "fallback1"; forkAfterTurn: number; leadingTurn: number }
  | { level: "none" };

/** One main-branch turn as the reveal reads it. */
export type RevealTurn = {
  index: number;
  learnerText: string | null;
  learnerTokens: string[] | null;
  personaText: string;
  /** Call 1 output after the code checks; null for the opening line. */
  analysis: CheckedAnalysis | null;
  unlockedItemId: string | null;
  /** This question lowered the persona's openness. */
  opennessDropped: boolean;
  /** The persona reply broke a do-not-assert: it is evidence for nothing (FR-16). */
  flagged: boolean;
};

/** Everything frozen at the end of a session that the reveal is computed from. The guess is not part of it. */
export type RevealBasis = {
  scenario: Scenario;
  /** Turns 0 to N of the main branch. */
  turns: RevealTurn[];
  /** The state of the last turn. The end judge's verdict about that turn may not be in it yet. */
  state: EngineState;
  canvasTokens: string[];
};

export const CANVAS_MATCH_KINDS = ["told", "unconfirmed", "unrevealed", "never_said"] as const;
/**
 * What a stretch of the notes turned out to be (PRD §8.1): an item the persona told; an item that
 * showed in the transcript but was not told; an item that never showed; or something nobody said.
 */
export type CanvasMatchKind = (typeof CANVAS_MATCH_KINDS)[number];

export type CanvasMatch = {
  range: TokenRange;
  kind: CanvasMatchKind;
  /** Null only for `never_said`. */
  itemId: string | null;
  /** The judge's own words. Kept for the trace; never shown to a learner (FR-48a). */
  reason: string;
};

/** The end judge's output after code resolved it. `ok: false` is a call that failed after its retries. */
export type JudgePart = { ok: true; verdict: Verdict; matches: CanvasMatch[] } | { ok: false };

export const SLOT_TYPES = ["praise", "leading", "hypothetical_future", "heard_not_followed", "habit"] as const;
/** The comments code can trigger (addendum §3.3). `habit` is a card of its own, outside the limit of three. */
export type SlotType = (typeof SLOT_TYPES)[number];

/** One comment code decided the generator should write, with the evidence it may cite. */
export type CommentSlot = {
  id: string;
  type: SlotType;
  /** Learner turns the comment is about; a claim may cite these and no others. */
  turns: number[];
  /** `leading`: the words the learner added, per turn. */
  spans?: { turn: number; text: string }[];
  /** `heard_not_followed`: the note that matched, and the item whose hook was ignored. */
  canvas?: { range: TokenRange; text: string; itemId: string };
};

/** A generator claim whose references all resolved. */
export type DraftClaim = {
  id: string;
  slot: SlotType;
  text: string;
  citedTurns: number[];
  itemId: string | null;
  canvasRange: TokenRange | null;
  suggestedQuestion: string | null;
  /** About the replay target: held back from the browser until the replay has ended. */
  sealed: boolean;
};

export type GeneratorPart = { ok: true; claims: DraftClaim[] } | { ok: false };

export const CHECK_KINDS = [
  "unlock",
  "disclosure",
  "leading_novelty",
  "hook_ignored",
  "praise",
  "comment",
  "habit",
  "suggested_question",
] as const;
/** What the verifier is asked to confirm (addendum §2.5). */
export type CheckKind = (typeof CHECK_KINDS)[number];

/** One thing the verifier must confirm, built by code from frozen data. */
export type VerifierCheck = {
  id: string;
  kind: CheckKind;
  /** The turn the check is about: the unlocking, telling, leading or ignoring turn. */
  turn: number | null;
  itemId: string | null;
  /** Set for checks on a generator claim. */
  claimId: string | null;
  /** What the verifier reads: the claim text, the added words, the suggested question. */
  text: string;
};

export type CheckVerdict = { id: string; agree: boolean; label: Label | null; reason: string };

export type VerifierPart = { ok: true; verdicts: CheckVerdict[] } | { ok: false };

/** Processed output of each reveal call, stored as it completes so a restart never repeats a call. */
export type RevealParts = { judge?: JudgePart; generator?: GeneratorPart; verifier?: VerifierPart };

export const DIAGNOSIS_KEYS = [
  "heard_not_followed",
  "changed_topic",
  "try_from_here",
  "added_own_idea",
  "try_differently",
] as const;
/** Which fixed line the replay offer opens with (PRD Màn 6 item 2). */
export type DiagnosisKey = (typeof DIAGNOSIS_KEYS)[number];

export type RevealItem = {
  id: string;
  content: string;
  path: UnlockPath;
  /** `held` is the replay target: neither told nor listed as missed until the replay has ended. */
  state: "told" | "missed" | "held";
  toldTurn: number | null;
  sampleQuestion: string;
  /** The turn in which the persona dropped this item's hook, and the question asked right after. */
  hook: { turn: number; personaText: string; next: { turn: number; learnerText: string } | null } | null;
  /** Trust items: the questions that made the persona more guarded. */
  trustTurns: number[];
};

export type LeadingTurn = {
  turn: number;
  span: TokenRange;
  spanText: string;
  /** The verifier agreed the persona had not said this before. Only then is the turn shown as leading. */
  novel: boolean;
};

export type RevealClaim = DraftClaim & {
  /** The learner's question of the first cited turn, word for word. */
  quote: string | null;
  canvasQuote: string | null;
  /** Passed the verifier, together with its suggested question when it has one. */
  shown: boolean;
};

/**
 * The frozen result of a session's reveal: the processed output of the three calls and every
 * number, with nothing held back. It never leaves the server as it is: `seal.ts` builds what a
 * browser may see from it.
 */
export type RevealJson = {
  replay: ReplaySelection;
  failed: { judge: boolean; generator: boolean; verifier: boolean };
  counts: {
    /** KHAI THÁC: items that were opened and told. */
    told: number;
    total: number;
    /** Items that showed in the transcript: hook dropped, or told. */
    revealedCount: number;
    /** NHẬN BIẾT with every item counted, the replay target included. Null when the notes were not judged. */
    recognizedFull: number | null;
  };
  canvasEmpty: boolean;
  items: RevealItem[];
  canvasMatches: CanvasMatch[];
  leading: LeadingTurn[];
  /** Comments code triggered, whatever became of them. */
  slotCount: number;
  claims: RevealClaim[];
  diagnosisKey: DiagnosisKey | null;
  /** No replay: the most important item still locked, whose sample question is shown instead. */
  sampleItemId: string | null;
  /** How often the verifier agreed, per kind of check (NFR-8). Null when the verifier failed. */
  verifierChecks: Partial<Record<CheckKind, { agree: number; disagree: number }>> | null;
};
