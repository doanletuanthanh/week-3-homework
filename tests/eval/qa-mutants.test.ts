import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { LEAK_FIXTURES } from "@/eval/qa/mutant-fixtures";
import { OPERATORS, OPERATOR_KEYS, mutantsOf } from "@/eval/qa/mutants";
import { THRESHOLDS } from "@/eval/qa/thresholds";
import { Budget, runQaAgent } from "@/graphs/qa-agent-graph";
import { PERSONA_GUARD_RULES } from "@/llm/prompts/persona";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { roleModels } from "../helpers/eval-models";

/** Every curated persona on disk. */
const CURATED: Scenario[] = readdirSync("scenarios", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((topic) =>
    readdirSync(join("scenarios", topic.name))
      .filter((name) => name.endsWith(".json") && name !== "topic.json")
      .map((name) => validateScenario(JSON.parse(readFileSync(join("scenarios", topic.name, name), "utf8"))).scenario!),
  );

/** The distinct rules a scenario breaks: a cycle is reported once per item in it. */
const codes = (scenario: Scenario) => [...new Set(validateScenario(scenario).violations.map((violation) => violation.code))];

describe("mutation operators", () => {
  it("each declares a threshold row that exists", () => {
    const rows = new Set(THRESHOLDS.map((row) => row.key));
    for (const key of OPERATOR_KEYS) expect(rows).toContain(OPERATORS[key].trips);
  });

  it("leak fixtures name an item of a curated persona", () => {
    for (const [personaId, fixture] of Object.entries(LEAK_FIXTURES)) {
      const scenario = CURATED.find((entry) => entry.persona_id === personaId);
      expect(scenario?.items.map((item) => item.id)).toContain(fixture.itemId);
    }
  });

  it.each(CURATED.map((scenario) => [scenario.persona_id, scenario] as const))("%s: model mutants still pass validate, structural ones trip exactly their rule", (_, scenario) => {
    expect(codes(scenario)).toEqual([]);
    for (const mutant of mutantsOf(scenario)) {
      const operator = OPERATORS[mutant.operator];
      // A leak caught by the secret-term rule would be caught for the wrong reason.
      expect(codes(mutant.scenario), mutant.operator).toEqual(operator.family === "structural" ? [operator.violation] : []);
    }
    // Mutants never change the curated persona they were built from.
    expect(codes(scenario)).toEqual([]);
  });

  it("applies model-judged leak operators only to personas with a fixture, structural ones to all", () => {
    for (const scenario of CURATED) {
      const operators = mutantsOf(scenario).map((mutant) => mutant.operator);
      expect(operators).toEqual(expect.arrayContaining(["weak-sample", "orphan-item", "trust-unreachable"]));
      expect(operators.includes("leak-in-identity")).toBe(scenario.persona_id in LEAK_FIXTURES);
    }
    expect(Object.keys(LEAK_FIXTURES)).toHaveLength(3);
  });

  it("prompt-weakened drops the guard rules from Call 2 only and keeps everything else", () => {
    const scenario = CURATED.find((entry) => entry.persona_id in LEAK_FIXTURES)!;
    const { rewriteMessages } = mutantsOf(scenario, ["prompt-weakened"])[0];
    const system = `Luật trả lời:\n- đầu\n${PERSONA_GUARD_RULES.join("\n")}\n- cuối`;
    const messages = [new SystemMessage(system), new HumanMessage("câu hỏi")];

    const weakened = rewriteMessages!("PERSONA", messages);
    expect(weakened[0].text).toBe("Luật trả lời:\n- đầu\n- cuối");
    expect(weakened[1]).toBe(messages[1]);
    expect(rewriteMessages!("ANALYSIS", messages)).toBe(messages);
    // A prompt that no longer has the rules would make the mutant a silent copy of the clean persona.
    expect(() => rewriteMessages!("PERSONA", [new SystemMessage("khác")])).toThrow(/guard rule/u);
  });

  it("a structural mutant is reported failing validate with no model call", async () => {
    const scenario = CURATED[0];
    for (const mutant of mutantsOf(scenario, ["orphan-item", "trust-unreachable"])) {
      const models = roleModels({});
      const report = await runQaAgent(mutant.scenario, { runId: "55555555-5555-4555-8555-555555555555", version: 1, budget: new Budget(0.1), llmDeps: models.llmDeps, concurrency: 1 });
      // validate fails on its own violations; the rows it kept from running are not met either.
      expect(report.thresholds.every((threshold) => !threshold.met)).toBe(true);
      expect(report.thresholds.filter((threshold) => threshold.key !== "validate").map((threshold) => threshold.detail)).toEqual(
        Array(report.thresholds.length - 1).fill("chưa chạy: kịch bản không qua validate"),
      );
      expect(OPERATORS[mutant.operator].confirms(report, mutant)).toBe(true);
      expect(report.cost).toEqual({ capUsd: 0.1, actualUsd: 0, calls: 0 });
      expect(models.records).toEqual([]);
    }
  });
});
