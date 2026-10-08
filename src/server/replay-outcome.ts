import type { LoadedReplay } from "@/db/repo/replay";
import type { TurnRow } from "@/db/repo/sessions";
import { describeReplay, type ReplayOutcome, type ReplayTurn } from "@/engine/replay-result";
import type { Scenario } from "@/scenario/schema";

/** A stored replay turn as the result reads it. */
export function toReplayTurn(row: TurnRow): ReplayTurn {
  const decision = row.decisionJson;
  if (!decision) throw new Error(`replay turn ${row.index} has no decision`);
  return {
    index: row.index,
    label: decision.analysis.label,
    introducedSpan: decision.analysis.introduced_span,
    learnerTokens: row.learnerTokens ?? [],
    unlockedItemId: decision.unlockedItemId,
    // A replay turn gets its verdict from the judge in its own transaction: none means the judge failed.
    disclosedItemIds: row.verdictJson?.disclosed_item_ids ?? null,
    judgeLabel: row.judgeLabel,
  };
}

/**
 * What the learner is shown about a replay that has ended; null while it runs. It holds the
 * target's content, so callers hand it to a browser only as the answer that ends the replay, or
 * for a session that is `done`. Built from stored rows: no model is called.
 */
export function replayOutcomeOf(scenario: Scenario, replay: LoadedReplay): ReplayOutcome | null {
  const { branch } = replay;
  if (branch.result === null || branch.fallbackLevel === null || branch.forkAfterTurn === null) return null;
  return describeReplay({
    scenario,
    level: branch.fallbackLevel,
    result: branch.result,
    forkAfterTurn: branch.forkAfterTurn,
    targetItemId: branch.targetItemId,
    turns: replay.turns.map(toReplayTurn),
    openItemIds: new Set(replay.openItemIds),
  });
}
