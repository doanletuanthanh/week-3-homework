import type { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { GENERATOR_ATTEMPT_TIMEOUT_MS, GENERATOR_FEEDBACK_LOOPS } from "@/config/limits";
import type { AttemptReport, AttemptStep, FailureCode } from "@/db/schema";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildOutputSafetyMessages, outputSafetySchema } from "@/llm/prompts/output-safety";
import {
  buildGeneratorMessages,
  generatedScenarioSchema,
  toScenarioFile,
  type GeneratorFeedback,
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
   * Called with the scenario as soon as it passed `validate`, before the safety check: the place
   * to store it, so a run that is cut off after this point does not pay for the scenario again.
   * When it throws, the run stops.
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
 * The violations of a try are given back to the generator, twice at most (addendum §2.8).
 */
async function generate(state: State, config: RunnableConfig) {
  if (state.scenario) return {};
  const { scope, meta, llmDeps, onStep, onDraft } = optionsOf(config);
  await onStep?.("generating");

  let feedback: GeneratorFeedback | undefined;
  for (let attempt = 0; ; attempt += 1) {
    // A whole scenario is the longest reply of the product: measured, one try can pass the usual 45 seconds.
    const reply = await callModel(
      "SCENARIO_GENERATOR",
      buildGeneratorMessages(state.input, feedback),
      { schema: generatedScenarioSchema, meta, scope },
      { attemptTimeoutMs: GENERATOR_ATTEMPT_TIMEOUT_MS, ...llmDeps },
    );
    const checked = validateScenario(toScenarioFile(reply.output));
    if (checked.scenario) {
      await onDraft?.(checked.scenario);
      return { scenario: checked.scenario };
    }
    const violations = checked.violations.map((violation) => `${violation.path}: ${violation.message}`);
    if (attempt === GENERATOR_FEEDBACK_LOOPS) return { failure: { code: "invalid" as const }, report: { ...state.report, violations } };
    feedback = { previous: reply.output, violations };
  }
}

/** The output safety check (addendum §2.9): a model that did not write the scenario reads every field of it. */
async function safety(state: State, config: RunnableConfig) {
  if (state.failure) return {};
  const { scope, meta, llmDeps, onStep } = optionsOf(config);
  await onStep?.("validating");
  const reply = await callModel("SAFETY", buildOutputSafetyMessages(state.scenario!, state.input.constraints), { schema: outputSafetySchema, meta, scope }, llmDeps);
  if (reply.output.violations.length === 0) return {};
  return { failure: { code: "unsafe_output" as const }, report: { ...state.report, unsafe: reply.output.violations } };
}

/** Compiled once per server instance. No checkpointer: what a later run needs is the draft stored on the attempt. */
const generationGraph = new StateGraph(GenerationState)
  .addNode("generate", generate)
  .addNode("safety", safety)
  .addEdge(START, "generate")
  .addEdge("generate", "safety")
  .addEdge("safety", END)
  .compile();

export type GenerationResult = ({ outcome: "passed"; scenario: Scenario } | { outcome: "failed"; code: Failure["code"] }) & { report: AttemptReport };

/**
 * One custom scenario from a moderated topic: generate, `validate`, output safety check. No
 * simulated interview is played: the scenario is "lightly checked" and labelled so (accepted
 * deviation from FR-54, 2026-10-09). The first check that fails ends the run with its code and no
 * later call is made. With `draft`, a scenario an earlier run stored, generation is skipped and
 * only the safety check runs. A model call that fails after its retries, or a run that is
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
