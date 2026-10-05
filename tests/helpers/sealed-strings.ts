import { readFileSync } from "node:fs";
import type { Scenario } from "@/scenario/schema";
import { containsTerm } from "@/scenario/text-normalize";

export const CHI_THU_FILE = "scenarios/ux-chi-tieu/chi-thu.json";

export function readChiThu(): Scenario {
  return JSON.parse(readFileSync(CHI_THU_FILE, "utf8"));
}

/** Every authored string of the items: what must stay on the server until the engine releases it. */
export function sealedStrings(scenario: Scenario): string[] {
  return scenario.items.flatMap((item) => [
    item.content,
    item.hook_line,
    item.do_not_assert.text,
    item.sample_question,
    item.topic_tag,
  ]);
}

/**
 * The sealed strings and secret terms found in a text; empty when nothing leaked. Whole strings
 * are matched exactly, secret terms by words whatever the case and diacritics.
 */
export function findSealed(text: string, scenario: Scenario): string[] {
  const terms = scenario.items.flatMap((item) => item.secret_terms);
  return [
    ...sealedStrings(scenario).filter((sealed) => text.includes(sealed)),
    ...terms.filter((term) => containsTerm(text, term)),
  ];
}
