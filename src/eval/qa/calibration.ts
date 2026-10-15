import type { CallModelDeps } from "@/llm/call-model";
import type { Scenario } from "@/scenario/schema";
import { OPERATORS, mutantsOf, type OperatorKey } from "./mutants";
import type { QaReport } from "./types";

/** One lean run the calibration makes: a clean persona, or one of its mutants. */
export type CalibrationSpec = {
  personaId: string;
  operator: OperatorKey | "clean";
  /** 1, 2, ... among the runs of the same persona and operator. */
  run: number;
  scenario: Scenario;
  targetItemId: string | null;
  rewriteMessages?: CallModelDeps["rewriteMessages"];
};

export type CalibrationResult = {
  personaId: string;
  operator: OperatorKey | "clean";
  run: number;
  targetItemId: string | null;
  /** Threshold rows the run did not meet; empty for a pass. Null when the run itself failed. */
  unmet: string[] | null;
  /** Why the run failed when it did: budget, isolation, model. */
  error?: string;
  /** For a mutant: the report pins a failure on the change itself (see `Operator.confirms`). */
  confirmed: boolean;
  /** Items the planner rated high risk. */
  highRisk: string[];
  costUsd: number;
  calls: number;
};

/**
 * The runs of a calibration: each clean persona `cleanRuns` times, and each mutant of it once.
 * Model-judged operators apply only to personas with a leak fixture; structural ones to all.
 */
export function calibrationSpecs(scenarios: Scenario[], options: { cleanRuns: number; operators: readonly OperatorKey[]; clean: boolean }): CalibrationSpec[] {
  return scenarios.flatMap((scenario) => [
    ...(options.clean
      ? Array.from({ length: options.cleanRuns }, (_, index): CalibrationSpec => ({ personaId: scenario.persona_id, operator: "clean", run: index + 1, scenario, targetItemId: null }))
      : []),
    ...mutantsOf(scenario, options.operators).map(
      (mutant): CalibrationSpec => ({ personaId: scenario.persona_id, operator: mutant.operator, run: 1, scenario: mutant.scenario, targetItemId: mutant.targetItemId, rewriteMessages: mutant.rewriteMessages }),
    ),
  ]);
}

export function resultOf(spec: CalibrationSpec, report: QaReport): CalibrationResult {
  return {
    personaId: spec.personaId,
    operator: spec.operator,
    run: spec.run,
    targetItemId: spec.targetItemId,
    unmet: report.thresholds.filter((threshold) => !threshold.met).map((threshold) => threshold.key),
    confirmed: spec.operator !== "clean" && OPERATORS[spec.operator].confirms(report, spec),
    highRisk: report.risks.filter((risk) => risk.risk === "high").map((risk) => risk.itemId),
    costUsd: report.cost.actualUsd,
    calls: report.cost.calls,
  };
}

/**
 * Whether a mutant run was caught for the right reason: the row its operator declares failed, and
 * the report ties a failure to the change itself. A flaky failure elsewhere is not a catch. A
 * failed run catches nothing.
 */
export const caught = (result: CalibrationResult): boolean =>
  result.operator !== "clean" && result.unmet !== null && result.unmet.includes(OPERATORS[result.operator].trips) && result.confirmed;

function missReason(result: CalibrationResult): string {
  if (result.unmet === null) return `lỗi ${result.error}`;
  const rows = `không đạt [${result.unmet.join(", ") || "không có"}]`;
  return result.unmet.includes(OPERATORS[result.operator as OperatorKey].trips) ? `${rows} nhưng không vì điều bị sửa` : rows;
}

export type OperatorScore = { operator: OperatorKey; gating: boolean; trips: string; caught: number; total: number; targetHighRisk: number; misses: string[] };

/** Recall per operator, and how often the planner rated the mutated item high risk. */
export function operatorScores(results: CalibrationResult[]): OperatorScore[] {
  const keys = [...new Set(results.map((result) => result.operator))].filter((key): key is OperatorKey => key !== "clean");
  return keys.map((operator) => {
    const runs = results.filter((result) => result.operator === operator);
    const hits = runs.filter(caught);
    return {
      operator,
      gating: OPERATORS[operator].gating,
      trips: OPERATORS[operator].trips,
      caught: hits.length,
      total: runs.length,
      targetHighRisk: runs.filter((result) => result.targetItemId !== null && result.highRisk.includes(result.targetItemId)).length,
      misses: runs.filter((result) => !caught(result)).map((result) => `${result.personaId}: ${missReason(result)}`),
    };
  });
}

