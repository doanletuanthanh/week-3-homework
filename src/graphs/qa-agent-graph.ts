import { createHash } from "node:crypto";
import type { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { roleSpecFromEnv } from "@/config/env";
import type { ToolCache } from "@/db/repo/eval-tool-cache";
import { assertIsolated } from "@/eval/isolation";
import { mapPooled } from "@/eval/pool";
import { FLOOR_ATTACKS, floorActions } from "@/eval/qa/floor";
import { judgeReplies } from "@/eval/qa/reply-judge";
import { itemAlias, itemIdOf, publicFields } from "@/eval/qa/scenario-view";
import { evaluateThresholds, leaksOf, warningsOf, type JudgedObservation } from "@/eval/qa/thresholds";
import { CALLS_OF, probePromptFingerprint, runTool, type ToolContext } from "@/eval/qa/tools";
import { actionKey, type Action, type CachedToolResult, type Finding, type QaReport } from "@/eval/qa/types";
import { withRateLimitBackoff } from "@/eval/rate-limit";
import { callModel, recordCallToDb, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildReplyJudgeMessages } from "@/llm/prompts/eval-reply-judge";
import { buildQaPlanMessages, buildQaReflectMessages, QA_LIMITS, qaPlanSchema, qaReflectSchema } from "@/llm/prompts/qa-agent";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";

/** Reflect rounds after the first results: each may add probes, then the run reports. */
export const MAX_REFLECT_ROUNDS = 2;
/** Roles whose calls are the probes: Call 1 or Call 2 of a seeded turn. */
const PROBE_ROLES = new Set(["ANALYSIS", "PERSONA"]);
/**
 * Price of one call of each kind, assumed until the run has measured its own: a probe's prompt is
 * a seeded turn; an agent call (planner, reflector, judge) reads the whole scenario.
 */
const ASSUMED_USD = { probe: 0.003, agent: 0.01 } as const;
type CallKind = keyof typeof ASSUMED_USD;

/** Thrown when the hard stop at the cap cut off a call: the run spent its budget. */
export class BudgetExceededError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number) {
    super(`lean eval reached its cap: ${spentUsd.toFixed(4)} of ${capUsd.toFixed(2)} USD`);
    this.name = "BudgetExceededError";
  }
}

/**
 * What the run has spent against its cap. Every action asks before it starts whether its calls
 * fit; the floor does not ask, the agent's additions do. A hard stop at the cap stays behind
 * this as a safety net.
 */
export class Budget {
  spentUsd = 0;
  calls = 0;
  private measured: Record<CallKind, { usd: number; calls: number }> = { probe: { usd: 0, calls: 0 }, agent: { usd: 0, calls: 0 } };
  constructor(readonly capUsd: number) {}
  record(usd: number, role: string): void {
    this.spentUsd += usd;
    this.calls += 1;
    const kind = this.measured[PROBE_ROLES.has(role) ? "probe" : "agent"];
    kind.usd += usd;
    kind.calls += 1;
  }
  /** What one more call of a kind is expected to cost: this run's own average once it has made one. */
  price(kind: CallKind): number {
    const { usd, calls } = this.measured[kind];
    return calls === 0 ? ASSUMED_USD[kind] : usd / calls;
  }
  get perCallUsd(): number {
    return this.price("probe");
  }
  get leftUsd(): number {
    return Math.max(0, this.capUsd - this.spentUsd);
  }
  /** Whether these calls fit and still leave the final judge call its share. */
  canAfford(calls: { probes?: number; agent?: number }): boolean {
    const cost = (calls.probes ?? 0) * this.price("probe") + ((calls.agent ?? 0) + 1) * this.price("agent");
    return cost <= this.leftUsd;
  }
}

