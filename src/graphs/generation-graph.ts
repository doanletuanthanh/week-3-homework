import type { BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { GENERATOR_ATTEMPT_TIMEOUT_MS, GENERATOR_FEEDBACK_LOOPS } from "@/config/limits";
import type { AttemptReport, AttemptStep, FailureCode } from "@/db/schema";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildOutputSafetyMessages, outputSafetySchema } from "@/llm/prompts/output-safety";
import { applyTagRepair, buildRouteCheckMessages, buildTagRepairMessages, confusableItems, routeCheckSchema, tagRepairSchema } from "@/llm/prompts/route-check";
import {
  applyRepair,
  buildGeneratorMessages,
  buildRepairMessages,
  formatViolation,
  generatedScenarioSchema,
  repairMode,
  repairSchema,
  toScenarioFile,
  type GeneratorInput,
} from "@/llm/prompts/scenario-generator";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";

export type GenerationRunOptions = {
  /** The generation attempt: every call is attributed to it. */
  scope: CallScope;
  /** LangSmith metadata added to every call. */
  meta: Record<string, string | number>;
  llmDeps?: Partial<CallModelDeps>;
  /** Called when a step starts, before its first call: the place to store progress. When it throws, the run stops. */
  onStep?: (step: AttemptStep) => Promise<void>;
  /**
   * Called with the scenario each time it passed `validate` (after generation, and again after a
   * repair of its tags), before the safety check: the place to store it, so a run that is cut off
   * after this point does not pay for the scenario again. When it throws, the run stops.
   */
  onDraft?: (scenario: Scenario) => Promise<void>;
};

type Failure = { code: Exclude<FailureCode, "system_error"> };

const GenerationState = new StateSchema({
  input: z.custom<GeneratorInput>(),
  /** A scenario an earlier run already generated and validated: generation is not repeated. */
  scenario: z.custom<Scenario>().optional(),
  failure: z.custom<Failure>().optional(),
  report: z.custom<AttemptReport>(),
});

type State = typeof GenerationState.State;
const optionsOf = (config: RunnableConfig) => config.configurable as GenerationRunOptions;

/**
 * Writes the scenario and checks it against `validate`, the same rules an authored file passes.
 * A failed check is repaired, twice at most (addendum §2.8): when a violation says the overall
 * shape is wrong the generator writes the whole scenario again from its violations, otherwise
 * only the violated items and fields are written again. Every repair is recorded.
 */
async function generate(state: State, config: RunnableConfig) {
  if (state.scenario) return {};
  const { scope, meta, llmDeps, onStep, onDraft } = optionsOf(config);
  await onStep?.("generating");
  const call = <T>(messages: BaseMessage[], schema: z.ZodType<T>) =>
    // A whole scenario is the longest reply of the product: measured, one try can pass the usual 45 seconds.
    callModel("SCENARIO_GENERATOR", messages, { schema, meta, scope }, { attemptTimeoutMs: GENERATOR_ATTEMPT_TIMEOUT_MS, ...llmDeps });

  const repairs: NonNullable<AttemptReport["repairs"]> = [];
  let current = (await call(buildGeneratorMessages(state.input), generatedScenarioSchema)).output;
  for (let attempt = 0; ; attempt += 1) {
    const checked = validateScenario(toScenarioFile(current));
    if (checked.scenario) {
      await onDraft?.(checked.scenario);
      return { scenario: checked.scenario, report: { ...state.report, ...(repairs.length > 0 ? { repairs } : {}) } };
    }
    const violations = checked.violations.map(formatViolation);
    if (attempt === GENERATOR_FEEDBACK_LOOPS) {
      return { failure: { code: "invalid" as const }, report: { ...state.report, violations, ...(repairs.length > 0 ? { repairs } : {}) } };
    }
    if (repairMode(checked.violations) === "full") {
      repairs.push({ mode: "full", violations });
      current = (await call(buildGeneratorMessages(state.input, { previous: current, violations }), generatedScenarioSchema)).output;
    } else {
      const reply = await call(buildRepairMessages(state.input, current, checked.violations), repairSchema);
      const repaired = applyRepair(current, checked.violations, reply.output);
      repairs.push({ mode: "targeted", violations, ...(repaired.ignored.length > 0 ? { ignored: repaired.ignored } : {}) });
      current = repaired.scenario;
    }
  }
}

