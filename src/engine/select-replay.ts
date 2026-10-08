import type { Scenario } from "@/scenario/schema";
import type { ReplaySelection } from "./reveal-types";
import type { HookEntry, Label, UnlockedItem } from "./types";

/**
 * Chooses the moment to replay (PRD §9.2). Code only, and it runs before any reveal call: it reads
 * the ledger and the labels code already checked, never a model's opinion about them.
 *
 * 1. Primary: an ignored hook of a follow-up or past-story item that is still locked. Highest
 *    weight wins, then the earliest drop, then scenario order. The branch forks after the drop.
 *    A hook dropped in a persona turn that broke a do-not-assert is no candidate (FR-16): that
 *    turn is evidence for nothing, and the replay would start right after it.
 * 2. Fallback 1: the earliest leading question. The branch forks just before it.
 * 3. Fallback 2: no replay.
 */
export function selectReplay(input: {
  scenario: Pick<Scenario, "items">;
  ledger: HookEntry[];
  unlocked: UnlockedItem[];
  /** Turns with the label left after the code checks, and whether the persona reply was flagged. */
  turns: { index: number; label: Label | null; flagged?: boolean }[];
}): ReplaySelection {
  const { scenario, ledger, unlocked, turns } = input;
  const open = new Set(unlocked.map((entry) => entry.itemId));
  const flagged = new Set(turns.filter((turn) => turn.flagged).map((turn) => turn.index));

  const candidates = ledger.flatMap((entry) => {
    const position = scenario.items.findIndex((item) => item.id === entry.itemId);
    const item = scenario.items[position];
    if (!item || entry.ignoredAt === null || open.has(item.id) || flagged.has(entry.droppedAt)) return [];
    if (item.path !== "follow_up" && item.path !== "past_story") return [];
    return [{ itemId: item.id, weight: item.weight, droppedAt: entry.droppedAt, position }];
  });
  const [primary] = candidates.sort((a, b) => b.weight - a.weight || a.droppedAt - b.droppedAt || a.position - b.position);
  if (primary) return { level: "primary", forkAfterTurn: primary.droppedAt, targetItemId: primary.itemId };

  const leading = turns.filter((turn) => turn.label === "leading").map((turn) => turn.index);
  if (leading.length > 0) {
    const first = Math.min(...leading);
    return { level: "fallback1", forkAfterTurn: first - 1, leadingTurn: first };
  }
  return { level: "none" };
}