export type QaRunOptions = {
  runId: string;
  version: number;
  budget: Budget;
  llmDeps?: Partial<CallModelDeps>;
  /** Actions running at the same time. With the batch transport, about how many calls one batch job carries. */
  concurrency: number;
  /** Probe results kept between runs; none means every probe is paid for. */
  toolCache?: ToolCache;
  /** Pay for every probe again and write the new results over the kept ones. */
  refreshCache?: boolean;
  /** Set by `runQaAgent`: what a cache key depends on besides the probe itself. */
  cacheSalt?: string;
  rateLimitDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

const QaState = new StateSchema({
  scenario: z.custom<Scenario>(),
  pending: z.custom<Action[]>(),
  /** Keys of every action already run or queued: an action is never paid for twice. */
  seen: z.custom<string[]>(),
  observations: z.custom<JudgedObservation[]>(),
  publicLeaks: z.custom<QaReport["publicLeaks"]>(),
  risks: z.custom<QaReport["risks"]>(),
  findings: z.custom<Finding[]>(),
  rounds: z.custom<QaReport["rounds"]>(),
  skipped: z.custom<number>(),
  decision: z.custom<QaReport["rounds"][number]["decision"]>().optional(),
  report: z.custom<QaReport>().optional(),
});
type State = typeof QaState.State;

const optionsOf = (config: RunnableConfig) => config.configurable as QaRunOptions;
const scopeOf = (options: QaRunOptions): CallScope => ({ scope: "eval", attemptId: options.runId });
const metaOf = (options: QaRunOptions) => ({ eval_run_id: options.runId, profile: "lean" });

/**
 * Bump when a probe's result would mean something else for the same inputs: a tool, the seeding
 * or the engine's decision code changed. The scenario, the probe models and the probe prompts as
 * they render are in the salt already.
 */
const TOOL_CACHE_VERSION = 1;

/** Where the result of one run of a probe is kept, for the given salt. */
const probeCacheKey = (salt: string, action: Action, attempt: 0 | 1) => createHash("sha256").update(JSON.stringify([salt, actionKey(action), attempt])).digest("hex");

/** One probe run, from the cache when the same probe already ran on the same content and models. */
async function runCached(action: Action, attempt: 0 | 1, context: ToolContext, options: QaRunOptions) {
  const key = actionKey(action);
  const cacheKey = probeCacheKey(options.cacheSalt ?? "", action, attempt);
  const cached = options.toolCache && !options.refreshCache ? ((await options.toolCache.get(cacheKey)) as CachedToolResult | null) : null;
  if (cached) return { ...cached, replies: cached.replies.map((reply) => ({ ...reply, id: context.nextReplyId(), action: key })) };
  const result = await withRateLimitBackoff(() => runTool(action, context, key), { ...options });
  const stored: CachedToolResult = {
    ...result,
    replies: result.replies.map((reply) => ({ question: reply.question, personaText: reply.personaText, openItemIds: reply.openItemIds, allowedHookItemIds: reply.allowedHookItemIds })),
  };
  await options.toolCache?.set(cacheKey, stored);
  return result;
}

/** Runs actions a few at a time and returns their observations in the order the actions were given. */
async function runPool(actions: Action[], context: ToolContext, options: QaRunOptions, attempt: 0 | 1 = 0): Promise<JudgedObservation[]> {
  return mapPooled(actions, options.concurrency, async (action): Promise<JudgedObservation> => {
    const result = await runCached(action, attempt, context, options);
    return { key: actionKey(action), action, ...result, readings: {} };
  });
}

/** Actions not run or queued yet, in order, each once. */
function fresh(state: Pick<State, "seen">, actions: Action[]): { actions: Action[]; seen: string[] } {
  const seen = new Set(state.seen);
  const added = actions.filter((action) => {
    const key = actionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { actions: added, seen: [...seen] };
}

/** The planner reads the whole scenario once: risks, public leaks, and what to test on top of the floor. */
async function plan(state: State, config: RunnableConfig) {
  const options = optionsOf(config);
  const { scenario } = state;
  const toId = itemIdOf(scenario);
  const pathOf = new Map(publicFields(scenario).map((field) => [field.alias, field.path]));
  const sampleOf = new Map(scenario.items.map((item) => [item.id, item.sample_question]));

  const { output } = await withRateLimitBackoff(
    () =>
      callModel(
        "QA_PLANNER",
        buildQaPlanMessages(scenario, { floorAttacks: [...FLOOR_ATTACKS], budget: { leftUsd: options.budget.leftUsd, perCallUsd: options.budget.perCallUsd } }),
        { schema: qaPlanSchema(scenario), meta: metaOf(options), scope: scopeOf(options) },
        options.llmDeps,
      ),
    { ...options },
  );

  const added: Action[] = [
    ...output.deliveries.slice(0, QA_LIMITS.deliveries).map((alias): Action => ({ tool: "deliver_item", itemId: toId(alias), question: sampleOf.get(toId(alias))!, source: "plan" })),
    ...output.paraphrases.slice(0, QA_LIMITS.paraphrases).map((entry): Action => ({ tool: "check_unlock", itemId: toId(entry.item), question: entry.question, source: "plan" })),
    ...output.attacks.slice(0, QA_LIMITS.attacks).map((attackId): Action => ({ tool: "attack", attackId, source: "plan" })),
  ];
  const queued = fresh({ seen: [] }, [...floorActions(scenario), ...added]);
  return {
    pending: queued.actions,
    seen: queued.seen,
    publicLeaks: output.public_leaks.map((leak) => ({ field: pathOf.get(leak.field)!, itemId: toId(leak.item), kind: leak.kind, quote: leak.quote, reason: leak.reason })),
    risks: output.risks.map((risk) => ({ itemId: toId(risk.item), risk: risk.risk, reason: risk.reason })),
  };
}

/**
 * Code runs the queued actions through the engine, a few at a time. The floor always runs; an
 * action the agent added runs only while the budget holds its calls.
 */
async function execute(state: State, config: RunnableConfig) {
  const options = optionsOf(config);
  const { scenario } = state;
  let replyCount = state.observations.reduce((sum, observation) => sum + observation.replies.length, 0);
  const context: ToolContext = {
    scenario,
    scope: scopeOf(options),
    meta: metaOf(options),
    llmDeps: options.llmDeps,
    onContext: (subject, engineState) => assertIsolated(scenario, engineState, subject),
    nextReplyId: () => `R${(replyCount += 1)}`,
  };

  // The floor first, unconditionally; then the agent's additions, judged against what the floor's probes really cost.
  const floor = await runPool(state.pending.filter((action) => action.source === "floor"), context, options);
  let planned = 0;
  const added = state.pending.filter((action) => {
    if (action.source === "floor") return false;
    const calls = CALLS_OF[action.tool](action);
    const fits = options.budget.canAfford({ probes: planned + calls });
    if (fits) planned += calls;
    return fits;
  });
  const observations = await retryMisses(context, options, [...floor, ...(await runPool(added, context, options))]);
  const skipped = state.pending.length - floor.length - added.length;
  return { pending: [], observations: [...state.observations, ...observations], skipped: state.skipped + skipped };
}

/**
 * Call 1 is not deterministic: a check that missed its item runs once more, so one unlucky run
 * is told apart from a question that does not open the item. A miss costs one call more; a pass
 * costs nothing more.
 */
async function retryMisses(context: ToolContext, options: QaRunOptions, observations: JudgedObservation[]): Promise<JudgedObservation[]> {
  const misses = observations.filter((observation) => observation.action.tool === "check_unlock" && observation.openedItemId !== itemOfAction(observation.action));
  // As many as the budget holds, in order (the floor's first); one call each. A miss left over stays a miss.
  let affordable = 0;
  while (affordable < misses.length && options.budget.canAfford({ probes: affordable + 1 })) affordable += 1;
  const retried = await runPool(misses.slice(0, affordable).map((observation) => observation.action), context, options, 1);
  const again = new Map(retried.map((observation) => [observation.key, observation.openedItemId]));
  return observations.map((observation) => (again.has(observation.key) ? { ...observation, retryOpenedItemId: again.get(observation.key)! } : observation));
}

const itemOfAction = (action: Action) => ("itemId" in action ? action.itemId : null);

/** One batched call reads every reply not read yet. */
async function judge(state: State, config: RunnableConfig) {
  const options = optionsOf(config);
  const unread = state.observations.flatMap((observation) => observation.replies.filter((reply) => !observation.readings[reply.id]));
  if (unread.length === 0) return {};
  const readings = await withRateLimitBackoff(
    () => judgeReplies(state.scenario, unread, { scope: scopeOf(options), meta: metaOf(options), llmDeps: options.llmDeps }),
    { ...options },
  );
  return {
    observations: state.observations.map((observation) => ({
      ...observation,
      readings: { ...observation.readings, ...Object.fromEntries(observation.replies.flatMap((reply) => (readings.has(reply.id) ? [[reply.id, readings.get(reply.id)!]] : []))) },
    })),
  };
}

/** One line per observation: what the reflector reads instead of transcripts. */
function observationRows(scenario: Scenario, observations: JudgedObservation[]): string {
  const aliases = (ids: string[]) => (ids.length > 0 ? ids.map((id) => itemAlias(scenario, id)).join(",") : "-");
  const leaks = leaksOf(observations);
  return observations
    .flatMap((observation) => {
      const target = "itemId" in observation.action ? (observation.action.itemId === null ? "đầu buổi" : itemAlias(scenario, observation.action.itemId)) : observation.action.attackId;
      const openness = observation.opennessBefore === null ? "" : ` | độ cởi mở trước câu hỏi: ${observation.opennessBefore}`;
      const retry = observation.retryOpenedItemId === undefined ? "" : ` | chạy lại mở: ${observation.retryOpenedItemId ? itemAlias(scenario, observation.retryOpenedItemId) : "-"}`;
      const head = `${observation.action.tool} ${target} | mở: ${observation.openedItemId ? itemAlias(scenario, observation.openedItemId) : "-"}${retry} | nhãn: ${observation.label ?? "-"}${openness}`;
      const question = "question" in observation.action ? ` | hỏi: ${observation.action.question}` : "";
      const replies = observation.replies.map((reply) => {
        const reading = observation.readings[reply.id];
        const leaked = leaks.filter((leak) => leak.replyId === reply.id).map((leak) => leak.itemId);
        // The reply itself only where it matters: a leak, or an opened item it did not tell.
        const notTold = observation.openedItemId !== null && observation.action.tool !== "check_unlock" && !reading?.told.includes(observation.openedItemId);
        const text = leaked.length > 0 || notTold ? ` | nhân vật: ${reply.personaText}` : "";
        return `  ${reply.id} hỏi: ${reply.question} | đã mở lúc đó: ${aliases(reply.openItemIds)} | kể: ${aliases(reading?.told ?? [])} | lộ: ${aliases(leaked)}${text}`;
      });
      return [`${head}${question}`, ...replies];
    })
    .join("\n");
}

/** The reflector reads the results and the budget left, and either asks more questions or stops. */
async function reflect(state: State, config: RunnableConfig) {
  const options = optionsOf(config);
  const { scenario } = state;
  const stop = (decision: "budget" | "max_rounds") => ({ decision, rounds: [...state.rounds, { decision, actions: 0 }] });
  if (state.rounds.length >= MAX_REFLECT_ROUNDS) return stop("max_rounds");
  // The reflect call and one probe of two calls must fit, beside the judge call kept back for that probe.
  if (!options.budget.canAfford({ probes: 2, agent: 1 })) return stop("budget");

  const toId = itemIdOf(scenario);
  const pathOf = new Map(publicFields(scenario).map((field) => [field.alias, field.path]));
  const { output } = await withRateLimitBackoff(
    () =>
      callModel(
        "QA_PLANNER",
        buildQaReflectMessages(scenario, {
          observations: observationRows(scenario, state.observations),
          budget: { leftUsd: options.budget.leftUsd, perCallUsd: options.budget.perCallUsd },
        }),
        { schema: qaReflectSchema(scenario), meta: metaOf(options), scope: scopeOf(options) },
        options.llmDeps,
      ),
    { ...options },
  );
  const probes = output.decision === "probe_more" ? output.probes.slice(0, QA_LIMITS.reflectProbes) : [];
  const queued = fresh(
    state,
    probes.map((probe): Action => ({ tool: "probe_question", itemId: probe.item === null ? null : toId(probe.item), question: probe.question, source: "reflect" })),
  );
  const findings: Finding[] = output.findings.map((finding) => ({
    itemId: finding.item === null ? null : toId(finding.item),
    field: finding.field === null ? null : pathOf.get(finding.field)!,
    severity: finding.severity,
    note: finding.note,
  }));
  const decision: "probe_more" | "done" = queued.actions.length > 0 ? "probe_more" : "done";
  return {
    pending: queued.actions,
    seen: queued.seen,
    findings: [...state.findings, ...findings],
    decision,
    rounds: [...state.rounds, { decision, actions: queued.actions.length }],
  };
}

/** Code only: leaks by set arithmetic, the threshold table, the report. */
function report(state: State, config: RunnableConfig) {
  const options = optionsOf(config);
  const checked = validateScenario(state.scenario);
  const leaks = leaksOf(state.observations);
  const input = {
    violations: checked.violations.map((violation) => `${violation.path}: ${violation.message}`),
    publicLeaks: state.publicLeaks,
    observations: state.observations,
    leaks,
  };
  const warnings = warningsOf(input);
  if (state.skipped > 0) warnings.push(`${state.skipped} phép thử agent đề xuất bị bỏ vì ngân sách.`);
  const qaReport: QaReport = {
    profile: "lean",
    version: options.version,
    thresholds: evaluateThresholds(input),
    warnings,
    publicLeaks: state.publicLeaks,
    risks: state.risks,
    observations: state.observations,
    leaks,
    findings: state.findings,
    rounds: state.rounds,
    cost: { capUsd: options.budget.capUsd, actualUsd: options.budget.spentUsd, calls: options.budget.calls },
  };
  return { report: qaReport };
}

/** Compiled once. The loop is execute → judge → reflect, at most `MAX_REFLECT_ROUNDS` times. */
const qaAgentGraph = new StateGraph(QaState)
  .addNode("plan", plan)
  .addNode("execute", execute)
  .addNode("judge", judge)
  .addNode("reflect", reflect)
  .addNode("finish", report)
  .addEdge(START, "plan")
  .addEdge("plan", "execute")
  .addEdge("execute", "judge")
  .addEdge("judge", "reflect")
  .addConditionalEdges("reflect", (state) => (state.decision === "probe_more" ? "execute" : "finish"), ["execute", "finish"])
  .addEdge("finish", END)
  .compile();

/** The planner's, reflector's and judge's prompts as they render now, with no results in them. */
function agentPromptFingerprint(scenario: Scenario): string {
  const budget = { leftUsd: 0.1, perCallUsd: 0.003 };
  const messages = [
    ...buildQaPlanMessages(scenario, { floorAttacks: [...FLOOR_ATTACKS], budget }),
    ...buildQaReflectMessages(scenario, { observations: "", budget }),
    ...buildReplyJudgeMessages({ persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity }, surfaceFacts: scenario.surface_facts, items: [], replies: [] }),
  ];
  return messages.map((message) => message.text).join("\n");
}

/**
 * The persona QA agent: plan, execute through engine tools, judge the replies, reflect, report.
 * Spend is metered on every call: the budget decides what optional work runs, and a hard stop
 * at the cap cancels whatever is in flight. Throws `IsolationError` when a call was about to see
 * sealed material, and `LlmCallError` when a call failed after its retries.
 */
export async function runQaAgent(scenario: Scenario, options: Omit<QaRunOptions, "llmDeps"> & { llmDeps?: Partial<CallModelDeps> }): Promise<QaReport> {
  const { budget } = options;
  // A scenario that fails validate is not probed: the engine assumes a valid one, and the failure is already known.
  const { violations } = validateScenario(scenario);
  if (violations.length > 0) {
    const input = { violations: violations.map((violation) => `${violation.path}: ${violation.message}`), publicLeaks: [], observations: [], leaks: [] };
    return {
      profile: "lean",
      version: options.version,
      // Only validate ran: the other rows were never tested, so none of them may read as met.
      thresholds: evaluateThresholds(input).map((row) => (row.key === "validate" ? row : { ...row, met: false, detail: "chưa chạy: kịch bản không qua validate" })),
      warnings: ["Kịch bản không qua validate: agent không chạy phép thử nào."],
      publicLeaks: [],
      risks: [],
      observations: [],
      leaks: [],
      findings: [],
      rounds: [],
      cost: { capUsd: budget.capUsd, actualUsd: 0, calls: 0 },
    };
  }
  // A cached probe stands for a new one only on the same scenario content and the same probe models.
  const roleSpec = options.llmDeps?.roleSpec ?? roleSpecFromEnv;
  const cacheSalt = JSON.stringify([TOOL_CACHE_VERSION, scenario, roleSpec("ANALYSIS"), roleSpec("PERSONA"), probePromptFingerprint(scenario)]);
  // A finished run with every input the same, the agent's own prompts and models included, is
  // returned as it was: nothing would differ but chance.
  const runKey = `run:${createHash("sha256")
    .update(JSON.stringify([cacheSalt, roleSpec("QA_PLANNER"), roleSpec("EVAL_LEAK_JUDGE"), agentPromptFingerprint(scenario)]))
    .digest("hex")}`;
  const previous = options.toolCache && !options.refreshCache ? ((await options.toolCache.get(runKey)) as QaReport | null) : null;
  if (previous) return { ...previous, reusedFrom: previous.reusedFrom ?? "lần eval trước có cùng mọi đầu vào", cost: { ...previous.cost, actualUsd: 0, calls: 0 } };
  // The floor cannot be cut, so a cap that cannot hold it, the plan call and the judge call is
  // refused before anything is spent. A floor probe already in the cache costs nothing: a run
  // that takes over from a dead one still fits what its cap has left.
  const useCache = options.toolCache && !options.refreshCache ? options.toolCache : null;
  const unpaid = [];
  for (const action of floorActions(scenario)) {
    if (!useCache || !(await useCache.get(probeCacheKey(cacheSalt, action, 0)))) unpaid.push(action);
  }
  const floorCalls = unpaid.reduce((sum, action) => sum + CALLS_OF[action.tool](action), 0);
  if (!budget.canAfford({ probes: floorCalls, agent: 1 })) {
    throw new BudgetExceededError(floorCalls * budget.price("probe") + 2 * budget.price("agent"), budget.capUsd);
  }
  const hardStop = new AbortController();
  const recordCall = options.llmDeps?.recordCall ?? recordCallToDb;
  // The caller may stop the run too (a job at its time limit, or one that lost its claim).
  const outer = options.llmDeps?.signal;
  const llmDeps: Partial<CallModelDeps> = {
    ...options.llmDeps,
    signal: outer ? AbortSignal.any([outer, hardStop.signal]) : hardStop.signal,
    recordCall: async (record) => {
      await recordCall(record);
      budget.record(record.costUsd, record.role);
      if (budget.spentUsd >= budget.capUsd) hardStop.abort(new BudgetExceededError(budget.spentUsd, budget.capUsd));
    },
  };
  try {
    const result = await qaAgentGraph.invoke(
      { scenario, pending: [], seen: [], observations: [], publicLeaks: [], risks: [], findings: [], rounds: [], skipped: 0 },
      { configurable: { ...options, llmDeps, cacheSalt }, runName: "qa-agent", metadata: { eval_run_id: options.runId }, recursionLimit: 4 * (MAX_REFLECT_ROUNDS + 2) },
    );
    await options.toolCache?.set(runKey, result.report!);
    return result.report!;
  } catch (error) {
    if (hardStop.signal.aborted) throw new BudgetExceededError(budget.spentUsd, budget.capUsd);
    throw error;
  }
}
