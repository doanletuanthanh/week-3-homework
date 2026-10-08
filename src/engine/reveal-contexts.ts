import type { Scenario, UnlockPath } from "@/scenario/schema";
import { alias } from "./aliases";
import { buildJudgeContext, type JudgeContext, type TranscriptLine } from "./contexts";
import type { CheckKind, CommentSlot, DraftClaim, ReplaySelection, RevealBasis, SlotType, VerifierCheck } from "./reveal-types";
import { sliceTokens, type TokenRange } from "./tokens";
import type { Label, QuestionType } from "./types";

/**
 * What each reveal call may see. The session has ended, so the end judge and the verifier read
 * every item. The generator is the exception: the replay target stays sealed until the replay
 * ends, so its builder leaves the target's content, sample question and hook line out. The
 * learner's guess is an input of none of them.
 */

const transcriptOf = (basis: RevealBasis): TranscriptLine[] =>
  basis.turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));

/** Reveal call 1: the turn judge's material for the last persona turn, every item, and the frozen notes. */
export type EndJudgeContext = JudgeContext & {
  allItems: { alias: string; content: string }[];
  canvasTokens: string[];
};

export function buildEndJudgeContext(basis: RevealBasis): EndJudgeContext {
  const { scenario } = basis;
  return {
    ...buildJudgeContext(scenario, basis.state, transcriptOf(basis)),
    allItems: scenario.items.map((item) => ({ alias: alias(scenario, "item", item.id), content: item.content })),
    canvasTokens: basis.canvasTokens,
  };
}

export type FeedbackSlot = {
  id: string;
  type: SlotType;
  turns: number[];
  spans: { turn: number; text: string }[];
  note: { range: TokenRange; text: string; itemAlias: string } | null;
};

/** Reveal call 2. */
export type FeedbackContext = {
  persona: { displayName: string; identity: string };
  transcript: TranscriptLine[];
  slots: FeedbackSlot[];
  /** Items the persona did not tell. Never the replay target. */
  missedItems: { alias: string; content: string }[];
  /** The replay target, by alias only, with the turn of its hook: both are named so they can be avoided. */
  sealed: { itemAlias: string; hookTurn: number | null } | null;
  errorPatterns: Scenario["error_patterns"];
  habitLabel: string;
};

/** `basis` is settled: it holds the end judge's verdict about the last turn. */
export function buildFeedbackContext(basis: RevealBasis, selection: ReplaySelection, slots: CommentSlot[]): FeedbackContext {
  const { scenario, state } = basis;
  const targetId = selection.level === "primary" ? selection.targetItemId : null;
  const told = new Set(state.disclosed.map((entry) => entry.itemId));
  return {
    persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity },
    transcript: transcriptOf(basis),
    slots: slots.map((slot) => ({
      id: slot.id,
      type: slot.type,
      turns: slot.turns,
      spans: slot.spans ?? [],
      note: slot.canvas ? { range: slot.canvas.range, text: slot.canvas.text, itemAlias: alias(scenario, "item", slot.canvas.itemId) } : null,
    })),
    missedItems: scenario.items
      .filter((item) => !told.has(item.id) && item.id !== targetId)
      .map((item) => ({ alias: alias(scenario, "item", item.id), content: item.content })),
    sealed:
      targetId === null
        ? null
        : { itemAlias: alias(scenario, "item", targetId), hookTurn: state.ledger.find((entry) => entry.itemId === targetId)?.droppedAt ?? null },
    errorPatterns: scenario.error_patterns,
    habitLabel: scenario.habit_card_label,
  };
}

export type VerifierLine = {
  id: string;
  kind: CheckKind;
  turn: number | null;
  /** `hook_ignored`: the turn whose question did not pick the hook up. */
  nextTurn: number | null;
  itemContent: string | null;
  hookLine: string | null;
  path: UnlockPath | null;
  label: Label | null;
  questionType: QuestionType | null;
  citedTurns: number[];
  canvasQuote: string | null;
  text: string;
};

/** Reveal call 3. */
export type VerifierContext = {
  persona: { displayName: string; identity: string };
  transcript: TranscriptLine[];
  checks: VerifierLine[];
};

export function buildVerifierContext(basis: RevealBasis, checks: VerifierCheck[], claims: DraftClaim[]): VerifierContext {
  const { scenario } = basis;
  const itemOf = new Map(scenario.items.map((item) => [item.id, item]));
  const turnAt = new Map(basis.turns.map((turn) => [turn.index, turn]));
  const claimOf = new Map(claims.map((claim) => [claim.id, claim]));

  return {
    persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity },
    transcript: transcriptOf(basis),
    checks: checks.map((check) => {
      const item = check.itemId === null ? undefined : itemOf.get(check.itemId);
      const analysis = check.turn === null ? null : (turnAt.get(check.turn)?.analysis ?? null);
      const claim = check.claimId === null ? undefined : claimOf.get(check.claimId);
      const about = check.kind === "unlock" || check.kind === "disclosure";
      return {
        id: check.id,
        kind: check.kind,
        turn: check.turn,
        nextTurn: check.kind === "hook_ignored" && check.turn !== null ? check.turn + 1 : null,
        itemContent: about ? (item?.content ?? null) : null,
        hookLine: check.kind === "hook_ignored" ? (item?.hook_line ?? null) : null,
        path: check.kind === "unlock" ? (item?.path ?? null) : null,
        label: check.kind === "unlock" ? (analysis?.label ?? null) : null,
        questionType: check.kind === "unlock" ? (analysis?.question_type ?? null) : null,
        citedTurns: claim?.citedTurns ?? [],
        canvasQuote: claim?.canvasRange && check.kind !== "suggested_question" ? sliceTokens(basis.canvasTokens, claim.canvasRange) : null,
        text: check.text,
      };
    }),
  };
}
