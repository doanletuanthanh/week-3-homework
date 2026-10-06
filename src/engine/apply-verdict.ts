import type { Scenario } from "@/scenario/schema";
import type { EngineState, Verdict } from "./types";

/**
 * Writes the verdict about persona turn t-1 into snapshot t-1. This is the only change a stored
 * snapshot ever receives. The verdict is cut down to what can be true:
 * - `hook_dropped` counts only if that turn had a hook selected (and its item is still locked);
 * - an item counts as told only if it was open at that turn and not told before;
 * - a violation counts only for the do-not-assert of an item that was locked at that turn.
 * The opening line (turn 0) was authored, not generated: no verdict applies to it.
 */
export function applyVerdict(
  scenario: Pick<Scenario, "items">,
  state: EngineState,
  verdict: Verdict,
): { state: EngineState; applied: Verdict } {
  if (state.turnIndex === 0) {
    return { state, applied: { hook_dropped: false, disclosed_item_ids: [], violations: [] } };
  }

  const unlocked = new Set(state.unlocked.map((entry) => entry.itemId));
  const disclosed = new Set(state.disclosed.map((entry) => entry.itemId));

  const hook = state.selectedHook;
  const hookDropped =
    verdict.hook_dropped === true &&
    hook !== null &&
    !unlocked.has(hook) &&
    !state.ledger.some((entry) => entry.itemId === hook);

  const newlyDisclosed = [...new Set(verdict.disclosed_item_ids)].filter(
    (itemId) => unlocked.has(itemId) && !disclosed.has(itemId),
  );

  const lockedConstraints = new Set(
    scenario.items.filter((item) => !unlocked.has(item.id)).map((item) => item.do_not_assert.id),
  );
  const violations = [...new Set(verdict.violations)].filter((id) => lockedConstraints.has(id));

  return {
    state: {
      ...state,
      ledger: hookDropped
        ? [...state.ledger, { itemId: hook, droppedAt: state.turnIndex, pickedAt: null, ignoredAt: null, closedAt: null }]
        : state.ledger,
      disclosed: [...state.disclosed, ...newlyDisclosed.map((itemId) => ({ itemId, turn: state.turnIndex }))],
    },
    applied: { hook_dropped: hookDropped, disclosed_item_ids: newlyDisclosed, violations },
  };
}
