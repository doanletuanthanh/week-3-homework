import type { Scenario } from "@/scenario/schema";
import { resolveAliases } from "./aliases";
import { applyVerdict } from "./apply-verdict";
import { checkAnalysis } from "./check-analysis";
import { buildPersonaContext, type PersonaContext, type TranscriptLine } from "./contexts";
import { chooseHook, updateLedger } from "./hooks";
import { nextOpenness } from "./openness";
import { tokenize } from "./tokens";
import type { CheckedAnalysis, Correction, EngineState, RawAnalysis, RuleRun, Verdict } from "./types";
import { decideUnlock } from "./unlock";

const NO_VERDICT: Verdict = { hook_dropped: false, disclosed_item_ids: [], violations: [] };

export type TurnPlan = {
  turnIndex: number;
  /** The verdict about turn t-1, cut down to what code accepted. */
  verdict: Verdict;
  /** Snapshot t-1 with that verdict applied: what the rules read. */
  previousState: EngineState;
  analysis: CheckedAnalysis;
  corrections: Correction[];
  rules: RuleRun[];
  unlockedItemId: string | null;
  hookToDrop: string | null;
  opennessBefore: number;
  opennessAfter: number;
  /** Snapshot t. */
  stateAfter: EngineState;
  personaContext: PersonaContext;
};

/** The part of a plan stored with the turn, for `trace`. */
export type TurnDecision = Pick<
  TurnPlan,
  "analysis" | "corrections" | "rules" | "unlockedItemId" | "opennessBefore" | "opennessAfter"
>;

/**
 * Everything code decides in one turn, between Call 1 and Call 2 (addendum §1 steps 2 to 4).
 * Pure: the same scenario, state and analysis always give the same plan. The model cannot open
 * an item; it can only hand over judgements, which are checked here before any rule reads them.
 */
export function planTurn(input: {
  scenario: Scenario;
  /** Snapshot t-1 as stored. */
  state: EngineState;
  /** Call 1 output: untrusted. */
  analysis: RawAnalysis;
  /** Turns 0 to t-1. */
  transcript: TranscriptLine[];
  question: string;
  /** Replay only: the target item wins when several items could open. */
  priorityItemId?: string;
  /**
   * Replay only: the verdict in Call 1's output is not read. The replay judge already gave the
   * verdict about turn t-1, and the stored snapshot holds it.
   */
  ignoreVerdict?: boolean;
}): TurnPlan {
  const { scenario, state, transcript, question, priorityItemId } = input;
  const turnIndex = state.turnIndex + 1;

  const { resolved, corrections: aliasCorrections } = resolveAliases(scenario, input.analysis);
  // The verdict goes in first, so a hook dropped at t-1 can be picked up at t.
  const { state: previousState, applied: verdict } = input.ignoreVerdict
    ? { state, applied: NO_VERDICT }
    : applyVerdict(scenario, state, resolved.verdict);
  const { checked, corrections } = checkAnalysis(resolved, {
    state: previousState,
    turnIndex,
    learnerTokenCount: tokenize(question).length,
  });

  const { runs, unlockedItemId } = decideUnlock({ scenario, state: previousState, analysis: checked, priorityItemId });

  const unlocked = unlockedItemId
    ? [...previousState.unlocked, { itemId: unlockedItemId, turn: turnIndex }]
    : previousState.unlocked;
  const ledger = updateLedger(previousState.ledger, { turnIndex, pickedItemId: checked.hook_item_id, unlockedItemId });
  const hookToDrop = chooseHook({
    scenario,
    unlockedIds: new Set(unlocked.map((entry) => entry.itemId)),
    ledger,
    analysis: checked,
    justUnlockedItemId: unlockedItemId,
  });

  const stateAfter: EngineState = {
    turnIndex,
    unlocked,
    ledger,
    disclosed: previousState.disclosed,
    openness: nextOpenness(previousState.openness, checked.label, checked.question_type),
    selectedHook: hookToDrop,
  };

  return {
    turnIndex,
    verdict,
    previousState,
    analysis: checked,
    corrections: [...aliasCorrections, ...corrections],
    rules: runs,
    unlockedItemId,
    hookToDrop,
    opennessBefore: previousState.openness,
    opennessAfter: stateAfter.openness,
    stateAfter,
    personaContext: buildPersonaContext(
      scenario,
      { stateAfter, justUnlockedItemId: unlockedItemId, tagItemId: checked.tag_item_id },
      transcript,
      question,
    ),
  };
}
