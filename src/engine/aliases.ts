import type { Scenario } from "@/scenario/schema";
import type { Correction, RawAnalysis, Verdict } from "./types";

/**
 * Prompts never show scenario ids: a slug such as an item id can describe the secret it names.
 * Each item is shown by its position instead, with one letter per kind of reference.
 */
const KINDS = { item: "I", hook: "H", tag: "T", doNotAssert: "D" } as const;
export type AliasKind = keyof typeof KINDS;

export function alias(scenario: Pick<Scenario, "items">, kind: AliasKind, itemId: string): string {
  const position = scenario.items.findIndex((item) => item.id === itemId);
  if (position < 0) throw new Error(`unknown item "${itemId}"`);
  return `${KINDS[kind]}${position + 1}`;
}

/** The item an alias of this kind points at, or null for anything else the model wrote. */
function itemIndex(scenario: Pick<Scenario, "items">, kind: AliasKind, value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = new RegExp(`^${KINDS[kind]}([1-9][0-9]*)$`).exec(value.trim());
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index < scenario.items.length ? index : null;
}

/** The scenario id of the item an alias of this kind points at; null for anything else a model wrote. */
export function resolveAlias(scenario: Pick<Scenario, "items">, kind: AliasKind, value: unknown): string | null {
  const index = itemIndex(scenario, kind, value);
  return index === null ? null : scenario.items[index].id;
}

/** Call 1 output with every alias turned into a scenario id. Unknown references are dropped. */
export type ResolvedAnalysis = Omit<RawAnalysis, "prev_turn_verdict" | "hook_id" | "topic_tags"> & {
  /** `disclosed_item_ids` are item ids, `violations` are do-not-assert ids. */
  verdict: Verdict;
  hook_item_id: string | null;
  tag_item_ids: string[];
};

const UNKNOWN = "không có trong kịch bản";

/** Maps a verdict's aliases to scenario ids; used for Call 1 and for the turn judge. */
export function resolveVerdict(
  scenario: Pick<Scenario, "items">,
  raw: Verdict,
  corrections: Correction[] = [],
): Verdict {
  const many = (kind: AliasKind, field: string, values: string[], pick: (index: number) => string) => {
    const kept: string[] = [];
    for (const value of values) {
      const index = itemIndex(scenario, kind, value);
      if (index === null) corrections.push({ field, from: value, to: null, reason: UNKNOWN });
      else if (!kept.includes(pick(index))) kept.push(pick(index));
    }
    return kept;
  };
  return {
    hook_dropped: raw.hook_dropped === true,
    disclosed_item_ids: many("item", "prev_turn_verdict.disclosed_item_ids", raw.disclosed_item_ids, (index) => scenario.items[index].id),
    violations: many("doNotAssert", "prev_turn_verdict.violations", raw.violations, (index) => scenario.items[index].do_not_assert.id),
  };
}

export function resolveAliases(
  scenario: Pick<Scenario, "items">,
  raw: RawAnalysis,
): { resolved: ResolvedAnalysis; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const verdict = resolveVerdict(scenario, raw.prev_turn_verdict, corrections);

  let hookItemId: string | null = null;
  if (raw.hook_id !== null) {
    const index = itemIndex(scenario, "hook", raw.hook_id);
    if (index === null) corrections.push({ field: "hook_id", from: raw.hook_id, to: null, reason: UNKNOWN });
    else hookItemId = scenario.items[index].id;
  }

  const tagItemIds: string[] = [];
  for (const tag of raw.topic_tags) {
    const index = itemIndex(scenario, "tag", tag);
    if (index === null) corrections.push({ field: "topic_tags", from: tag, to: null, reason: UNKNOWN });
    else if (!tagItemIds.includes(scenario.items[index].id)) tagItemIds.push(scenario.items[index].id);
  }

  return {
    resolved: {
      verdict,
      question_type: raw.question_type,
      label: raw.label,
      grounded_turn_id: raw.grounded_turn_id,
      introduced_span: raw.introduced_span,
      hook_item_id: hookItemId,
      tag_item_ids: tagItemIds,
    },
    corrections,
  };
}
