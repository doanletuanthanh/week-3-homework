import { z } from "zod";
import { applyVerdict } from "@/engine/apply-verdict";
import { buildAnalysisContext } from "@/engine/contexts";
import { planTurn } from "@/engine/plan-turn";
import { LABELS, initialState, type EngineState, type Label } from "@/engine/types";
import { judgeTurn } from "@/graphs/turn-graph";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { analysisSchema } from "@/llm/schemas";
import type { Scenario } from "@/scenario/schema";

/**
 * Hand-labelled test sets for NFR-7. One JSON object per line. Every case is played against a
 * scenario file; `transcript` holds the turns after the opening line, which is added from the
 * scenario.
 */
const exchange = z.strictObject({ learner: z.string().min(1), persona: z.string().min(1) });

/** `label-classifier`: the label the production classifier must give a new question. */
export const labelCaseSchema = z.strictObject({
  id: z.string().min(1),
  transcript: z.array(exchange),
  question: z.string().min(1),
  expected: z.enum(LABELS),
  note: z.string().optional(),
});
export type LabelCase = z.infer<typeof labelCaseSchema>;

/**
 * `turn-verdict`: the verdict the turn judge must give the last persona turn. `unlocked` are the
 * items open at that turn, `told` the ones already told before it, `selected_hook` the item whose
 * hook the persona was asked to drop in it.
 */
export const verdictCaseSchema = z.strictObject({
  id: z.string().min(1),
  unlocked: z.array(z.string()),
  told: z.array(z.string()).default([]),
  selected_hook: z.string().nullable(),
  transcript: z.array(exchange).min(1),
  expected: z.strictObject({ told: z.array(z.string()), hook_dropped: z.boolean() }),
  note: z.string().optional(),
});
export type VerdictCase = z.infer<typeof verdictCaseSchema>;

export const SET_KINDS = ["label-classifier", "turn-verdict"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/** NFR-7: a set proves a gate only from this size up. */
export const MIN_SET_SIZE = 100;
const MAX_BLAME_RATE = 0.05;
const MIN_LABEL_AGREEMENT = 0.85;

export class TestSetError extends Error {}

/** Parses a JSONL test set; a line that does not fit the format is reported with its number. */
export function parseTestSet<T>(raw: string, schema: z.ZodType<T>): T[] {
  const cases: T[] = [];
  const ids = new Set<string>();
  raw.split(/\r?\n/u).forEach((line, index) => {
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new TestSetError(`Dòng ${index + 1}: không phải JSON hợp lệ.`);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new TestSetError(`Dòng ${index + 1}: ${issue.path.join(".") || "(gốc)"}: ${issue.message}`);
    }
    const id = (parsed.data as { id: string }).id;
    if (ids.has(id)) throw new TestSetError(`Dòng ${index + 1}: id "${id}" bị trùng.`);
    ids.add(id);
    cases.push(parsed.data);
  });
  return cases;
}

/** One NFR-7 rate against its hard gate. `value` is null when the set has no case that measures it. */
export type Rate = { key: string; label: string; value: number | null; limit: number; atLeast: boolean; met: boolean; count: string };

function rate(key: string, label: string, hits: number, total: number, limit: number, atLeast = false): Rate {
  const value = total === 0 ? null : hits / total;
  // A rate nothing measured cannot be called met.
  const met = value !== null && (atLeast ? value >= limit : value <= limit);
  return { key, label, value, limit, atLeast, met, count: `${hits}/${total}` };
}

export type SetScore = { size: number; rates: Rate[]; mismatches: string[] };

/** NFR-7, label classifier: good questions wrongly called `leading`, and overall agreement. */
export function scoreLabelSet(rows: { id: string; expected: Label; predicted: Label }[]): SetScore {
  const good = rows.filter((row) => row.expected !== "leading");
  return {
    size: rows.length,
    rates: [
      rate("good_as_leading", "Câu tốt bị gắn nhầm leading", good.filter((row) => row.predicted === "leading").length, good.length, MAX_BLAME_RATE),
      rate("agreement", "Đồng thuận với nhãn gán tay", rows.filter((row) => row.predicted === row.expected).length, rows.length, MIN_LABEL_AGREEMENT, true),
    ],
    mismatches: rows.filter((row) => row.predicted !== row.expected).map((row) => `${row.id}: gán tay ${row.expected}, máy ${row.predicted}`),
  };
}

export type VerdictRow = {
  id: string;
  hookSelected: boolean;
  expected: { told: string[]; hook_dropped: boolean };
  predicted: { told: string[]; hook_dropped: boolean };
};

