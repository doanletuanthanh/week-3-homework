import { randomUUID } from "node:crypto";
import { judgeTurn, runTurnGraph } from "@/graphs/turn-graph";
import { LlmCallError, recordCallToDb, type CallModelDeps, type CallScope } from "@/llm/call-model";
import type { Scenario } from "@/scenario/schema";
import { inMemoryTurnStore, type InMemoryTurnStore } from "@/server/in-memory-turn-store";
import { findAttack } from "./attacks";
import { runBaselineTurn } from "./baseline";
import { nextQuestion } from "./interviewer";
import { assertIsolated } from "./isolation";
import { judgeLeaks, type JudgedTurn } from "./leak-judge";
import type { EpisodeResult, EpisodeSpec, EpisodeTurn } from "./types";

export type EpisodeOptions = {
  /** The evaluation run the episode belongs to; its calls are attributed to it in `llm_call`. */
  runId: string;
  llmDeps?: Partial<CallModelDeps>;
  /** Waits before a step is tried again after a rate limit. Tests pass none. */
  rateLimitDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

/** The provider kept refusing for load after every wait: the run stops and can be resumed later. */
export class RateLimitError extends Error {
  constructor(cause: unknown) {
    super("the provider kept answering 429 (rate limit) after every wait", { cause });
    this.name = "RateLimitError";
  }
}

const DEFAULT_RATE_LIMIT_DELAYS_MS = [5_000, 20_000, 60_000];

function isRateLimit(error: unknown): boolean {
  if (!(error instanceof LlmCallError)) return false;
  const cause = error.cause as { status?: unknown; message?: unknown } | undefined;
  return cause?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|rate limit/iu.test(String(cause?.message ?? ""));
}

/**
 * Runs one step of an episode again, after a growing wait, while the provider answers with a
 * rate limit. A step writes nothing until it succeeds, so repeating it is safe.
 */
async function withRateLimitBackoff<T>(step: () => Promise<T>, options: EpisodeOptions): Promise<T> {
  const delays = options.rateLimitDelaysMs ?? DEFAULT_RATE_LIMIT_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await step();
    } catch (error) {
      if (!isRateLimit(error)) throw error;
      if (attempt >= delays.length) throw new RateLimitError(error);
      await sleep(delays[attempt]);
    }
  }
}

/** What each persona turn of an engine episode was allowed to say, for the leak judge. */
function judgedTurns(scenario: Scenario, store: InMemoryTurnStore): JudgedTurn[] {
  const { state } = store;
  const hookLine = (itemId: string) => scenario.items.find((item) => item.id === itemId)!.hook_line;
  return store.turns.map(({ plan, question, personaText }) => {
    const said = state.ledger.filter((entry) => entry.droppedAt < plan.turnIndex).map((entry) => entry.itemId);
    const allowed = [...new Set([...said, ...(plan.hookToDrop ? [plan.hookToDrop] : [])])];
    return {
      index: plan.turnIndex,
      question,
      personaText,
      openItemIds: state.unlocked.filter((entry) => entry.turn <= plan.turnIndex).map((entry) => entry.itemId),
      allowedHooks: allowed.map(hookLine),
    };
  });
}

/**
 * One simulated interview on the in-memory store, through the same turn graph a learner's session
 * uses: the simulated learner asks, the engine answers, up to the episode's turn count. The last
 * persona turn gets its verdict from the turn judge, then the leak judge reads the whole episode.
 * The context of every in-session call is checked for isolation before the call is made; a
 * violation fails the episode and the run.
 */
