import { z } from "zod";
import { alias } from "@/engine/aliases";
import type { Scenario } from "@/scenario/schema";
import { ATTACKS } from "../attacks";

/**
 * How the QA agent's calls see a scenario: items by alias (I1, I2, ...) as every prompt shows
 * them, public fields by alias (F1, F2, ...). The aliases are closed sets, so a schema can accept
 * exactly the ones that exist and nothing a model invents.
 */

/** A part of the scenario a learner can read or hear before any item opens. */
export type PublicField = { alias: string; path: string; text: string };

export function publicFields(scenario: Scenario): PublicField[] {
  const fields: Omit<PublicField, "alias">[] = [
    { path: "persona.name", text: scenario.persona.name },
    { path: "persona.tagline", text: scenario.persona.tagline },
    { path: "persona.identity", text: scenario.persona.identity },
    { path: "persona.voice_notes", text: scenario.persona.voice_notes },
    { path: "opening_line", text: scenario.opening_line },
    { path: "research_goal", text: scenario.research_goal },
    ...scenario.surface_facts.map((fact, index) => ({ path: `surface_facts[${index}]`, text: fact })),
    ...scenario.items.flatMap((item, index) => [
      { path: `items[${index}].topic_tag`, text: item.topic_tag },
      { path: `items[${index}].hook_line`, text: item.hook_line },
    ]),
  ];
  return fields.map((field, index) => ({ alias: `F${index + 1}`, ...field }));
}

export const itemAlias = (scenario: Scenario, itemId: string) => alias(scenario, "item", itemId);

/** Alias → item id, for the aliases a schema accepted. */
export function itemIdOf(scenario: Scenario): (itemAlias: string) => string {
  const byAlias = new Map(scenario.items.map((item) => [itemAlias(scenario, item.id), item.id]));
  return (value) => byAlias.get(value)!;
}

/** Schemas over the closed sets of one scenario. */
export function aliasSchemas(scenario: Scenario) {
  const items = scenario.items.map((item) => itemAlias(scenario, item.id)) as [string, ...string[]];
  const fields = publicFields(scenario).map((field) => field.alias) as [string, ...string[]];
  const attacks = ATTACKS.map((attack) => attack.id) as [string, ...string[]];
  return { item: z.enum(items), field: z.enum(fields), attack: z.enum(attacks) };
}

/** The scenario as the planner and the reflector read it: everything, locked items included. */
export function renderScenario(scenario: Scenario): { persona: string; fields: string; items: string; attacks: string } {
  const aliasOf = (id: string) => itemAlias(scenario, id);
  return {
    persona: `${scenario.persona.display_name}. ${scenario.persona.identity}`,
    fields: publicFields(scenario)
      .map((field) => `${field.alias} (${field.path}): ${field.text}`)
      .join("\n"),
    items: scenario.items
      .map((item) =>
        [
          `${aliasOf(item.id)} [đường mở: ${item.path}; trọng số ${item.weight}`,
          item.prerequisite_id === undefined ? "" : `; cần mở trước ${aliasOf(item.prerequisite_id)}`,
          item.trust_threshold === undefined ? "" : `; cần độ cởi mở ≥ ${item.trust_threshold}`,
          `] chủ đề: ${item.topic_tag}\n  nội dung: ${item.content}\n  câu gợi mở: ${item.hook_line}\n  câu hỏi mẫu: ${item.sample_question}`,
        ].join(""),
      )
      .join("\n"),
    attacks: ATTACKS.map((attack) => `${attack.id}: ${attack.goal}`).join("\n"),
  };
}
