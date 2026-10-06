import type { z } from "zod";
import { alias } from "@/engine/aliases";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildLeakJudgeMessages, leakJudgeSchema } from "@/llm/prompts/eval-leak-judge";
import type { Scenario } from "@/scenario/schema";
import type { Contradiction, LeakFlagDraft } from "./types";

/** One persona turn of a finished episode, with what was open and what the persona was allowed to say. */
export type JudgedTurn = {
  index: number;
  question: string;
  personaText: string;
  openItemIds: string[];
  allowedHooks: string[];
};

type RawFindings = z.infer<typeof leakJudgeSchema>;

const words = (text: string) => text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * True when the words of `term` occur in `text` next to each other, in order, whatever the case.
 * Diacritics count here, unlike in `validate`: "khóe mắt" is not the secret term "khoe", and a
 * flag that is wrong costs two admins a ruling each.
 */
export function saysTerm(text: string, term: string): boolean {
  const needle = words(term);
  const haystack = words(text);
  if (needle.length === 0) return false;
  return haystack.some((_, start) => needle.every((word, offset) => haystack[start + offset] === word));
}

/**
 * A flag for the first time the persona says a secret term of an item that is still locked:
 * found by matching words, with no model. Later turns that repeat a term already said are not
 * flagged again; the leak, if it is one, happened where the term first appeared.
 */
export function secretTermFlags(scenario: Scenario, turns: JudgedTurn[]): LeakFlagDraft[] {
  const said = new Set<string>();
  return turns.flatMap((turn) =>
    scenario.items
      .filter((item) => !turn.openItemIds.includes(item.id))
      .flatMap((item) => {
        const terms = item.secret_terms.filter((term) => saysTerm(turn.personaText, term) && !said.has(`${item.id}:${term}`));
        for (const term of terms) said.add(`${item.id}:${term}`);
        if (terms.length === 0) return [];
        return [
          {
            turn: turn.index,
            itemId: item.id,
            kind: "content" as const,
            excerpt: turn.personaText,
            allowedHooks: turn.allowedHooks,
            reason: `Lời nhân vật chứa cụm bí mật ${terms.map((term) => `"${term}"`).join(", ")} của item còn khóa.`,
          },
        ];
      }),
  );
}

/**
 * Turns the judge's output into findings code can stand behind. A finding is kept only when it
 * names a real persona turn and a real item; a flag also needs the item to have been locked at
 * that turn (an open item cannot leak). An excerpt that is not in the turn is replaced by the
 * whole reply, so the adjudicators always read the persona's own words.
 */
export function checkFindings(
  scenario: Scenario,
  turns: JudgedTurn[],
  raw: RawFindings,
): { flags: LeakFlagDraft[]; contradictions: Contradiction[] } {
  const turnAt = new Map(turns.map((turn) => [turn.index, turn]));
  const itemOf = new Map(scenario.items.map((item) => [alias(scenario, "item", item.id), item.id]));
  const excerptOf = (turn: JudgedTurn, excerpt: string) =>
    excerpt.trim() !== "" && turn.personaText.includes(excerpt.trim()) ? excerpt.trim() : turn.personaText;

  const flags: LeakFlagDraft[] = [];
  for (const flag of raw.flags) {
    const turn = turnAt.get(flag.turn);
    const itemId = itemOf.get(flag.item.trim());
    if (!turn || !itemId || turn.openItemIds.includes(itemId)) continue;
    if (flags.some((kept) => kept.turn === turn.index && kept.itemId === itemId && kept.kind === flag.kind)) continue;
    flags.push({
      turn: turn.index,
      itemId,
      kind: flag.kind,
      excerpt: excerptOf(turn, flag.excerpt),
      allowedHooks: turn.allowedHooks,
      reason: flag.reason,
    });
  }

  const contradictions: Contradiction[] = [];
  for (const entry of raw.contradictions) {
    const turn = turnAt.get(entry.turn);
    const itemId = itemOf.get(entry.item.trim());
    if (!turn || !itemId) continue;
    contradictions.push({ turn: turn.index, itemId, excerpt: excerptOf(turn, entry.excerpt), reason: entry.reason });
  }
  return { flags, contradictions };
}

/**
 * Reads one finished episode against the whole scenario (FR-34): content of an item that was not
 * open, a locked topic named outside the allowed hook, and contradictions around an opened item.
 * The judge's flags are joined with the secret-term matches; a flag is only a suspicion until
 * two admins rule on it.
 */
export async function judgeLeaks(
  scenario: Scenario,
  turns: JudgedTurn[],
  options: { scope: CallScope; meta: Record<string, string | number>; llmDeps?: Partial<CallModelDeps> },
): Promise<{ flags: LeakFlagDraft[]; contradictions: Contradiction[] }> {
  if (turns.length === 0) return { flags: [], contradictions: [] };

  const messages = buildLeakJudgeMessages({
    persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity },
    surfaceFacts: scenario.surface_facts,
    items: scenario.items.map((item) => ({
      alias: alias(scenario, "item", item.id),
      topicTag: item.topic_tag,
      content: item.content,
    })),
    turns: turns.map((turn) => ({
      index: turn.index,
      question: turn.question,
      personaText: turn.personaText,
      openItems: turn.openItemIds.map((id) => alias(scenario, "item", id)),
      allowedHooks: turn.allowedHooks,
    })),
  });
  const reply = await callModel(
    "EVAL_LEAK_JUDGE",
    messages,
    { schema: leakJudgeSchema, meta: options.meta, scope: options.scope },
    options.llmDeps,
  );

  const judged = checkFindings(scenario, turns, reply.output);
  const matched = secretTermFlags(scenario, turns).filter(
    (flag) => !judged.flags.some((kept) => kept.turn === flag.turn && kept.itemId === flag.itemId && kept.kind === "content"),
  );
  const flags = [...judged.flags, ...matched].sort((a, b) => a.turn - b.turn);
  return { flags, contradictions: judged.contradictions };
}
