import type { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { resolveVerdict } from "@/engine/aliases";
import { applyVerdict } from "@/engine/apply-verdict";
import { assembleReveal, buildChecks, resolveClaims, resolveVerdicts } from "@/engine/reveal-claims";
import { commentSlots, resolveCanvasMatches, settle } from "@/engine/reveal-compute";
import {
  buildEndJudgeContext,
  buildFeedbackContext,
  buildVerifierContext,
  type EndJudgeContext,
  type FeedbackContext,
  type VerifierContext,
} from "@/engine/reveal-contexts";
import type { GeneratorPart, JudgePart, ReplaySelection, RevealBasis, RevealJson, RevealParts, VerifierPart } from "@/engine/reveal-types";
import { selectReplay } from "@/engine/select-replay";
import { callModel, LlmCallError, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildEndJudgeMessages } from "@/llm/prompts/end-judge";
import { buildFeedbackMessages } from "@/llm/prompts/feedback-generator";
import { buildVerifierMessages } from "@/llm/prompts/verifier";
import { endJudgeSchema, feedbackSchema, verifierSchema } from "@/llm/schemas";

/** The context of one reveal call, handed over just before the call is made. Tests read it. */
export type RevealContextInspector = (
  subject:
    | { call: "END_JUDGE"; context: EndJudgeContext }
    | { call: "FEEDBACK"; context: FeedbackContext }
    | { call: "VERIFIER"; context: VerifierContext },
) => void;

export type RevealRunOptions = {
  scope: CallScope;
  /** LangSmith metadata added to every call. */
  meta: Record<string, string | number>;
  signal?: AbortSignal;
  llmDeps?: Partial<CallModelDeps>;
  onContext?: RevealContextInspector;
  /**
   * Evaluation only: a call that failed after its retries throws instead of degrading the result,
   * so the caller can wait out a rate limit and run again with the parts it already has.
   */
  failOnLlmError?: boolean;
  /**
   * Called with the processed output of each call as soon as it exists, before the next call
   * starts: the place to store it. When it throws, the run stops there and makes no further call.
   */
  onPart?: (part: RevealParts) => Promise<void>;
};

const RevealState = new StateSchema({
  /** The frozen session as stored. */
  basis: z.custom<RevealBasis>(),
  /** Processed output of the calls already made, by an earlier run or by this one. */
  parts: z.custom<RevealParts>(),
  selection: z.custom<ReplaySelection>().optional(),
  reveal: z.custom<RevealJson>().optional(),
});

type State = typeof RevealState.State;
const optionsOf = (config: RunnableConfig) => config.configurable as RevealRunOptions;

/** A call that failed after its technical retries degrades the reveal; anything else is a defect and stops it. */
async function orFailed<T extends { ok: true }>(call: () => Promise<T>, config: RunnableConfig): Promise<T | { ok: false }> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof LlmCallError && !optionsOf(config).failOnLlmError) return { ok: false };
    throw error;
  }
}

/** Code only, before any call: the replay moment, from the ledger and the checked labels (PRD §9.2). */
function select(state: State) {
  const { basis } = state;
  return {
    selection: selectReplay({
      scenario: basis.scenario,
      ledger: basis.state.ledger,
      unlocked: basis.state.unlocked,
      turns: basis.turns.map((turn) => ({ index: turn.index, label: turn.analysis?.label ?? null, flagged: turn.flagged })),
    }),
  };
}

/** Call 1: the last turn's verdict and the notes. Code cuts every range and decides what a match is. */
async function judge(state: State, config: RunnableConfig) {
  if (state.parts.judge) return {};
  const { scope, meta, signal, llmDeps, onContext, onPart } = optionsOf(config);
  const { basis } = state;
  const context = buildEndJudgeContext(basis);
  onContext?.({ call: "END_JUDGE", context });

  const part: JudgePart = await orFailed(async () => {
    const reply = await callModel("END_JUDGE", buildEndJudgeMessages(context), { schema: endJudgeSchema, meta, scope, signal }, llmDeps);
    const { applied, state: after } = applyVerdict(basis.scenario, basis.state, resolveVerdict(basis.scenario, reply.output.last_turn_verdict));
    return { ok: true as const, verdict: applied, matches: resolveCanvasMatches(basis.scenario, after, basis.canvasTokens, reply.output.canvas_matches) };
  }, config);
  await onPart?.({ judge: part });
  return { parts: { ...state.parts, judge: part } };
}

