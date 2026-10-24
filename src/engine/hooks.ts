import type { Scenario } from "@/scenario/schema";
import type { CheckedAnalysis, HookEntry } from "./types";

/**
 * A general open question aimed at no topic, not even broadly ("Có điều gì em chưa hỏi mà chị nghĩ
 * em nên biết không?").
 */
export function isClosingQuestion(analysis: CheckedAnalysis): boolean {
  return (
    analysis.label === "open" &&
    analysis.question_type === "open" &&
    analysis.tag_item_id === null &&
    analysis.hint_item_ids.length === 0
  );
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
 * Chooses the one hook the persona is asked to drop this turn, or none. A hook can be chosen when
 * its item is still locked after this turn's unlock decision, the item's prerequisite is open,
 * and no verdict has confirmed the hook as dropped yet. Among those, the turn's own reasons come
 * first: it asks about the item's topic directly, or just opened its prerequisite, or is a closing
 * question. Only when none applies, and the question asks about no locked item directly, do the
 * topics it merely touches count. So a broad question that opens nothing still offers the hook of
 * the heaviest topic it touches, once per item, and a touched topic never takes the slot from a
 * direct topic or a story's next step, nor drops its hook while the learner asks about another
 * locked item. Highest weight wins, then scenario order.
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

  const pickable = scenario.items.filter(
    (item) =>
      !unlockedIds.has(item.id) &&
      !dropped.has(item.id) &&
      (item.prerequisite_id === undefined || unlockedIds.has(item.prerequisite_id)),
  );
  const own = pickable.filter(
    (item) =>
      analysis.tag_item_id === item.id ||
      (item.prerequisite_id !== undefined && item.prerequisite_id === justUnlockedItemId) ||
      closing,
  );
  const directLocked = analysis.tag_item_id !== null && !unlockedIds.has(analysis.tag_item_id);
  const eligible = own.length > 0 || directLocked ? own : pickable.filter((item) => analysis.hint_item_ids.includes(item.id));

  // Stable sort: equal weights keep scenario order.
  const [winner] = [...eligible].sort((a, b) => b.weight - a.weight);
  return winner?.id ?? null;
}