/**
 * The routing check: every item's sample question must route to its own tag under Call 1's
 * rules, on Call 1's model. Items it cannot tell apart get one repair of their tag and sample
 * question, then the check runs once more. Items still confusable after that do not fail the
 * scenario: live routing abstains when it cannot tell topics apart, so they make the persona
 * harder, not wrong; the report names them for the operator. A repair that breaks `validate`
 * is dropped, and the scenario that passed before it is kept.
 */
async function routeCheck(state: State, config: RunnableConfig) {
  if (state.failure) return {};
  const { scope, meta, llmDeps, onStep, onDraft } = optionsOf(config);
  await onStep?.("validating");
  const check = async (scenario: Scenario) =>
    confusableItems(scenario.items.length, (await callModel("ANALYSIS", buildRouteCheckMessages(scenario), { schema: routeCheckSchema, meta, scope }, llmDeps)).output);

  const confusable = await check(state.scenario!);
  if (confusable.length === 0) return { report: { ...state.report, routeCheck: { confusable, repaired: false } } };

  const reply = await callModel("SCENARIO_GENERATOR", buildTagRepairMessages(state.input, state.scenario!, confusable), { schema: tagRepairSchema, meta, scope }, llmDeps);
  const repaired = applyTagRepair(state.scenario!, confusable, reply.output);
  const repair = {
    mode: "targeted" as const,
    violations: confusable.map((index) => `items[${index}].topic_tag: câu hỏi mẫu không định tuyến riêng được về nhãn này.`),
    ...(repaired.ignored.length > 0 ? { ignored: repaired.ignored } : {}),
  };
  const checked = validateScenario(repaired.scenario);
  if (!checked.scenario) {
    const dropped = { ...repair, dropped: checked.violations.map(formatViolation) };
    return { report: { ...state.report, repairs: [...(state.report.repairs ?? []), dropped], routeCheck: { confusable, repaired: true } } };
  }
  const repairs = [...(state.report.repairs ?? []), repair];
  await onDraft?.(checked.scenario);
  return { scenario: checked.scenario, report: { ...state.report, repairs, routeCheck: { confusable: await check(checked.scenario), repaired: true } } };
}

/** The output safety check (addendum §2.9): a model that did not write the scenario reads every field of it. */
async function safety(state: State, config: RunnableConfig) {
  if (state.failure) return {};
  const { scope, meta, llmDeps } = optionsOf(config);
  const reply = await callModel("SAFETY", buildOutputSafetyMessages(state.scenario!, state.input.constraints), { schema: outputSafetySchema, meta, scope }, llmDeps);
  if (reply.output.violations.length === 0) return {};
  return { failure: { code: "unsafe_output" as const }, report: { ...state.report, unsafe: reply.output.violations } };
}

/** Compiled once per server instance. No checkpointer: what a later run needs is the draft stored on the attempt. */
const generationGraph = new StateGraph(GenerationState)
  .addNode("generate", generate)
  .addNode("route_check", routeCheck)
  .addNode("safety", safety)
  .addEdge(START, "generate")
  .addEdge("generate", "route_check")
  .addEdge("route_check", "safety")
  .addEdge("safety", END)
  .compile();

export type GenerationResult = ({ outcome: "passed"; scenario: Scenario } | { outcome: "failed"; code: Failure["code"] }) & { report: AttemptReport };

/**
 * One custom scenario from a moderated topic: generate and `validate` with repairs, the routing
 * check, the output safety check. No simulated interview is played: the scenario is "lightly checked" and labelled so (accepted
 * deviation from FR-54, 2026-10-09). The first check that fails ends the run with its code and no
 * later call is made. With `draft`, a scenario an earlier run stored, generation is skipped and
 * the routing check and the safety check run on it. A model call that fails after its retries, or a run that is
 * cancelled, throws: that is not a verdict about the scenario. The input never holds the
 * learner's own words about what they want to practise, only the focus code made of them.
 */
export async function runGenerationGraph(input: GeneratorInput, options: GenerationRunOptions, draft?: Scenario | null): Promise<GenerationResult> {
  const result = await generationGraph.invoke(
    { input, report: {}, ...(draft ? { scenario: draft } : {}) },
    { configurable: options, runName: "generation", metadata: options.meta },
  );
  if (result.failure) return { outcome: "failed", code: result.failure.code, report: result.report };
  return { outcome: "passed", scenario: result.scenario!, report: result.report };
}
