import type { Scenario, ScenarioItem } from "@/scenario/schema";
import { isGoodLabel, type CheckedAnalysis, type EngineState, type RuleRun } from "./types";

/** The rule of one path (addendum §3.1). `state` is snapshot t-1 after the verdict for turn t-1. */
function satisfies(item: ScenarioItem, state: EngineState, analysis: CheckedAnalysis): boolean {
  const notLeading = analysis.label !== "leading";
  const tagTouched = analysis.tag_item_id === item.id;
  const hookPicked = analysis.hook_item_id === item.id;

  switch (item.path) {
    case "surface":
      return tagTouched && notLeading;
    case "follow_up": {
      const hook = state.ledger.find((entry) => entry.itemId === item.id && entry.closedAt === null);
      return (
        hookPicked && hook !== undefined && isGoodLabel(analysis.label) && analysis.grounded_turn_id === hook.droppedAt
      );
    }
    case "past_story":
      return analysis.question_type === "past_specific" && (tagTouched || hookPicked) && notLeading;
    case "trust":
      // `validate` requires a threshold on every trust item; without one the item never opens.
      return item.trust_threshold !== undefined && state.openness >= item.trust_threshold && tagTouched && notLeading;
  }
}

/**
 * Decides which item opens this turn: at most one. Among the items whose rule holds, the replay
 * target wins, then the highest weight, then scenario order. An item behind a locked
 * prerequisite is not considered.
 */
export function decideUnlock(input: {
  scenario: Pick<Scenario, "items">;
  state: EngineState;
  analysis: CheckedAnalysis;
  priorityItemId?: string;
}): { runs: RuleRun[]; unlockedItemId: string | null } {
  const { scenario, state, analysis, priorityItemId } = input;
  const unlocked = new Set(state.unlocked.map((entry) => entry.itemId));

  const runs: RuleRun[] = scenario.items
    .filter((item) => !unlocked.has(item.id))
    .map((item) => {
      if (item.prerequisite_id !== undefined && !unlocked.has(item.prerequisite_id)) {
        return { itemId: item.id, path: item.path, outcome: "prerequisite_locked" };
      }
      return { itemId: item.id, path: item.path, outcome: satisfies(item, state, analysis) ? "satisfied" : "not_satisfied" };
    });

  const weightOf = new Map(scenario.items.map((item) => [item.id, item.weight]));
  const [winner] = runs
    .filter((run) => run.outcome === "satisfied")
    // Array.sort is stable, so equal weights keep scenario order.
    .sort((a, b) => {
      const priority = Number(b.itemId === priorityItemId) - Number(a.itemId === priorityItemId);
      return priority !== 0 ? priority : weightOf.get(b.itemId)! - weightOf.get(a.itemId)!;
    });

  return { runs, unlockedItemId: winner?.itemId ?? null };
}
