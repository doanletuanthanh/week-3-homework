import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { calibrationSpecs, falseFailures, formatCalibration, operatorScores, runCalibration, type CalibrationResult } from "@/eval/qa/calibration";
import { OPERATOR_KEYS, type OperatorKey } from "@/eval/qa/mutants";
import { Budget, runQaAgent } from "@/graphs/qa-agent-graph";
import type { CallModelDeps } from "@/llm/call-model";
import { batchLlmDeps, type BatchCollectorOptions, type GeminiBatchCollector } from "@/llm/gemini-batch";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, readJsonFile, type CliIo, type Command } from "../scenario-file";

const USAGE = `Cách dùng: il eval-calibrate [--persona <id>] [--operator ${OPERATOR_KEYS.join("|")}] [--runs N] [--only clean|mutants] [--fast] [--concurrency N] [--yes]`;

/** Probes of one run in flight at once: a batch job gathers more, direct calls meet rate limits sooner. */
const PROBE_CONCURRENCY = { batch: 64, fast: 4 } as const;

export type EvalCalibrateDeps = {
  llmDeps?: Partial<CallModelDeps>;
  batchCollector?: (onJob: BatchCollectorOptions["onJob"]) => GeminiBatchCollector;
  /** Asks the operator to go ahead with the spend shown. */
  confirm: (question: string) => Promise<boolean>;
  /** Where the curated personas are read from. */
  scenarioDir?: string;
};

/** Every curated persona on disk that passes validate, by persona id. */
async function curatedScenarios(dir: string): Promise<Scenario[]> {
  const topics = await readdir(dir, { withFileTypes: true });
  const scenarios: Scenario[] = [];
  for (const topic of topics.filter((entry) => entry.isDirectory())) {
    const files = (await readdir(join(dir, topic.name))).filter((name) => name.endsWith(".json") && name !== "topic.json");
    for (const file of files) {
      const { scenario, violations } = validateScenario(await readJsonFile(join(dir, topic.name, file)));
      if (!scenario) throw new CliError(`${join(dir, topic.name, file)} không qua validate (${violations.length} vi phạm).`);
      scenarios.push(scenario);
    }
  }
  return scenarios.sort((a, b) => a.persona_id.localeCompare(b.persona_id));
}

const progress = (result: CalibrationResult) =>
  `${result.personaId} ${result.operator}${result.operator === "clean" ? ` lần ${result.run}` : ""}: ${
    result.unmet === null ? `lỗi ${result.error}` : result.unmet.length === 0 ? "đạt" : `không đạt [${result.unmet.join(", ")}]`
  }, ${result.calls} lần gọi, ${result.costUsd.toFixed(4)} USD`;

/**
 * `eval-calibrate`: proves the lean eval on known answers. Each curated persona runs clean several
 * times (it must pass every time), and each mutant of it runs once (it must fail the row its
 * operator declares). Scenarios come from disk; nothing is stored but the `llm_call` rows, and no
 * cache is read, so every run is measured.
 */
export function runEvalCalibrate(args: string[], io: CliIo, db: Database | null, deps: EvalCalibrateDeps): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("eval-calibrate"));
    const { positional, values, switches } = parseArgs(args, { values: ["persona", "operator", "runs", "only", "concurrency"], switches: ["fast", "yes"] });
    if (positional.length > 0) throw new CliError(USAGE);
    if (values.operator !== undefined && !OPERATOR_KEYS.includes(values.operator as OperatorKey)) throw new CliError(USAGE);
    if (values.only !== undefined && values.only !== "clean" && values.only !== "mutants") throw new CliError(USAGE);
    const batch = !switches.has("fast");
    const cleanRuns = intOption(values.runs, "runs", { min: 1, max: 10, fallback: 3 });
    const concurrency = intOption(values.concurrency, "concurrency", { min: 1, max: 32, fallback: batch ? 8 : 2 });

    let scenarios = await curatedScenarios(deps.scenarioDir ?? "scenarios");
    if (values.persona !== undefined) {
      scenarios = scenarios.filter((scenario) => scenario.persona_id === values.persona);
      if (scenarios.length === 0) throw new CliError(`Không có persona "${values.persona}" trong thư mục kịch bản.`);
    }
    const specs = calibrationSpecs(scenarios, {
      cleanRuns,
      clean: values.only !== "mutants" && values.operator === undefined,
      operators: values.only === "clean" ? [] : values.operator !== undefined ? [values.operator as OperatorKey] : OPERATOR_KEYS,
    });
    if (specs.length === 0) throw new CliError("Không có lần chạy nào: toán tử này không áp dụng cho persona đã chọn.");

    let llmDeps = deps.llmDeps;
    if (batch) {
      if (!deps.batchCollector) throw new CliError("Không có kênh batch: chạy với --fast.");
      let collector: GeminiBatchCollector;
      try {
        collector = deps.batchCollector((job) => io.out(`  [batch] ${job.job}: ${job.requests} lần gọi, ${job.state}`));
      } catch (error) {
        throw new CliError(`Không tạo được kênh batch: ${(error as Error).message}. Đặt GOOGLE_API_KEY_BATCH hoặc GOOGLE_API_KEY, hoặc chạy với --fast.`);
      }
      llmDeps = batchLlmDeps(collector, deps.llmDeps);
    }
    const capUsd = await getConfig(db, "eval_lean_budget_usd");
    // A scenario that fails validate is reported without a call; every other run may spend up to the cap.
    const paid = specs.filter((spec) => validateScenario(spec.scenario).violations.length === 0).length;
    io.out(
      `Hiệu chỉnh eval lean: ${specs.length} lần chạy trên ${scenarios.length} persona (${paid} lần tốn tiền), trần ${capUsd.toFixed(2)} USD mỗi lần, tối đa ${(paid * capUsd).toFixed(2)} USD, ${batch ? "batch" : "gọi trực tiếp (--fast)"}, không dùng cache.`,
    );
    if (paid > 0 && !switches.has("yes") && !(await deps.confirm("Chạy hiệu chỉnh với chi phí tối đa trên? (gõ yes để chạy) "))) {
      io.out("Đã hủy: không gọi model nào.");
      return 1;
    }

    const results = await runCalibration(
      specs,
      (spec) =>
        runQaAgent(spec.scenario, {
          runId: randomUUID(),
          version: spec.scenario.version,
          budget: new Budget(capUsd),
          llmDeps: spec.rewriteMessages ? { ...llmDeps, rewriteMessages: spec.rewriteMessages } : llmDeps,
          concurrency: batch ? PROBE_CONCURRENCY.batch : PROBE_CONCURRENCY.fast,
        }),
      { concurrency, onResult: (result) => io.out(progress(result)) },
    );

    for (const line of formatCalibration(results)) io.out(line);
    const missed = operatorScores(results).filter((score) => score.gating && score.caught < score.total);
    return missed.length > 0 || falseFailures(results).length > 0 ? 1 : 0;
  });
}

export function evalCalibrateCommand(db: Database | null, deps: () => EvalCalibrateDeps): Command {
  return {
    usage: "eval-calibrate",
    summary: "Hiệu chỉnh eval lean: persona sạch phải đạt, mutant phải trượt đúng ngưỡng; in ma trận.",
    run: (args, io) => runEvalCalibrate(args, io, db, deps()),
  };
}
