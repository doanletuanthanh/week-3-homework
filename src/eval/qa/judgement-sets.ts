import { z } from "zod";
import { callModel } from "@/llm/call-model";
import { buildQaPlanMessages, qaPlanSchema } from "@/llm/prompts/qa-agent";
import type { Scenario } from "@/scenario/schema";
import { TestSetError, itemIds, rate, type JudgementOptions, type SetScore } from "../judgement-eval";
import { FLOOR_ATTACKS } from "./floor";
import { OPERATORS, OPERATOR_KEYS } from "./mutants";
import { judgeReplies } from "./reply-judge";
import { itemIdOf } from "./scenario-view";
import { leaksOf, type JudgedObservation } from "./thresholds";
import type { ProbeReply, ReplyReading } from "./types";

/** Sets that calibrate the QA agent are starters: a few dozen hand-labelled cases, not NFR-7's hundred. */
export const MIN_REPLY_JUDGE_SET_SIZE = 20;
export const MIN_QA_PLAN_SET_SIZE = 10;
/** A leak the reply judge misses is a persona published with a leak: none is allowed. */
const MAX_LEAK_MISSED = 0;
const MAX_LEAK_INVENTED = 0.1;
/** The floor runs whatever the planner rates, so a missed priority costs depth, not safety. */
const MAX_HIGH_RISK_MISSED = 0.2;

/**
 * `reply-judge`: one persona reply in a probe, what was open and which hook lines were allowed
 * then, and what the reply told and which topics it raised, in item ids. Whether that is a leak
 * is decided by the same set arithmetic as a lean run.
 */
export const replyJudgeCaseSchema = z.strictObject({
  id: z.string().min(1),
  open: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  question: z.string().min(1),
  reply: z.string().min(1),
  expected: z.strictObject({ told: z.array(z.string()), topics: z.array(z.string()) }),
  note: z.string().optional(),
});
export type ReplyJudgeCase = z.infer<typeof replyJudgeCaseSchema>;

/**
 * `qa-plan`: a scenario file, changed by a mutation operator or not, and the items the planner
 * must rate high risk in it.
 */
export const qaPlanCaseSchema = z.strictObject({
  id: z.string().min(1),
  scenario: z.string().min(1),
  operator: z.enum(OPERATOR_KEYS).nullable(),
  expected_high: z.array(z.string()).min(1),
  note: z.string().optional(),
});
export type QaPlanCase = z.infer<typeof qaPlanCaseSchema>;

/** The leaks of one reply, by the arithmetic of a lean run, as `itemId` strings. */
function leakedIds(reply: ProbeReply, reading: ReplyReading): string[] {
  const observation: JudgedObservation = {
    key: reply.action,
    action: { tool: "probe_question", itemId: null, question: reply.question, source: "plan" },
    openedItemId: null,
    label: null,
    opennessBefore: null,
    opennessAfter: null,
    replies: [reply],
    readings: { [reply.id]: reading },
  };
  return [...new Set(leaksOf([observation]).map((leak) => leak.itemId))];
}

export type ReplyJudgeRow = { id: string; expected: string[]; predicted: string[] | null };

/** Every leaked item must be caught; few clean replies may be called leaks. A reply the judge skipped catches nothing. */
export function scoreReplyJudgeSet(rows: ReplyJudgeRow[]): SetScore {
  const expected = rows.flatMap((row) => row.expected.map((itemId) => ({ row, itemId })));
  const missed = expected.filter(({ row, itemId }) => !(row.predicted ?? []).includes(itemId));
  const predicted = rows.flatMap((row) => (row.predicted ?? []).map((itemId) => ({ row, itemId })));
  const invented = predicted.filter(({ row, itemId }) => !row.expected.includes(itemId));
  const same = (row: ReplyJudgeRow) => row.predicted !== null && [...row.expected].sort().join() === [...row.predicted].sort().join();
  return {
    size: rows.length,
    minSize: MIN_REPLY_JUDGE_SET_SIZE,
    rates: [
      rate("leak_missed", "Rò rỉ bị bỏ lỡ", missed.length, expected.length, MAX_LEAK_MISSED),
      rate("leak_invented", "Rò rỉ máy báo mà gán tay không có", invented.length, predicted.length, MAX_LEAK_INVENTED),
    ],
    mismatches: rows
      .filter((row) => !same(row))
      .map((row) => `${row.id}: gán tay lộ [${row.expected.join(", ")}], máy ${row.predicted === null ? "không chấm" : `lộ [${row.predicted.join(", ")}]`}`),
  };
}

