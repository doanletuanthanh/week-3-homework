import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  SET_KINDS,
  TestSetError,
  canvasCaseSchema,
  formatScore,
  judgementExitCode,
  labelCaseSchema,
  moderationCaseSchema,
  noveltyCaseSchema,
  parseTestSet,
  runCanvasSet,
  runLabelSet,
  runModerationSet,
  runNoveltySet,
  runSafetySet,
  runVerdictSet,
  safetyCaseSchema,
  verdictCaseSchema,
  type SetKind,
  type SetScore,
} from "@/eval/judgement-eval";
import { guideCaseSchema, runGuideSet } from "@/eval/guide-check-set";
import { qaPlanCaseSchema, replyJudgeCaseSchema, runQaPlanSet, runReplyJudgeSet } from "@/eval/qa/judgement-sets";
import { routeCaseSchema, runTopicRouteSet } from "@/eval/topic-route-set";
import type { CallModelDeps } from "@/llm/call-model";
import { batchLlmDeps, type BatchCollectorOptions, type GeminiBatchCollector } from "@/llm/gemini-batch";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { intOption, parseArgs, reportCliErrors } from "../args";
import { CliError, readJsonFile, type CliIo, type Command } from "../scenario-file";

const USAGE = `Cách dùng: il judgement-eval <file .jsonl> [--kind ${SET_KINDS.join("|")}] [--scenario <file>] [--batch] [--concurrency N]`;
const DEFAULT_SCENARIO = "scenarios/ux-chi-tieu/chi-thu.json";
/** The header's scenario note for kinds that do not use `--scenario`: their cases each name their own, or use none. */
const SCENARIO_NOTE: Partial<Record<SetKind, string>> = {
  "qa-plan": "mỗi ca một kịch bản riêng",
  "topic-route": "mỗi ca một kịch bản riêng",
  "guide-check": "không dùng kịch bản",
};
/** A batch job holds up to 200 calls, so a whole starter set fits in one. */
const MAX_CONCURRENCY = 64;

/** Loads and validates every scenario file the cases name, once each. */
async function loadScenarios(cases: { scenario: string }[]): Promise<Map<string, Scenario>> {
  const scenarios = new Map<string, Scenario>();
  for (const path of new Set(cases.map((entry) => entry.scenario))) {
    const loaded = validateScenario(await readJsonFile(path)).scenario;
    if (!loaded) throw new CliError(`Kịch bản "${path}" không qua validate.`);
    scenarios.set(path, loaded);
  }
  return scenarios;
}

/**
 * `judgement-eval <set>` (NFR-7): runs a hand-labelled test set through the production prompt and
 * prints each rate against its hard gate. Exit code 1 when a gate is missed, 2 when every rate
 * passes but the set is smaller than NFR-7 requires, 0 when the gate is proven. With `--batch` the
 * Gemini calls go through Batch Mode at half price, all cases at once; a run then takes minutes.
 */
export function runJudgementEval(
  args: string[],
  io: CliIo,
  llmDeps?: Partial<CallModelDeps>,
  batchCollector?: (onJob: BatchCollectorOptions["onJob"]) => GeminiBatchCollector,
): Promise<number> {
  return reportCliErrors(io, async () => {
    const { positional, values, switches } = parseArgs(args, { values: ["kind", "scenario", "concurrency"], switches: ["batch"] });
    const [file] = positional;
    if (!file || positional.length !== 1) throw new CliError(USAGE);
    const batch = switches.has("batch");
    const concurrency = intOption(values.concurrency, "concurrency", { min: 1, max: MAX_CONCURRENCY, fallback: batch ? MAX_CONCURRENCY : 1 });

    const kind = (values.kind ?? basename(file).replace(/\.jsonl$/u, "")) as SetKind;
    if (!SET_KINDS.includes(kind)) {
      throw new CliError(`Không biết loại bộ thử "${kind}". Đặt tên file theo loại hoặc dùng --kind (${SET_KINDS.join(", ")}).`);
    }
    const scenarioFile = values.scenario ?? DEFAULT_SCENARIO;
    const { scenario } = validateScenario(await readJsonFile(scenarioFile));
    if (!scenario) throw new CliError(`Kịch bản "${scenarioFile}" không qua validate.`);

    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new CliError(`Không đọc được file "${file}".`);
    }

    let callDeps = llmDeps;
    if (batch) {
      if (!batchCollector) throw new CliError("Không có kênh batch: chạy không có --batch.");
      const onJob: BatchCollectorOptions["onJob"] = (job) => io.out(`  [batch] ${job.job}: ${job.requests} lần gọi, ${job.state} (${new Date().toLocaleTimeString("vi-VN")})`);
      let collector: GeminiBatchCollector;
      try {
        collector = batchCollector(onJob);
      } catch (error) {
        throw new CliError(`Không tạo được kênh batch: ${(error as Error).message}. Đặt GOOGLE_API_KEY_BATCH hoặc GOOGLE_API_KEY, hoặc chạy không có --batch.`);
      }
      callDeps = batchLlmDeps(collector, llmDeps);
    }

    const options = { scope: { scope: "eval" as const }, llmDeps: callDeps, concurrency };
    try {
      const runs: Record<SetKind, () => Promise<SetScore>> = {
        "label-classifier": () => runLabelSet(scenario, parseTestSet(raw, labelCaseSchema), options),
        "turn-verdict": () => runVerdictSet(scenario, parseTestSet(raw, verdictCaseSchema), options),
        "canvas-judge": () => runCanvasSet(scenario, parseTestSet(raw, canvasCaseSchema), options),
        "leading-novelty": () => runNoveltySet(scenario, parseTestSet(raw, noveltyCaseSchema), options),
        moderation: () => runModerationSet(parseTestSet(raw, moderationCaseSchema), options),
        "output-safety": () => runSafetySet(scenario, parseTestSet(raw, safetyCaseSchema), options),
        "reply-judge": () => runReplyJudgeSet(scenario, parseTestSet(raw, replyJudgeCaseSchema), options),
        "guide-check": () => runGuideSet(parseTestSet(raw, guideCaseSchema), options),
        "qa-plan": async () => {
          const cases = parseTestSet(raw, qaPlanCaseSchema);
          return runQaPlanSet(cases, await loadScenarios(cases), options);
        },
        "topic-route": async () => {
          const cases = parseTestSet(raw, routeCaseSchema);
          return runTopicRouteSet(cases, await loadScenarios(cases), options);
        },
      };
      const score = await runs[kind]();
      io.out(`Bộ thử ${kind}: ${score.size} ca, ${SCENARIO_NOTE[kind] ?? `kịch bản ${scenario.persona_id}`}`);
      for (const line of formatScore(score)) io.out(line);
      return judgementExitCode(score);
    } catch (error) {
      if (!(error instanceof TestSetError)) throw error;
      throw new CliError(`${file}: ${error.message}`);
    }
  });
}

export function judgementEvalCommand(
  llmDeps: () => Partial<CallModelDeps>,
  batchCollector?: (onJob: BatchCollectorOptions["onJob"]) => GeminiBatchCollector,
): Command {
  return {
    usage: "judgement-eval <file>",
    summary: "Chạy bộ thử gán tay qua prompt production và in các tỉ lệ NFR-7.",
    run: (args, io) => runJudgementEval(args, io, llmDeps(), batchCollector),
  };
}