/** NFR-7, judge verdict: the three directions in which a wrong verdict blames the learner. */
export function scoreVerdictSet(rows: VerdictRow[]): SetScore {
  const expectedTold = rows.flatMap((row) => row.expected.told.map((itemId) => ({ row, itemId })));
  const toldMissed = expectedTold.filter(({ row, itemId }) => !row.predicted.told.includes(itemId));
  const withHook = rows.filter((row) => row.hookSelected);
  const dropped = withHook.filter((row) => row.expected.hook_dropped);
  const notDropped = withHook.filter((row) => !row.expected.hook_dropped);
  const sameTold = (row: VerdictRow) => [...row.expected.told].sort().join() === [...row.predicted.told].sort().join();

  return {
    size: rows.length,
    rates: [
      rate("told_missed", "Điều đã kể bị chấm \"chưa kể\"", toldMissed.length, expectedTold.length, MAX_BLAME_RATE),
      rate("drop_missed", "Hook đã thả bị chấm \"chưa thả\"", dropped.filter((row) => !row.predicted.hook_dropped).length, dropped.length, MAX_BLAME_RATE),
      rate("drop_invented", "Hook chưa thả bị chấm \"đã thả\"", notDropped.filter((row) => row.predicted.hook_dropped).length, notDropped.length, MAX_BLAME_RATE),
    ],
    mismatches: rows
      .filter((row) => !sameTold(row) || row.expected.hook_dropped !== row.predicted.hook_dropped)
      .map(
        (row) =>
          `${row.id}: gán tay kể=[${row.expected.told.join(", ")}] thả=${row.expected.hook_dropped}, máy kể=[${row.predicted.told.join(", ")}] thả=${row.predicted.hook_dropped}`,
      ),
  };
}

/**
 * Exit code of `judgement-eval`: 1 when a hard gate is missed, 2 when every rate passes but the
 * set is too small to prove the gate (a starter set), 0 only when both hold.
 */
export function judgementExitCode(score: SetScore): 0 | 1 | 2 {
  if (score.rates.some((entry) => !entry.met)) return 1;
  return score.size < MIN_SET_SIZE ? 2 : 0;
}

export type JudgementOptions = { scope: CallScope; llmDeps?: Partial<CallModelDeps> };

const toTranscript = (scenario: Scenario, exchanges: { learner: string; persona: string }[]) => [
  { index: 0, learnerText: null as string | null, personaText: scenario.opening_line },
  ...exchanges.map((turn, position) => ({ index: position + 1, learnerText: turn.learner as string | null, personaText: turn.persona })),
];

function itemIds(scenario: Scenario, caseId: string, ids: string[]): string[] {
  for (const id of ids) {
    if (!scenario.items.some((item) => item.id === id)) throw new TestSetError(`${caseId}: kịch bản không có item "${id}".`);
  }
  return ids;
}

/** Runs the production Call 1 on each case and keeps the label a learner would be shown for it. */
export async function runLabelSet(scenario: Scenario, cases: LabelCase[], options: JudgementOptions): Promise<SetScore> {
  const rows = [];
  for (const entry of cases) {
    const transcript = toTranscript(scenario, entry.transcript);
    const state: EngineState = { ...initialState(scenario.openness_start), turnIndex: entry.transcript.length };
    const reply = await callModel(
      "ANALYSIS",
      buildAnalysisMessages(buildAnalysisContext(scenario, state, transcript, entry.question)),
      { schema: analysisSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const { analysis } = planTurn({ scenario, state, analysis: reply.output, transcript, question: entry.question });
    rows.push({ id: entry.id, expected: entry.expected, predicted: analysis.label });
  }
  return scoreLabelSet(rows);
}

/** Runs the production turn judge on each case and keeps the verdict code accepted. */
export async function runVerdictSet(scenario: Scenario, cases: VerdictCase[], options: JudgementOptions): Promise<SetScore> {
  const rows: VerdictRow[] = [];
  for (const entry of cases) {
    const turnIndex = entry.transcript.length;
    const at = (itemId: string) => ({ itemId, turn: turnIndex });
    const hook = entry.selected_hook === null ? null : itemIds(scenario, entry.id, [entry.selected_hook])[0];
    const state: EngineState = {
      ...initialState(scenario.openness_start),
      turnIndex,
      unlocked: itemIds(scenario, entry.id, entry.unlocked).map(at),
      disclosed: itemIds(scenario, entry.id, entry.told).map(at),
      selectedHook: hook,
    };
    itemIds(scenario, entry.id, entry.expected.told);
    const verdict = await judgeTurn(
      { scenario, state, transcript: toTranscript(scenario, entry.transcript) },
      { scope: options.scope, meta: { judgement_case: entry.id }, llmDeps: options.llmDeps },
    );
    const { applied } = applyVerdict(scenario, state, verdict);
    rows.push({
      id: entry.id,
      hookSelected: hook !== null,
      expected: entry.expected,
      predicted: { told: applied.disclosed_item_ids, hook_dropped: applied.hook_dropped },
    });
  }
  return scoreVerdictSet(rows);
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** The score as lines for a terminal. */
export function formatScore(score: SetScore): string[] {
  return [
    ...score.rates.map((entry) => {
      const measured = entry.value === null ? "không có ca nào đo" : `${percent(entry.value)} (${entry.count})`;
      return `[${entry.met ? "ĐẠT" : "CHƯA ĐẠT"}] ${entry.label}: ${measured}, cổng ${entry.atLeast ? "≥" : "≤"} ${percent(entry.limit)}`;
    }),
    ...(score.mismatches.length > 0 ? ["Các ca lệch:", ...score.mismatches.map((line) => `  ${line}`)] : []),
    ...(score.size < MIN_SET_SIZE
      ? [`Bộ thử có ${score.size} ca, cần ≥ ${MIN_SET_SIZE} ca gán tay: kết quả này chưa chứng minh được cổng NFR-7.`]
      : []),
  ];
}
