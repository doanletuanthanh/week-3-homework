import type { Scenario } from "./schema";

/** What a screen may show about a persona before the reveal. Holds no item content. */
export type PersonaCard = {
  /** Form of address for the middle of a sentence ("chị Thu"). */
  displayName: string;
  /** The same, for the start of a sentence or a label ("Chị Thu"). */
  displayNameCapitalized: string;
  name: string;
  tagline: string;
  researchGoal: string;
  /** The seal counter: how many unsaid items the persona holds. */
  itemCount: number;
};

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("vi") + text.slice(1);
}

/** The only path from a stored scenario to a page: pages render this, never the scenario. */
export function personaCard(scenario: Scenario): PersonaCard {
  return {
    displayName: scenario.persona.display_name,
    displayNameCapitalized: capitalizeFirst(scenario.persona.display_name),
    name: scenario.persona.name,
    tagline: scenario.persona.tagline,
    researchGoal: scenario.research_goal,
    itemCount: scenario.items.length,
  };
}

/**
 * The letter that stands for a persona with no illustration: the first of the given name, which
 * in a Vietnamese form of address is the last word ("chị Thu" → "T", not "C").
 */
export function personaInitial(displayName: string): string {
  // The last word that has a letter: a generated name may end in something else ("anh Dũng (IT)" has none there).
  const given = displayName.split(/\s+/u).findLast((word) => /^\p{L}/u.test(word)) ?? "";
  return (Array.from(given)[0] ?? "").toLocaleUpperCase("vi");
}
