import type { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { resolveVerdict } from "@/engine/aliases";
import {
  buildAnalysisContext,
  buildJudgeContext,
  type AnalysisContext,
  type JudgeContext,
  type PersonaContext,
  type TranscriptLine,
} from "@/engine/contexts";
import { planTurn, type TurnPlan } from "@/engine/plan-turn";
import type { EngineState, RawAnalysis, Verdict } from "@/engine/types";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildPersonaMessages } from "@/llm/prompts/persona";
import { buildTurnJudgeMessages } from "@/llm/prompts/turn-judge";
import { analysisSchema, turnJudgeSchema } from "@/llm/schemas";
import type { Scenario } from "@/scenario/schema";

/**
 * The context of one call, with the state it was built from, handed over just before the call is
 * made. Evaluation uses it to check isolation on every call; throwing stops the turn.
 */
export type ContextInspector = (
  subject:
    | { call: "ANALYSIS"; context: AnalysisContext }
    | { call: "PERSONA"; context: PersonaContext }
    | { call: "REPLAY_JUDGE"; context: JudgeContext },
  state: EngineState,
) => void;

/** What a run needs besides the turn itself: where calls are billed, and the test seams. */
export type TurnRunOptions = {
  scope: CallScope;
  /** LangSmith metadata added to every call of the turn. */
  meta: Record<string, string | number>;
  /** Receives the persona reply as it is generated. Call 1 is never streamed. */
  onPersonaDelta?: (text: string) => void;
  signal?: AbortSignal;
  llmDeps?: Partial<CallModelDeps>;
  onContext?: ContextInspector;
  /** Replay only. */
  priorityItemId?: string;
};

const TurnState = new StateSchema({
  scenario: z.custom<Scenario>(),
  /** Snapshot t-1 as stored. */
  state: z.custom<EngineState>(),
  /** Turns 0 to t-1. */
  transcript: z.custom<TranscriptLine[]>(),
  question: z.string(),
  analysis: z.custom<RawAnalysis>().optional(),
  plan: z.custom<TurnPlan>().optional(),
  personaText: z.string().optional(),
});

const optionsOf = (config: RunnableConfig) => config.configurable as TurnRunOptions;

/** Call 1: analyses the new question and judges the previous persona turn. Sees no locked content. */
async function analyze(state: typeof TurnState.State, config: RunnableConfig) {
  const { scope, meta, signal, llmDeps, onContext } = optionsOf(config);
  const context = buildAnalysisContext(state.scenario, state.state, state.transcript, state.question);
  onContext?.({ call: "ANALYSIS", context }, state.state);
  const reply = await callModel("ANALYSIS", buildAnalysisMessages(context), { schema: analysisSchema, meta, scope, signal }, llmDeps);
  return { analysis: reply.output };
}

/** Code only: checks Call 1, applies the verdict, decides the unlock and the hook, builds Call 2's context. */
function decide(state: typeof TurnState.State, config: RunnableConfig) {
  return {
    plan: planTurn({
      scenario: state.scenario,
      state: state.state,
      analysis: state.analysis!,
      transcript: state.transcript,
      question: state.question,
      priorityItemId: optionsOf(config).priorityItemId,
    }),
  };
}

/** Call 2: the persona reply, from the context the plan built and nothing else. */
async function persona(state: typeof TurnState.State, config: RunnableConfig) {
  const { scope, meta, signal, llmDeps, onPersonaDelta, onContext } = optionsOf(config);
  const { personaContext, stateAfter } = state.plan!;
  onContext?.({ call: "PERSONA", context: personaContext }, stateAfter);
  const reply = await callModel(
    "PERSONA",
    buildPersonaMessages(personaContext),
    { meta, scope, signal, onDelta: onPersonaDelta },
    llmDeps,
  );
  return { personaText: reply.output };
}

/** Compiled once per server instance. No checkpointer: state lives in `turn` and `snapshot`. */
const turnGraph = new StateGraph(TurnState)
  .addNode("analyze", analyze)
  .addNode("decide", decide)
  .addNode("persona", persona)
  .addEdge(START, "analyze")
  .addEdge("analyze", "decide")
  .addEdge("decide", "persona")
  .addEdge("persona", END)
  .compile();

export type TurnGraphResult = { analysis: RawAnalysis; plan: TurnPlan; personaText: string };

/**
 * One main turn: exactly two logical model calls, in order, with the unlock decision between
 * them. Throws `LlmCallError` when either call fails after its technical retries.
 */
export async function runTurnGraph(
  input: { scenario: Scenario; state: EngineState; transcript: TranscriptLine[]; question: string },
  options: TurnRunOptions,
): Promise<TurnGraphResult> {
  // The signal is given to the model calls, not to the graph: a call that is cut off still
  // writes its `llm_call` row and fails as a model call.
  const result = await turnGraph.invoke(input, { configurable: options, runName: "turn", metadata: options.meta });
  return { analysis: result.analysis!, plan: result.plan!, personaText: result.personaText! };
}

/**
 * The turn judge (addendum §2.6): the verdict for a persona turn that no later Call 1 will
 * judge. `state` is the snapshot of that turn; the transcript runs up to and including it.
 * Returns the verdict with scenario ids; apply it with `applyVerdict`.
 */
export async function judgeTurn(
  input: { scenario: Scenario; state: EngineState; transcript: TranscriptLine[] },
  options: Pick<TurnRunOptions, "scope" | "meta" | "signal" | "llmDeps" | "onContext">,
): Promise<Verdict> {
  const context = buildJudgeContext(input.scenario, input.state, input.transcript);
  options.onContext?.({ call: "REPLAY_JUDGE", context }, input.state);
  const reply = await callModel(
    "REPLAY_JUDGE",
    buildTurnJudgeMessages(context),
    { schema: turnJudgeSchema, meta: options.meta, scope: options.scope, signal: options.signal },
    options.llmDeps,
  );
  return resolveVerdict(input.scenario, reply.output.prev_turn_verdict);
}
