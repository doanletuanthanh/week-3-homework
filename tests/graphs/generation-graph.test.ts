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

describe("runGenerationGraph: generate → validate → routing check → safety", () => {
  it("passes a scenario with three model calls and plays no simulated interview", async () => {
    const { result, models, steps, drafts } = await run();

    expect(result.outcome).toBe("passed");
    expect(steps).toEqual(["generating", "validating"]);
    if (result.outcome !== "passed") throw new Error("unreachable");
    // The stored content is what validate returned: ids by position, nothing the model chose.
    expect(result.scenario.items).toHaveLength(chiThu.items.length);
    expect(result.scenario.items[0].id).toBe("item-1");
    expect(result.report).toEqual({ routeCheck: { confusable: [], repaired: false } });

    // The routing check runs on Call 1's model, so it measures what live routing will do.
    expect(models.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR", "ANALYSIS", "SAFETY"]);
    // The draft is handed over once, before the safety check, and is the scenario that passes.
    expect(drafts).toEqual([result.scenario]);
  });

  it("attributes every call to the generation attempt, so their cost counts against the generation budget", async () => {
    const { models } = await run();
    expect(models.records.map((record) => `${record.role}:${record.scope}:${record.attemptId}`)).toEqual([
      `SCENARIO_GENERATOR:generation:${ATTEMPT_ID}`,
      `ANALYSIS:generation:${ATTEMPT_ID}`,
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

  it("does not generate again: the routing check runs again, then the safety check, on the stored scenario", async () => {
    const { result, models, steps, drafts } = await run({}, draft);

    expect(result).toMatchObject({ outcome: "passed", scenario: draft, report: { routeCheck: { confusable: [], repaired: false } } });
    expect(models.calls.map((call) => call.role)).toEqual(["ANALYSIS", "SAFETY"]);
    expect(models.prompts("ANALYSIS")[0]).toContain(draft.items[0].sample_question);
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

/** A reply whose second item has the first one's tag: a violation that points at one item. */
const duplicateTag = () => {
  const generated = generatedFrom();
  generated.items[1] = { ...generated.items[1], topic_tag: generated.items[0].topic_tag };
  return generated;
};
/** The repair of item 1 that puts its own tag back. */
const tagFix = () => ({ items: [{ ...generatedFrom().items[1], index: 1 }], fields: [] });

describe("runGenerationGraph: repairing a scenario that failed validate", () => {
  it("repairs a duplicate tag in one targeted call that rewrites only that item", async () => {
    const { result, models, drafts } = await run({ generated: [duplicateTag()], repairs: [tagFix()] });

    expect(result.outcome).toBe("passed");
    expect(models.count("SCENARIO_GENERATOR")).toBe(2);
    const repair = models.prompts("SCENARIO_GENERATOR")[1];
    expect(repair).toContain("<kich_ban>");
    expect(repair).toContain("items[1].topic_tag:");
    expect(result.report.repairs).toEqual([{ mode: "targeted", violations: [expect.stringContaining("items[1].topic_tag:")] }]);
    if (result.outcome !== "passed") throw new Error("unreachable");
    expect(result.scenario.items[1].topic_tag).toBe(chiThu.items[1].topic_tag);
    // Only the scenario that passed is stored.
    expect(drafts).toHaveLength(1);
  });

  it("asks for a reply far shorter than a whole scenario", () => {
    const whole = JSON.stringify(generatedFrom()).length;
    expect(JSON.stringify(tagFix()).length).toBeLessThanOrEqual(whole * 0.25);
  });

  it("keeps out what the repair was not asked for, and records it", async () => {
    const extra = { ...tagFix(), items: [...tagFix().items, { ...generatedFrom().items[4], content: "Chuyện khác hẳn.", index: 4 }], fields: [{ path: "opening_line", text: "Chào." }] };
    const { result } = await run({ generated: [duplicateTag()], repairs: [extra] });

    if (result.outcome !== "passed") throw new Error("unreachable");
    expect(result.scenario.items[4].content).toBe(chiThu.items[4].content);
    expect(result.scenario.opening_line).toBe(chiThu.opening_line);
    expect(result.report.repairs?.[0].ignored).toEqual(["items[4]", "opening_line"]);
  });

  it("writes the whole scenario again when the shape is wrong, and records it as full", async () => {
    const { result, models } = await run({ generated: [tooFewItems(), generatedFrom()] });
    expect(result.outcome).toBe("passed");
    expect(models.prompts("SCENARIO_GENERATOR")[1]).toContain("<ban_truoc>");
    expect(result.report.repairs).toEqual([{ mode: "full", violations: expect.arrayContaining([expect.stringContaining("Cần 8–12 item")]) }]);
  });

  it("holds the loop cap across both modes", async () => {
    // A full regeneration that comes back with a duplicate tag, then a repair that changes nothing.
    const { result, models } = await run({ generated: [tooFewItems(), duplicateTag()], repairs: [{ items: [], fields: [] }] });
    expect(result).toMatchObject({ outcome: "failed", code: "invalid" });
    expect(models.count("SCENARIO_GENERATOR")).toBe(3);
    expect(result.report.repairs?.map((repair) => repair.mode)).toEqual(["full", "targeted"]);
    expect(result.report.violations?.join("\n")).toContain("items[1].topic_tag:");
  });
});

describe("runGenerationGraph: the routing check", () => {
  /** Item 2's question routes to item 1's tag: both are confusable. */
  const swapped = (count: number) => Array.from({ length: count }, (_, index) => (index === 2 ? "T1" : `T${index + 1}`));
  const newTags = { items: [0, 2].map((index) => ({ index, topic_tag: `${chiThu.items[index].topic_tag} riêng`, sample_question: chiThu.items[index].sample_question })) };

  it("repairs the tags it cannot tell apart, checks again and passes", async () => {
    const { result, models, drafts } = await run({ routes: [...swapped(chiThu.items.length)], repairs: [newTags] });

    expect(result.outcome).toBe("passed");
    expect(models.calls.map((call) => call.role)).toEqual(["SCENARIO_GENERATOR", "ANALYSIS", "SCENARIO_GENERATOR", "ANALYSIS", "SAFETY"]);
    const repair = models.prompts("SCENARIO_GENERATOR")[1];
    expect(repair).toContain("<can_sua>");
    // The repair names the tags the new ones must stay apart from.
    expect(repair).toContain(chiThu.items[5].topic_tag);
    expect(result.report.routeCheck).toEqual({ confusable: [], repaired: true });
    expect(result.report.repairs).toEqual([{ mode: "targeted", violations: [expect.stringContaining("items[0].topic_tag"), expect.stringContaining("items[2].topic_tag")] }]);
    if (result.outcome !== "passed") throw new Error("unreachable");
    expect(result.scenario.items[0].topic_tag).toBe(`${chiThu.items[0].topic_tag} riêng`);
    // The repaired scenario is stored too, so a resumed run does not lose it.
    expect(drafts).toHaveLength(2);
    expect(drafts[1]).toEqual(result.scenario);
  });

  it("passes a scenario still confusable after its repair, and names the items for the operator", async () => {
    const { result } = await run({ routes: swapped, repairs: [newTags] });
    expect(result.outcome).toBe("passed");
    expect(result.report.routeCheck).toEqual({ confusable: [0, 2], repaired: true });
  });

  it("drops a tag repair that breaks validate and keeps the scenario that passed", async () => {
    const leaking = { items: [{ index: 0, topic_tag: `chuyện ${chiThu.items[0].secret_terms[0]}`, sample_question: "Chị kể em nghe nha?" }] };
    const { result, models, drafts } = await run({ routes: [...swapped(chiThu.items.length)], repairs: [leaking] });

    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") throw new Error("unreachable");
    expect(result.scenario.items[0].topic_tag).toBe(chiThu.items[0].topic_tag);
    expect(result.report.routeCheck).toEqual({ confusable: [0, 2], repaired: true });
    // The report says the repair was tried and why it was not kept.
    expect(result.report.repairs?.[0].dropped).toEqual([expect.stringContaining("items[0].topic_tag")]);
    // No second check of a repair that was not kept.
    expect(models.count("ANALYSIS")).toBe(1);
    expect(drafts).toHaveLength(1);
  });

  it("counts a question with no route as confusable", async () => {
    const { result } = await run({ routes: (count) => Array.from({ length: count }, (_, index) => (index === 3 ? null : `T${index + 1}`)) });
    expect(result.report.routeCheck).toEqual({ confusable: [3], repaired: true });
  });
});
