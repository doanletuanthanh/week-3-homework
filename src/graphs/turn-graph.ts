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
import { isValidRange } from "@/engine/tokens";
import type { EngineState, Label, RawAnalysis, Verdict } from "@/engine/types";
import { callModel, LlmCallError, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildPersonaMessages } from "@/llm/prompts/persona";
import { buildTurnJudgeMessages } from "@/llm/prompts/turn-judge";
import { analysisSchema, replayJudgeSchema, turnJudgeSchema } from "@/llm/schemas";
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
  /**
   * Replay only: a judge runs right after the reply and is the one source of the verdict about
   * it; the verdict in Call 1's output is not read. `labelQuestion` also asks the judge for its
   * own label of the learner's question (the replay of a leading question).
   */
  judge?: { labelQuestion: boolean };
  /** Called when the reply is complete and the judge starts. */
  onJudging?: () => void;
};

/**
 * What the replay judge said about one turn. The verdict carries scenario ids and is not applied
 * yet. `ok: false` is a judge that failed after its retries: the turn stands, with no verdict.
 */
export type TurnJudgement = { ok: true; verdict: Verdict; label: Label | null } | { ok: false };

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
  judgement: z.custom<TurnJudgement>().optional(),
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
  const { priorityItemId, judge } = optionsOf(config);
  return {
    plan: planTurn({
      scenario: state.scenario,
      state: state.state,
      analysis: state.analysis!,
      transcript: state.transcript,
      question: state.question,
      priorityItemId,
      ignoreVerdict: judge !== undefined,
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

/**
 * Replay only, the third call of the turn: the judge reads the reply that was just written. A
 * judge that fails after its retries does not fail the turn.
 */
async function judge(state: typeof TurnState.State, config: RunnableConfig) {
  const options = optionsOf(config);
  const { stateAfter } = state.plan!;
  options.onJudging?.();
  try {
    const judgement: TurnJudgement = await judgeReplayTurn(
      {
        scenario: state.scenario,
        state: stateAfter,
        transcript: [...state.transcript, { index: stateAfter.turnIndex, learnerText: state.question, personaText: state.personaText! }],
        labelQuestion: options.judge!.labelQuestion,
      },
      options,
    );
    return { judgement };
  } catch (error) {
    if (!(error instanceof LlmCallError)) throw error;
    const failed: TurnJudgement = { ok: false };
    return { judgement: failed };
  }
}

/** Compiled once per server instance. No checkpointer: state lives in `turn` and `snapshot`. */
const turnGraph = new StateGraph(TurnState)
  .addNode("analyze", analyze)
  .addNode("decide", decide)
  .addNode("persona", persona)
  .addNode("judge", judge)
  .addEdge(START, "analyze")
  .addEdge("analyze", "decide")
  .addEdge("decide", "persona")
  .addConditionalEdges("persona", (_state, config) => (optionsOf(config).judge ? "judge" : END), ["judge", END])
  .addEdge("judge", END)
  .compile();

export type TurnGraphResult = {
  analysis: RawAnalysis;
  plan: TurnPlan;
  personaText: string;
  /** Set on a replay turn only. */
  judgement?: TurnJudgement;
};

/**
 * One turn. A main turn is exactly two logical model calls, in order, with the unlock decision
 * between them; a replay turn (`options.judge`) adds the judge as a third. Throws `LlmCallError`
 * when Call 1 or Call 2 fails after its technical retries.
 */
export async function runTurnGraph(
  input: { scenario: Scenario; state: EngineState; transcript: TranscriptLine[]; question: string },
  options: TurnRunOptions,
): Promise<TurnGraphResult> {
  // The signal is given to the model calls, not to the graph: a call that is cut off still
  // writes its `llm_call` row and fails as a model call.
  const result = await turnGraph.invoke(input, { configurable: options, runName: "turn", metadata: options.meta });
  return { analysis: result.analysis!, plan: result.plan!, personaText: result.personaText!, judgement: result.judgement };
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

/**
 * The judge of one replay turn, called right after the reply. With `labelQuestion` it also labels
 * the learner's question; a `leading` label that does not point at words of the question becomes
 * `open`, as it does for Call 1.
 */
export async function judgeReplayTurn(
  input: { scenario: Scenario; state: EngineState; transcript: TranscriptLine[]; labelQuestion: boolean },
  options: Pick<TurnRunOptions, "scope" | "meta" | "signal" | "llmDeps" | "onContext">,
): Promise<Extract<TurnJudgement, { ok: true }>> {
  if (!input.labelQuestion) return { ok: true, verdict: await judgeTurn(input, options), label: null };

  const context = buildJudgeContext(input.scenario, input.state, input.transcript, { labelQuestion: true });
  options.onContext?.({ call: "REPLAY_JUDGE", context }, input.state);
  const { output } = await callModel(
    "REPLAY_JUDGE",
    buildTurnJudgeMessages(context),
    { schema: replayJudgeSchema, meta: options.meta, scope: options.scope, signal: options.signal },
    options.llmDeps,
  );
  const spanFits = isValidRange(output.introduced_span, context.question?.tokens.length ?? 0);
  return {
    ok: true,
    verdict: resolveVerdict(input.scenario, output.prev_turn_verdict),
    label: output.label === "leading" && !spanFits ? "open" : output.label,
  };
}
