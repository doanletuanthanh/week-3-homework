import { z } from "zod";
import { buildAnalysisContext } from "@/engine/contexts";
import { planTurn } from "@/engine/plan-turn";
import { initialState, type EngineState } from "@/engine/types";
import { callModel } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { analysisSchema } from "@/llm/schemas";
import type { Scenario } from "@/scenario/schema";
import { TestSetError, exchangeSchema, itemIds, rate, toTranscript, type JudgementOptions, type SetScore } from "./judgement-eval";
import { mapPooled } from "./pool";

/** A question that asks about several topics in general, or about none of them specifically. */
const BROAD = "broad";
/** A question that touches no topic of the scenario. */
const NONE = "none";

/**
 * `topic-route`: which item a question routes to, read where code acts on it (the checked
 * `tag_item_id` of the turn plan). Each case names its own scenario file, so one set pools the
 * personas and its gate is decided on all of them at once. `expected` is the item the question
 * asks about specifically, or `broad`, or `none`; the `note` says why, and why the closest other
 * tag is wrong.
 */
export const routeCaseSchema = z.strictObject({
  id: z.string().min(1),
  scenario: z.string().min(1),
  /** Items open, and told, at the last turn of the transcript. */
  unlocked: z.array(z.string()).default([]),
  told: z.array(z.string()).default([]),
  transcript: z.array(exchangeSchema),
  question: z.string().min(1),
  expected: z.string().min(1),
  note: z.string().min(1),
});
export type RouteCase = z.infer<typeof routeCaseSchema>;

/**
 * About one line in 48: a question that opens the wrong item, or opens one when it should open
 * none, is the costly error. Missing a question that did ask about one item only costs the learner
 * a rephrasing, so its gate is looser.
 */
export const MAX_WRONG_ROUTE = 0.021;
export const MAX_MISSED_ROUTE = 0.2;
export const MIN_ROUTE_SET_SIZE = 48;

export type RouteRow = { id: string; expected: string; predicted: string | null };

const isItem = (expected: string) => expected !== BROAD && expected !== NONE;

/** Topic route: an item opened that the question did not ask about specifically, and a direct question that opened none. */
export function scoreTopicRouteSet(rows: RouteRow[]): SetScore {
  const wrong = rows.filter((row) => row.predicted !== null && row.predicted !== row.expected);
  const direct = rows.filter((row) => isItem(row.expected));
  const missed = direct.filter((row) => row.predicted === null);
  const general = rows.filter((row) => !isItem(row.expected));

  const pairs = new Map<string, number>();
  for (const row of wrong) {
    const pair = `${row.expected} → ${row.predicted}`;
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  const confusions = [...pairs].sort((a, b) => b[1] - a[1]).map(([pair, count]) => `  ${pair}${count > 1 ? ` ×${count}` : ""}`);

  return {
    size: rows.length,
    minSize: MIN_ROUTE_SET_SIZE,
    rates: [
      rate("wrong_direct", "Câu hỏi mở nhầm điều, hoặc mở một điều khi không nên mở", wrong.length, rows.length, MAX_WRONG_ROUTE),
      rate("missed_direct", "Câu hỏi đúng vào một chủ đề mà không được nhận ra", missed.length, direct.length, MAX_MISSED_ROUTE),
    ],
    notes: [
      `Câu chung chung hoặc không chạm chủ đề nào mà không mở gì: ${general.filter((row) => row.predicted === null).length}/${general.length}`,
      ...(confusions.length > 0 ? ["Cặp nhầm (gán tay → máy):", ...confusions] : []),
    ],
    mismatches: rows
      .filter((row) => row.predicted !== (isItem(row.expected) ? row.expected : null))
      .map((row) => `${row.id}: gán tay ${row.expected}, máy ${row.predicted ?? "không mở gì"}`),
  };
}

/**
 * Runs the production Call 1 on each case and keeps the item code would act on. Every case is
 * checked against its scenario before any call, so a broken set spends nothing.
 */
export async function runTopicRouteSet(cases: RouteCase[], scenarios: ReadonlyMap<string, Scenario>, options: JudgementOptions): Promise<SetScore> {
  const prepared = cases.map((entry) => {
    const scenario = scenarios.get(entry.scenario);
    if (!scenario) throw new TestSetError(`${entry.id}: chưa nạp kịch bản "${entry.scenario}".`);
    itemIds(scenario, entry.id, entry.unlocked);
    const notOpen = entry.told.filter((id) => !entry.unlocked.includes(id));
    if (notOpen.length > 0) throw new TestSetError(`${entry.id}: điều đã kể phải là điều đã mở (${notOpen.join(", ")}).`);
    if (isItem(entry.expected)) itemIds(scenario, entry.id, [entry.expected]);
    const turnIndex = entry.transcript.length;
    const at = (itemId: string) => ({ itemId, turn: turnIndex });
    const state: EngineState = {
      ...initialState(scenario.openness_start),
      turnIndex,
      unlocked: entry.unlocked.map(at),
      disclosed: entry.told.map(at),
    };
    return { entry, scenario, state, transcript: toTranscript(scenario, entry.transcript) };
  });

  const rows = await mapPooled(prepared, options.concurrency ?? 1, async ({ entry, scenario, state, transcript }): Promise<RouteRow> => {
    const reply = await callModel(
      "ANALYSIS",
      buildAnalysisMessages(buildAnalysisContext(scenario, state, transcript, entry.question)),
      { schema: analysisSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const { analysis } = planTurn({ scenario, state, analysis: reply.output, transcript, question: entry.question });
    return { id: entry.id, expected: entry.expected, predicted: analysis.tag_item_id };
  });
  return scoreTopicRouteSet(rows);
}
