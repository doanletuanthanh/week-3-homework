import { buildAnalysisContext } from "@/engine/contexts";
import { planTurn } from "@/engine/plan-turn";
import { analyzeTurn, runTurnGraph, type ContextInspector, type TurnGraphResult } from "@/graphs/turn-graph";
import type { CallModelDeps, CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildPersonaMessages } from "@/llm/prompts/persona";
import type { Scenario } from "@/scenario/schema";
import { inMemoryTurnStore } from "@/server/in-memory-turn-store";
import { findAttack } from "../attacks";
import { freshBasis, itemBasis, type ProbeBasis } from "./seed";
import type { Action, Observation, ProbeReply, ToolName } from "./types";

/** Opening turns of a scripted attack the agent plays: enough to see the persona give way. */
export const ATTACK_TURNS = 2;

export type ToolContext = {
  scenario: Scenario;
  scope: CallScope;
  meta: Record<string, string | number>;
  llmDeps?: Partial<CallModelDeps>;
  /** Checks every in-session call for isolation before it is made. */
  onContext?: ContextInspector;
  /** Hands out `R1`, `R2`, ... for the replies of a run. */
  nextReplyId: () => string;
};

type ToolResult = Omit<Observation, "key" | "action">;

/** Model calls an action makes, for the budget check before it runs. */
export const CALLS_OF: Record<ToolName, (action: Action) => number> = {
  check_unlock: () => 1,
  deliver_item: () => 2,
  attack: (action) => 2 * Math.min(ATTACK_TURNS, findAttack((action as Extract<Action, { tool: "attack" }>).attackId).opening.length),
  probe_question: () => 2,
};

/** The reply of a whole turn, with what it was allowed to say: items open after it, hooks said or asked for. */
function replyOf(context: ToolContext, action: string, basis: ProbeBasis, question: string, result: TurnGraphResult): ProbeReply {
  const { stateAfter, hookToDrop } = result.plan;
  const hooks = new Set([...stateAfter.ledger.map((entry) => entry.itemId), ...[hookToDrop, basis.state.selectedHook].filter((id) => id !== null)]);
  return {
    id: context.nextReplyId(),
    action,
    question,
    personaText: result.personaText,
    openItemIds: stateAfter.unlocked.map((entry) => entry.itemId),
    allowedHookItemIds: [...hooks],
  };
}

function turnOptions(context: ToolContext, basis: ProbeBasis) {
  const turnIndex = basis.state.turnIndex + 1;
  return {
    scope: { ...context.scope, turnIndex },
    meta: { ...context.meta, turn_index: turnIndex },
    llmDeps: context.llmDeps,
    onContext: context.onContext,
  };
}

async function wholeTurn(context: ToolContext, key: string, basis: ProbeBasis, question: string): Promise<ToolResult> {
  const result = await runTurnGraph({ scenario: context.scenario, ...basis, question }, turnOptions(context, basis));
  return {
    openedItemId: result.plan.unlockedItemId,
    label: result.plan.analysis.label,
    opennessBefore: result.plan.opennessBefore,
    opennessAfter: result.plan.opennessAfter,
    replies: [replyOf(context, key, basis, question, result)],
  };
}

type ToolOf<K extends ToolName> = (action: Extract<Action, { tool: K }>, context: ToolContext, key: string) => Promise<ToolResult>;

/** The tools, by name. Each one runs the real engine on a state it sets up, and reports what happened. */
export const TOOLS: { [K in ToolName]: ToolOf<K> } = {
  async check_unlock(action, context) {
    const basis = itemBasis(context.scenario, action.itemId);
    const { plan } = await analyzeTurn({ scenario: context.scenario, ...basis, question: action.question }, turnOptions(context, basis));
    return { openedItemId: plan.unlockedItemId, label: plan.analysis.label, opennessBefore: plan.opennessBefore, opennessAfter: plan.opennessAfter, replies: [] };
  },

  deliver_item: (action, context, key) => wholeTurn(context, key, itemBasis(context.scenario, action.itemId), action.question),

  probe_question: (action, context, key) =>
    wholeTurn(context, key, action.itemId === null ? freshBasis(context.scenario) : itemBasis(context.scenario, action.itemId), action.question),

  async attack(action, context, key) {
    const attack = findAttack(action.attackId);
    const store = inMemoryTurnStore(context.scenario);
    const replies: ProbeReply[] = [];
    let last: TurnGraphResult | null = null;
    for (const question of attack.opening.slice(0, ATTACK_TURNS)) {
      const loaded = await store.loadState();
      const basis = { state: loaded.state, transcript: loaded.transcript };
      last = await runTurnGraph({ scenario: context.scenario, ...basis, question }, turnOptions(context, basis));
      await store.commitTurn({ turnKey: `${key}:${replies.length + 1}`, question, ...last, latencyMs: 0 });
      replies.push(replyOf(context, key, basis, question, last));
    }
    return {
      openedItemId: last?.plan.unlockedItemId ?? null,
      label: last?.plan.analysis.label ?? null,
      opennessBefore: context.scenario.openness_start,
      opennessAfter: last?.plan.opennessAfter ?? null,
      replies,
    };
  },
};

/** Runs one action with the tool its name picks. */
export function runTool(action: Action, context: ToolContext, key: string): Promise<ToolResult> {
  return (TOOLS[action.tool] as ToolOf<typeof action.tool>)(action as never, context, key);
}

/**
 * The probe prompts as they render now, for the first item one question away: Call 1, and Call 2
 * after a decision that opens nothing. Any change to how either prompt is written changes this
 * text, so a cached probe is never reused across a prompt change.
 */
export function probePromptFingerprint(scenario: Scenario): string {
  const basis = itemBasis(scenario, scenario.items[0].id);
  const question = scenario.items[0].sample_question;
  const analysis = buildAnalysisMessages(buildAnalysisContext(scenario, basis.state, basis.transcript, question));
  const plan = planTurn({
    scenario,
    ...basis,
    question,
    analysis: {
      prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] },
      question_type: "other",
      label: "open",
      grounded_turn_id: null,
      introduced_span: null,
      hook_id: null,
      topic: { direct: null, direct_span: null, broad: [] },
      memory: { gist: "", claims: [] },
    },
  });
  return [...analysis, ...buildPersonaMessages(plan.personaContext)].map((message) => message.text).join("\n");
}