export async function runEpisode(scenario: Scenario, spec: EpisodeSpec, options: EpisodeOptions): Promise<EpisodeResult> {
  let costUsd = 0;
  const recordCall = options.llmDeps?.recordCall ?? recordCallToDb;
  const llmDeps: Partial<CallModelDeps> = {
    ...options.llmDeps,
    recordCall: async (record) => {
      costUsd += record.costUsd;
      await recordCall(record);
    },
  };
  const scope: CallScope = { scope: "eval", attemptId: options.runId };
  const meta = { eval_run_id: options.runId, episode: spec.key };
  const call = { scope, meta, llmDeps };
  const attack = spec.attackId ? findAttack(spec.attackId) : undefined;

  if (spec.kind === "baseline") {
    const transcript = [{ index: 0, learnerText: null as string | null, personaText: scenario.opening_line }];
    for (let turnIndex = 1; turnIndex <= spec.turns; turnIndex += 1) {
      await withRateLimitBackoff(async () => {
        const question = await nextQuestion("adversarial", { scenario, transcript, turnIndex, attack }, call);
        const personaText = await runBaselineTurn(scenario, transcript, question, { ...call, meta: { ...meta, turn_index: turnIndex } });
        transcript.push({ index: turnIndex, learnerText: question, personaText });
      }, options);
    }
    const turns = transcript.slice(1).map((turn) => ({
      index: turn.index,
      question: turn.learnerText!,
      personaText: turn.personaText,
      // The baseline has no gate: nothing ever opens, and no hook is ever handed to it.
      openItemIds: [],
      allowedHooks: [],
    }));
    const { flags, contradictions } = await withRateLimitBackoff(() => judgeLeaks(scenario, turns, call), options);
    return {
      key: spec.key,
      kind: spec.kind,
      attackId: spec.attackId,
      turns: turns.map((turn) => ({
        index: turn.index,
        question: turn.question,
        personaText: turn.personaText,
        label: null,
        questionType: null,
        unlockedItemId: null,
        hookSelected: null,
        hookDropped: null,
      })),
      openedItemIds: [],
      flags,
      contradictions,
      costUsd,
    };
  }

  const store = inMemoryTurnStore(scenario);
  const onContext: Parameters<typeof runTurnGraph>[1]["onContext"] = (subject, state) => assertIsolated(scenario, state, subject);

  for (let turnIndex = 1; turnIndex <= spec.turns; turnIndex += 1) {
    await withRateLimitBackoff(async () => {
      const startedAt = Date.now();
      const basis = await store.loadState();
      const question = await nextQuestion(spec.kind as "good" | "bad" | "adversarial", { scenario, transcript: basis.transcript, turnIndex, attack }, call);
      const result = await runTurnGraph({ ...basis, question }, { scope: { ...scope, turnIndex }, meta: { ...meta, turn_index: turnIndex }, llmDeps, onContext });
      await store.commitTurn({ turnKey: randomUUID(), question, ...result, latencyMs: Date.now() - startedAt });
    }, options);
  }

  if (store.turns.length > 0) {
    // No later Call 1 will judge the last persona turn: the turn judge does, as it will in replay.
    const verdict = await withRateLimitBackoff(
      () =>
        judgeTurn(
          { scenario, state: store.state, transcript: store.transcript },
          { scope: { ...scope, turnIndex: store.state.turnIndex }, meta: { ...meta, turn_index: store.state.turnIndex }, llmDeps, onContext },
        ),
      options,
    );
    store.applyFinalVerdict(verdict);
  }

  const { flags, contradictions } = await withRateLimitBackoff(() => judgeLeaks(scenario, judgedTurns(scenario, store), call), options);
  const turns: EpisodeTurn[] = store.turns.map(({ plan, question, personaText }) => ({
    index: plan.turnIndex,
    question,
    personaText,
    label: plan.analysis.label,
    questionType: plan.analysis.question_type,
    unlockedItemId: plan.unlockedItemId,
    hookSelected: plan.hookToDrop,
    hookDropped: plan.hookToDrop === null ? null : (store.verdicts.get(plan.turnIndex)?.hook_dropped ?? false),
  }));

  return {
    key: spec.key,
    kind: spec.kind,
    attackId: spec.attackId,
    turns,
    openedItemIds: store.state.unlocked.map((entry) => entry.itemId),
    flags,
    contradictions,
    costUsd,
  };
}
