import { describe, expect, it } from "vitest";
import { runGenerationGraph } from "@/graphs/generation-graph";
import { LlmCallError } from "@/llm/call-model";
import { toScenarioFile } from "@/llm/prompts/scenario-generator";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { generatedFrom, pipelineModels, type PipelineScript } from "../helpers/custom-fixtures";
import { chiThu } from "../helpers/engine-fixtures";

const ATTEMPT_ID = "44444444-4444-4444-8444-444444444444";
const INPUT = { topicText: "app hẹn hò trong khu dân cư đang sống", focus: "follow_up" as const, constraints: [] };
const scope = { scope: "generation" as const, attemptId: ATTEMPT_ID };

async function run(script: PipelineScript = {}, draft?: Scenario) {
  const models = pipelineModels(script);
  const steps: string[] = [];
  const drafts: Scenario[] = [];
  const result = await runGenerationGraph(
    INPUT,
    { scope, meta: { attempt_id: ATTEMPT_ID }, llmDeps: models.llmDeps, onStep: async (step) => void steps.push(step), onDraft: async (scenario) => void drafts.push(scenario) },
    draft,
  );
  return { result, models, steps, drafts };
}

/** A reply `validate` refuses: too few items. */
const tooFewItems = () => ({ ...generatedFrom(), items: generatedFrom().items.slice(0, 3) });

describe("runGenerationGraph: generate → validate → safety", () => {
  it("passes a scenario with two model calls and plays no simulated interview", async () => {
    const { result, models, steps, drafts } = await run();

    expect(result.outcome).toBe("passed");
    expect(steps).toEqual(["generating", "validating"]);
    if (result.outcome !== "passed") throw new Error("unreachable");
    // The stored content is what validate returned: ids by position, nothing the model chose.
    expect(result.scenario.items).toHaveLength(chiThu.items.length);
    expect(result.scenario.items[0].id).toBe("item-1");
    expect(result.report).toEqual({});

    expect(models.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR", "SAFETY"]);
    // The draft is handed over once, before the safety check, and is the scenario that passes.
    expect(drafts).toEqual([result.scenario]);
  });

  it("attributes both calls to the generation attempt, so their cost counts against the generation budget", async () => {
    const { models } = await run();
    expect(models.records.map((record) => `${record.role}:${record.scope}:${record.attemptId}`)).toEqual([
      `SCENARIO_GENERATOR:generation:${ATTEMPT_ID}`,
      `SAFETY:generation:${ATTEMPT_ID}`,
    ]);
  });

  it("gives the violations back to the generator and takes the second try when it is clean", async () => {
    const { result, models, drafts } = await run({ generated: [tooFewItems(), generatedFrom()] });

    expect(result.outcome).toBe("passed");
    expect(models.count("SCENARIO_GENERATOR")).toBe(2);
    const [first, second] = models.prompts("SCENARIO_GENERATOR");
    expect(first).not.toContain("<ban_truoc>");
    expect(second).toContain("<ban_truoc>");
    expect(second).toContain("Cần 8–12 item, đang có 3.");
    // A try that failed validate is never stored.
    expect(drafts).toHaveLength(1);
  });

  it("fails as `invalid` after the first try and two retries, and makes no later call", async () => {
    const { result, models, steps, drafts } = await run({ generated: [tooFewItems()] });

    expect(result).toMatchObject({ outcome: "failed", code: "invalid" });
    expect(result.report.violations?.join("\n")).toContain("Cần 8–12 item");
    expect(models.count("SCENARIO_GENERATOR")).toBe(3);
    expect(models.count("SAFETY")).toBe(0);
    expect(steps).toEqual(["generating"]);
    expect(drafts).toEqual([]);
  });

  it("stops a generated persona that asserts something about a real organisation", async () => {
    const claim = { ...generatedFrom() };
    claim.surface_facts = ["Chị làm kế toán ở Vinamilk, công ty này hay nợ lương nhân viên.", ...claim.surface_facts.slice(1)];
    const { result, models, steps } = await run({
      generated: [claim],
      override: {
        // The check reads the field it is given: it objects because the claim is there.
        SAFETY: (prompt) => ({
          structured: {
            violations: prompt.includes("Vinamilk") ? [{ field: "surface_facts[0]", kind: "real_org_or_brand", reason: "Khẳng định về một công ty có thật." }] : [],
          },
        }),
      },
    });

    expect(result).toMatchObject({ outcome: "failed", code: "unsafe_output" });
    expect(result.report.unsafe).toEqual([{ field: "surface_facts[0]", kind: "real_org_or_brand", reason: "Khẳng định về một công ty có thật." }]);
    expect(models.count("SAFETY")).toBe(1);
    expect(steps).toEqual(["generating", "validating"]);
  });

  it("passes the moderation constraints on to the generator and to the safety check", async () => {
    const models = pipelineModels();
    await runGenerationGraph({ ...INPUT, constraints: ["adult_persona_only"] }, { scope, meta: {}, llmDeps: models.llmDeps });
    expect(models.prompts("SAFETY")[0]).toContain("Nhân vật phải là người lớn");
    expect(models.prompts("SCENARIO_GENERATOR")[0]).toContain("nhân vật phải là người lớn");
  });

  it("throws when a model call fails after its retries: not a verdict about the scenario", async () => {
    const models = pipelineModels({ override: { SAFETY: () => ({ error: new Error("provider down") }) } });
    await expect(runGenerationGraph(INPUT, { scope, meta: {}, llmDeps: models.llmDeps })).rejects.toBeInstanceOf(LlmCallError);
    expect(models.count("SAFETY")).toBe(3);
  });

  it("stops and makes no call of the next step when storing the step or the draft fails", async () => {
    const lost = new Error("attempt no longer ours");
    const atStep = pipelineModels();
    await expect(
      runGenerationGraph(INPUT, {
        scope,
        meta: {},
        llmDeps: atStep.llmDeps,
        onStep: async (step) => {
          if (step === "validating") throw lost;
        },
      }),
    ).rejects.toBe(lost);
    expect(atStep.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR"]);

    const atDraft = pipelineModels();
    await expect(
      runGenerationGraph(INPUT, {
        scope,
        meta: {},
        llmDeps: atDraft.llmDeps,
        onDraft: async () => {
          throw lost;
        },
      }),
    ).rejects.toBe(lost);
    expect(atDraft.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR"]);
  });
});

describe("runGenerationGraph with a stored draft: a later run goes on from it", () => {
  const draft = validateScenario(toScenarioFile(generatedFrom())).scenario!;

  it("does not generate again: only the safety check is called, on the stored scenario", async () => {
    const { result, models, steps, drafts } = await run({}, draft);

    expect(result).toMatchObject({ outcome: "passed", scenario: draft });
    expect(models.calls.map((call) => call.role)).toEqual(["SAFETY"]);
    expect(models.prompts("SAFETY")[0]).toContain(draft.items[0].content);
    expect(steps).toEqual(["validating"]);
    // Nothing new to store.
    expect(drafts).toEqual([]);
  });

  it("can still be turned down by the safety check", async () => {
    const { result, models } = await run({ safety: { violations: [{ field: "opening_line", kind: "policy", reason: "r" }] } }, draft);
    expect(result).toMatchObject({ outcome: "failed", code: "unsafe_output" });
    expect(models.count("SCENARIO_GENERATOR")).toBe(0);
  });
});
