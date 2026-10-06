import type { Scenario } from "@/scenario/schema";
import type { CheckedAnalysis, HookEntry } from "./types";

/** A general open question aimed at no topic ("Có điều gì em chưa hỏi mà chị nghĩ em nên biết không?"). */
export function isClosingQuestion(analysis: CheckedAnalysis): boolean {
  return analysis.label === "open" && analysis.question_type === "open" && analysis.tag_item_id === null;
}

/**
 * Ledger transitions for turn t (addendum §3.2): the accepted `hook_id` marks its hook picked
 * (the first time only); a hook dropped at t-1 that this turn did not pick is marked ignored and
 * stays pickable; a hook closes when its item opens.
 */
export function updateLedger(
  ledger: HookEntry[],
  turn: { turnIndex: number; pickedItemId: string | null; unlockedItemId: string | null },
): HookEntry[] {
  return ledger.map((entry) => {
    if (entry.closedAt !== null) return entry;
    const picked = entry.itemId === turn.pickedItemId;
    return {
      ...entry,
      pickedAt: picked ? (entry.pickedAt ?? turn.turnIndex) : entry.pickedAt,
      ignoredAt: !picked && entry.droppedAt === turn.turnIndex - 1 ? turn.turnIndex : entry.ignoredAt,
      closedAt: entry.itemId === turn.unlockedItemId ? turn.turnIndex : null,
    };
  });
}

/**
 * Chooses the one hook the persona is asked to drop this turn, or none. A hook is eligible when
 * its item is still locked after this turn's unlock decision, the item's prerequisite is open,
 * no verdict has confirmed the hook as dropped yet, and this turn touches the item's tag, or
 * just opened its prerequisite, or is a closing question. Highest weight wins, then scenario order.
 */
export function chooseHook(input: {
  scenario: Pick<Scenario, "items">;
  /** Item ids open after this turn's unlock decision. */
  unlockedIds: ReadonlySet<string>;
  ledger: HookEntry[];
  analysis: CheckedAnalysis;
  justUnlockedItemId: string | null;
}): string | null {
  const { scenario, unlockedIds, ledger, analysis, justUnlockedItemId } = input;
  const dropped = new Set(ledger.map((entry) => entry.itemId));
  const closing = isClosingQuestion(analysis);

  const eligible = scenario.items.filter((item) => {
    if (unlockedIds.has(item.id) || dropped.has(item.id)) return false;
    if (item.prerequisite_id !== undefined && !unlockedIds.has(item.prerequisite_id)) return false;
    const prerequisiteJustOpened = item.prerequisite_id !== undefined && item.prerequisite_id === justUnlockedItemId;
    return analysis.tag_item_id === item.id || prerequisiteJustOpened || closing;
  });

  // Stable sort: equal weights keep scenario order.
  const [winner] = [...eligible].sort((a, b) => b.weight - a.weight);
  return winner?.id ?? null;
}