export type RowStability = { personaId: string; row: string; failed: number; runs: number };

/**
 * Per clean persona and threshold row: in how many runs the row failed. A row that failed in
 * some runs and not others flips; a row that failed in every run is a stable failure.
 */
export function cleanStability(results: CalibrationResult[]): RowStability[] {
  const clean = results.filter((result) => result.operator === "clean" && result.unmet !== null);
  const personas = [...new Set(clean.map((result) => result.personaId))];
  return personas.flatMap((personaId) => {
    const runs = clean.filter((result) => result.personaId === personaId);
    const rows = [...new Set(runs.flatMap((result) => result.unmet!))];
    return rows.map((row) => ({ personaId, row, failed: runs.filter((result) => result.unmet!.includes(row)).length, runs: runs.length }));
  });
}

/** Clean runs that did not pass: each is a false failure. */
export const falseFailures = (results: CalibrationResult[]) => results.filter((result) => result.operator === "clean" && (result.unmet === null || result.unmet.length > 0));

/** The matrix as lines for a terminal. */
export function formatCalibration(results: CalibrationResult[]): string[] {
  const scores = operatorScores(results);
  const clean = results.filter((result) => result.operator === "clean");
  const stability = cleanStability(results);
  const cost = results.reduce((sum, result) => sum + result.costUsd, 0);
  const calls = results.reduce((sum, result) => sum + result.calls, 0);
  const runCost = (rows: CalibrationResult[]) => (rows.length === 0 ? "-" : `${Math.max(...rows.map((row) => row.costUsd)).toFixed(4)}`);
  return [
    "Mutant (độ phủ theo toán tử):",
    ...scores.map(
      (score) =>
        `  [${score.caught === score.total ? "ĐẠT" : score.gating ? "CHƯA ĐẠT" : "THÔNG TIN"}] ${score.operator} → ${score.trips}: bắt ${score.caught}/${score.total}, planner xếp điều bị sửa rủi ro cao ${score.targetHighRisk}/${score.total}${score.misses.length > 0 ? `; trượt: ${score.misses.join("; ")}` : ""}`,
    ),
    `Persona sạch: ${clean.length - falseFailures(results).length}/${clean.length} lần chạy đạt.`,
    ...stability.map((row) => `  ${row.personaId} ${row.row}: hỏng ${row.failed}/${row.runs}${row.failed < row.runs ? " (lật)" : " (ổn định)"}`),
    ...clean.filter((result) => result.unmet === null).map((result) => `  ${result.personaId} lần ${result.run}: lỗi ${result.error}`),
    `Chi phí: ${cost.toFixed(4)} USD, ${calls} lần gọi; lần chạy đắt nhất: sạch ${runCost(clean)}, mutant ${runCost(results.filter((result) => result.operator !== "clean"))} USD.`,
  ];
}

/** Runs specs a few at a time; a run that throws is recorded as failed and the others go on. */
export async function runCalibration(
  specs: CalibrationSpec[],
  runOne: (spec: CalibrationSpec) => Promise<QaReport>,
  options: { concurrency: number; onResult?: (result: CalibrationResult) => void },
): Promise<CalibrationResult[]> {
  const queue = [...specs];
  const results: CalibrationResult[] = [];
  const worker = async () => {
    for (let spec = queue.shift(); spec; spec = queue.shift()) {
      let result: CalibrationResult;
      try {
        result = resultOf(spec, await runOne(spec));
      } catch (error) {
        result = {
          personaId: spec.personaId,
          operator: spec.operator,
          run: spec.run,
          targetItemId: spec.targetItemId,
          unmet: null,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          confirmed: false,
          highRisk: [],
          costUsd: error instanceof Error && "spentUsd" in error && typeof error.spentUsd === "number" ? error.spentUsd : 0,
          calls: 0,
        };
      }
      results.push(result);
      options.onResult?.(result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, queue.length)) }, worker));
  return results;
}
