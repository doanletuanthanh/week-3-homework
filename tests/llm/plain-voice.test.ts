import { describe, expect, it } from "vitest";
import { VOICE_CAPS } from "@/llm/prompts/plain-voice";
import { curatedPersonas } from "../helpers/curated-scenarios";

const words = (text: string) => text.trim().split(/\s+/u).length;

describe("VOICE_CAPS: the generator's length caps come from the hand-written library", () => {
  it.each(curatedPersonas().map((persona) => [persona.file, persona.scenario] as const))("%s stays within every cap", (_, scenario) => {
    for (const fact of scenario.surface_facts) expect(words(fact), fact).toBeLessThanOrEqual(VOICE_CAPS.surfaceFact);
    for (const item of scenario.items) {
      expect(words(item.hook_line), item.hook_line).toBeLessThanOrEqual(VOICE_CAPS.hookLine);
      expect(words(item.sample_question), item.sample_question).toBeLessThanOrEqual(VOICE_CAPS.sampleQuestion);
    }
  });

  it("is no looser than the library needs, so a cap is never raised without a reason", () => {
    const scenarios = curatedPersonas().map((persona) => persona.scenario);
    const longest = (texts: string[]) => Math.max(...texts.map(words));
    expect(longest(scenarios.flatMap((scenario) => scenario.surface_facts))).toBe(VOICE_CAPS.surfaceFact);
    expect(longest(scenarios.flatMap((scenario) => scenario.items.map((item) => item.hook_line)))).toBe(VOICE_CAPS.hookLine);
    expect(longest(scenarios.flatMap((scenario) => scenario.items.map((item) => item.sample_question)))).toBe(VOICE_CAPS.sampleQuestion);
  });
});