/** Call 2: the words of the comments code triggered. Code resolves every reference and marks what is sealed. */
async function generate(state: State, config: RunnableConfig) {
  if (state.parts.generator) return {};
  const { scope, meta, signal, llmDeps, onContext, onPart } = optionsOf(config);
  const selection = state.selection!;
  const basis = settle(state.basis, state.parts.judge);
  const slots = commentSlots(basis, selection, state.parts.judge?.ok ? state.parts.judge.matches : []);
  const context = buildFeedbackContext(basis, selection, slots);
  onContext?.({ call: "FEEDBACK", context });

  const part: GeneratorPart = await orFailed(async () => {
    const reply = await callModel("FEEDBACK", buildFeedbackMessages(context), { schema: feedbackSchema, meta, scope, signal }, llmDeps);
    return { ok: true as const, claims: resolveClaims(reply.output.claims, { basis, slots, selection }) };
  }, config);
  await onPart?.({ generator: part });
  return { parts: { ...state.parts, generator: part } };
}

/** Call 3: checks what the other calls produced. It judges nothing it wrote. */
async function verify(state: State, config: RunnableConfig) {
  if (state.parts.verifier) return {};
  const { scope, meta, signal, llmDeps, onContext, onPart } = optionsOf(config);
  const basis = settle(state.basis, state.parts.judge);
  const claims = state.parts.generator?.ok ? state.parts.generator.claims : [];
  const checks = buildChecks(basis, claims);
  const context = buildVerifierContext(basis, checks, claims);
  onContext?.({ call: "VERIFIER", context });

  const part: VerifierPart = await orFailed(async () => {
    const reply = await callModel("VERIFIER", buildVerifierMessages(context), { schema: verifierSchema, meta, scope, signal }, llmDeps);
    return { ok: true as const, verdicts: resolveVerdicts(reply.output.claims, checks) };
  }, config);
  await onPart?.({ verifier: part });
  return { parts: { ...state.parts, verifier: part } };
}

/** Code only: applies the verifier's answers and builds the frozen result. */
function assemble(state: State) {
  return { reveal: assembleReveal(state.basis, state.selection!, state.parts) };
}

/** Compiled once per server instance. No checkpointer: the parts are stored on the session. */
const revealGraph = new StateGraph(RevealState)
  .addNode("select", select)
  .addNode("judge", judge)
  .addNode("generate", generate)
  .addNode("verify", verify)
  .addNode("assemble", assemble)
  .addEdge(START, "select")
  .addEdge("select", "judge")
  .addEdge("judge", "generate")
  .addEdge("generate", "verify")
  .addEdge("verify", "assemble")
  .addEdge("assemble", END)
  .compile();

export type RevealGraphResult = { selection: ReplaySelection; parts: RevealParts; reveal: RevealJson };

/**
 * The reveal of one ended session: the replay moment chosen by code, then exactly three logical
 * model calls in order (end judge, generator, verifier), each one's output resolved by code
 * before the next starts, then the frozen result. A call whose part is already in `parts` is not
 * made again. A call that fails after its retries leaves a failed part and the run goes on: the
 * result is then the degraded one. The learner's guess is not an input.
 */
export async function runRevealGraph(input: { basis: RevealBasis; parts?: RevealParts }, options: RevealRunOptions): Promise<RevealGraphResult> {
  const result = await revealGraph.invoke(
    { basis: input.basis, parts: input.parts ?? {} },
    { configurable: options, runName: "reveal", metadata: options.meta },
  );
  return { selection: result.selection!, parts: result.parts, reveal: result.reveal! };
}