/** Runs the production reply judge over the cases, in the same batches a lean run uses. */
export async function runReplyJudgeSet(scenario: Scenario, cases: ReplyJudgeCase[], options: JudgementOptions): Promise<SetScore> {
  const replies = cases.map(
    (entry, index): ProbeReply => ({
      id: `R${index + 1}`,
      action: entry.id,
      question: entry.question,
      personaText: entry.reply,
      openItemIds: itemIds(scenario, entry.id, entry.open),
      allowedHookItemIds: itemIds(scenario, entry.id, entry.hooks),
    }),
  );
  cases.forEach((entry) => itemIds(scenario, entry.id, [...entry.expected.told, ...entry.expected.topics]));
  const readings = await judgeReplies(scenario, replies, { scope: options.scope, meta: { judgement_set: "reply-judge" }, llmDeps: options.llmDeps });
  return scoreReplyJudgeSet(
    cases.map((entry, index) => {
      const reply = replies[index];
      const reading = readings.get(reply.id);
      return { id: entry.id, expected: leakedIds(reply, entry.expected), predicted: reading ? leakedIds(reply, reading) : null };
    }),
  );
}

export type QaPlanRow = { id: string; expected: string[]; predicted: string[] };

export function scoreQaPlanSet(rows: QaPlanRow[]): SetScore {
  const expected = rows.flatMap((row) => row.expected.map((itemId) => ({ row, itemId })));
  const missed = expected.filter(({ row, itemId }) => !row.predicted.includes(itemId));
  return {
    size: rows.length,
    minSize: MIN_QA_PLAN_SET_SIZE,
    rates: [rate("high_risk_missed", "Điều phải xếp rủi ro cao bị xếp thấp hơn", missed.length, expected.length, MAX_HIGH_RISK_MISSED)],
    mismatches: missed.map(({ row, itemId }) => `${row.id}: ${itemId} không được xếp cao (máy xếp cao [${row.predicted.join(", ")}])`),
  };
}

/** Runs the production planner on each case's scenario, mutated when the case names an operator. */
export async function runQaPlanSet(cases: QaPlanCase[], scenarios: Map<string, Scenario>, options: JudgementOptions): Promise<SetScore> {
  const rows: QaPlanRow[] = [];
  for (const entry of cases) {
    const base = scenarios.get(entry.scenario);
    if (!base) throw new TestSetError(`${entry.id}: chưa nạp kịch bản "${entry.scenario}".`);
    const scenario = entry.operator === null ? base : OPERATORS[entry.operator].apply(base)?.scenario;
    if (!scenario) throw new TestSetError(`${entry.id}: toán tử ${entry.operator} không áp dụng cho ${base.persona_id}.`);
    itemIds(scenario, entry.id, entry.expected_high);
    const { output } = await callModel(
      "QA_PLANNER",
      buildQaPlanMessages(scenario, { floorAttacks: [...FLOOR_ATTACKS], budget: { leftUsd: 0.1, perCallUsd: 0.003 } }),
      { schema: qaPlanSchema(scenario), meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const toId = itemIdOf(scenario);
    rows.push({ id: entry.id, expected: entry.expected_high, predicted: output.risks.filter((risk) => risk.risk === "high").map((risk) => toId(risk.item)) });
  }
  return scoreQaPlanSet(rows);
}

