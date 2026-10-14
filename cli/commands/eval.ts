import { eq } from "drizzle-orm";
import { MAX_TURNS } from "@/config/limits";
import type { Database } from "@/db/client";
import {
  createEvalRun,
  finishEvalRun,
  finishQaRun,
  getEvalRun,
  listEpisodes,
  lockEvalRun,
  markEvalRunFailed,
  markEvalRunRunning,
  saveEpisode,
} from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { getConfig } from "@/db/repo/config";
import { dbToolCache } from "@/db/repo/eval-tool-cache";
import { scenarios } from "@/db/schema";
import { IsolationError } from "@/eval/isolation";
import { formatQaReport } from "@/eval/qa/format";
import { buildReport, formatReport } from "@/eval/report";
import { RateLimitError } from "@/eval/run-episode";
import { episodeSpecs, estimateRun, runEpisodes } from "@/eval/run-eval";
import type { EpisodeResult } from "@/eval/types";
import { Budget, BudgetExceededError, runQaAgent } from "@/graphs/qa-agent-graph";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import { batchLlmDeps, type BatchCollectorOptions, type GeminiBatchCollector } from "@/llm/gemini-batch";
import type { Role, RoleSpec } from "@/llm/roles";
import { isUuid } from "@/server/uuid";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE =
  "Cách dùng: il eval <persona> [--profile lean|quick|full] [--fast] [--no-cache] [--turns N] [--concurrency N] [--yes] [--trace] | il eval --resume <id lần chạy>";

/** Calls one Gemini batch job carries at most in a lean run: the probes of a round run together. */
const LEAN_BATCH_CONCURRENCY = 64;

export type EvalCommandDeps = {
  /** Which model each role runs on, for the cost estimate. */
  roleSpec: (role: Role) => RoleSpec;
  /** How the run calls models: provider clients and the `llm_call` writer. */
  llmDeps?: Partial<CallModelDeps>;
  /** Asks the operator to go ahead with a paid run. */
  confirm: (question: string) => Promise<boolean>;
  /** Turns LangSmith tracing on or off for this process. */
  setTracing: (on: boolean) => void;
  rateLimitDelaysMs?: number[];
  /** The Gemini batch collector a lean run sends its calls through unless `--fast` is given. */
  batchCollector?: (onJob: BatchCollectorOptions["onJob"]) => GeminiBatchCollector;
};

const progress = (result: EpisodeResult) =>
  `${result.key}: ${result.turns.length} lượt, mở ${result.openedItemIds.length} item, ${result.flags.length} cờ, ${result.costUsd.toFixed(4)} USD`;

/**
 * `eval <persona>` (FR-34): plays simulated interviews against the newest version of a persona
 * and stores the report. `quick` is one good and one bad run for tuning; `full` is the run the
 * publish gate needs, and asks before spending. Each finished episode is stored at once, so a run
 * that stops is continued with `--resume` instead of being paid for again.
 */
export function runEval(args: string[], io: CliIo, db: Database | null, deps: EvalCommandDeps): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("eval"));
    const { positional, values, switches } = parseArgs(args, {
      values: ["profile", "turns", "concurrency", "resume"],
      switches: ["yes", "trace", "fast", "no-cache"],
    });
    // Episodes run their calls directly: more than 16 at once only meets rate limits. A lean batch run gathers more per job.
    const leanProfile = (values.profile ?? "quick") === "lean" && values.resume === undefined;
    const concurrency = intOption(values.concurrency, "concurrency", { min: 1, max: leanProfile ? LEAN_BATCH_CONCURRENCY : 16, fallback: 4 });

    let run = null;
    let scenarioRow;
    if (values.resume !== undefined) {
      if (positional.length > 0 || values.profile !== undefined || values.turns !== undefined) throw new CliError(USAGE);
      run = isUuid(values.resume) ? await getEvalRun(db, values.resume) : null;
      if (!run) throw new CliError(`Không tìm thấy lần chạy eval ${values.resume}.`);
      if (run.status === "done") throw new CliError(`Lần chạy ${run.id} đã hoàn tất.`);
      if (run.failureReason === "isolation") {
        throw new CliError(`Lần chạy ${run.id} dừng vì cô lập context bị vỡ: không chạy tiếp được. Sửa lỗi rồi chạy một lần eval mới.`);
      }
      [scenarioRow] = await db.select().from(scenarios).where(eq(scenarios.id, run.scenarioId));
    } else {
      if (positional.length !== 1) throw new CliError(USAGE);
      scenarioRow = (await getScenarioByPersona(db, positional[0]))?.scenario;
      if (!scenarioRow) throw new CliError(`Không tìm thấy persona "${positional[0]}". Nhập kịch bản bằng il import trước.`);
    }

    const profile = run?.profile ?? values.profile ?? "quick";
    if (profile === "lean") {
      if (run) throw new CliError("Lần eval lean không chạy tiếp được: chạy một lần mới.");
      if (values.turns !== undefined) throw new CliError("Eval lean không dùng --turns: agent tự chọn phép thử.");
      deps.setTracing(switches.has("trace"));
      const batch = !switches.has("fast");
      return runLean(db, io, deps, scenarioRow, {
        batch,
        refreshCache: switches.has("no-cache"),
        concurrency: values.concurrency === undefined && batch ? LEAN_BATCH_CONCURRENCY : concurrency,
      });
    }
    if (profile !== "quick" && profile !== "full") throw new CliError("--profile phải là lean, quick hoặc full.");
    if (profile === "full" && values.turns !== undefined) {
      throw new CliError(`Eval đầy đủ luôn chạy ${MAX_TURNS} lượt mỗi episode: không dùng --turns với --profile full.`);
    }
    const turns = run?.turns ?? intOption(values.turns, "turns", { min: 1, max: MAX_TURNS, fallback: MAX_TURNS });
    const specs = episodeSpecs(profile, turns);
    const scenario = scenarioRow.content;

    const done = run ? await listEpisodes(db, run.id) : [];
    const remaining = specs.filter((spec) => !done.some((episode) => episode.key === spec.key));
    const estimate = estimateRun(remaining, deps.roleSpec);
    io.out(
      `Eval ${profile} cho ${scenarioRow.personaId} phiên bản ${scenarioRow.version}: ${remaining.length} episode × ${turns} lượt, khoảng ${estimate.calls} call, ước tính ${estimate.usd.toFixed(2)} USD (chưa đo).`,
    );
    if (profile === "quick") io.out("Lần chạy nhanh chỉ để tinh chỉnh: không bao giờ dùng được cho cổng publish.");
    if (profile === "full" && !switches.has("yes") && !(await deps.confirm("Chạy eval đầy đủ với chi phí trên? (gõ yes để chạy) "))) {
      io.out("Đã hủy: không gọi model nào.");
      return 1;
    }

    deps.setTracing(switches.has("trace"));
    run ??= await createEvalRun(db, {
      scenarioId: scenarioRow.id,
      version: scenarioRow.version,
      profile,
      turns,
      costEstimateUsd: estimate.usd,
    });
    const runId = run.id;
    if (!(await lockEvalRun(db, runId))) throw new CliError(`Lần chạy ${runId} đang được một lệnh eval khác chạy.`);
    await markEvalRunRunning(db, runId);
    io.out(`Lần chạy ${runId}`);

    let finished = done.length;
    try {
      await runEpisodes(scenario, remaining, {
        runId,
        concurrency,
        llmDeps: deps.llmDeps,
        rateLimitDelaysMs: deps.rateLimitDelaysMs,
        onEpisode: async (result) => {
          await saveEpisode(db, runId, result);
          finished += 1;
          io.out(`[${finished}/${specs.length}] ${progress(result)}`);
        },
      });
    } catch (error) {
      await markEvalRunFailed(db, runId, error instanceof IsolationError ? "isolation" : "model");
      if (error instanceof IsolationError) {
        io.err(`Eval dừng: cô lập context bị vỡ. ${error.message}`);
        io.err("Lần chạy này không chạy tiếp được: đây là lỗi của engine, không phải lỗi model.");
        return 1;
      }
      if (!(error instanceof RateLimitError) && !(error instanceof LlmCallError)) throw error;
      const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
      io.err(
        error instanceof RateLimitError
          ? "Eval dừng: nhà cung cấp vẫn báo quá giới hạn (429) sau nhiều lần chờ. Giảm --concurrency hoặc dùng key trả phí."
          : `Eval dừng: ${error.message}. ${cause}`,
      );
      io.err(`Đã lưu ${finished}/${specs.length} episode. Chạy tiếp: il eval --resume ${runId}`);
      return 1;
    }

    const episodes = await listEpisodes(db, runId);
    const report = buildReport(scenario, { profile, turns, estimateUsd: run.costEstimateUsd }, episodes);
    await finishEvalRun(db, runId, report, episodes);
    for (const line of formatReport(report)) io.out(line);
    const flags = report.leaks.learner.flags + report.leaks.adversarial.flags;
    if (profile === "full" && flags > 0) io.out(`${flags} cờ rò rỉ chờ phân xử: il adjudicate list ${scenarioRow.personaId}`);
    return 0;
  });
}

/**
 * `eval <persona> --profile lean`: the persona QA agent, under the budget cap in config. It asks
 * nothing before spending: the cap bounds the run. By default every Gemini call goes through
 * Batch Mode at half price and the run takes minutes to hours; `--fast` calls the models directly.
 * Probes that already ran on the same content and models come from the cache unless `--no-cache`.
 */
async function runLean(
  db: Database,
  io: CliIo,
  deps: EvalCommandDeps,
  scenarioRow: typeof scenarios.$inferSelect,
  mode: { batch: boolean; refreshCache: boolean; concurrency: number },
): Promise<number> {
  if (mode.batch && !deps.batchCollector) throw new CliError("Không có kênh batch: chạy với --fast.");
  let llmDeps = deps.llmDeps;
  if (mode.batch) {
    const onJob: BatchCollectorOptions["onJob"] = (job) => io.out(`  [batch] ${job.job}: ${job.requests} lần gọi, ${job.state} (${new Date().toLocaleTimeString("vi-VN")})`);
    let collector: GeminiBatchCollector;
    try {
      collector = deps.batchCollector!(onJob);
    } catch (error) {
      throw new CliError(`Không tạo được kênh batch: ${(error as Error).message}. Đặt GOOGLE_API_KEY_BATCH hoặc GOOGLE_API_KEY, hoặc chạy với --fast.`);
    }
    llmDeps = batchLlmDeps(collector, deps.llmDeps);
  }
  const capUsd = await getConfig(db, "eval_lean_budget_usd");
  const run = await createEvalRun(db, { scenarioId: scenarioRow.id, version: scenarioRow.version, profile: "lean", turns: 0, costEstimateUsd: capUsd });
  if (!(await lockEvalRun(db, run.id))) throw new CliError(`Lần chạy ${run.id} đang được một lệnh eval khác chạy.`);
  io.out(
    `Eval lean cho ${scenarioRow.personaId} phiên bản ${scenarioRow.version}, trần ${capUsd.toFixed(2)} USD, ${mode.batch ? "batch (rẻ một nửa, có thể mất vài phút tới vài giờ)" : "gọi trực tiếp (--fast)"}${mode.refreshCache ? ", chạy lại mọi phép thử và ghi đè cache" : ""}. Lần chạy ${run.id}`,
  );
  try {
    const report = await runQaAgent(scenarioRow.content, {
      runId: run.id,
      version: scenarioRow.version,
      budget: new Budget(capUsd),
      llmDeps,
      concurrency: mode.concurrency,
      toolCache: dbToolCache(db),
      refreshCache: mode.refreshCache,
      rateLimitDelaysMs: deps.rateLimitDelaysMs,
    });
    await finishQaRun(db, run.id, report);
    for (const line of formatQaReport(report)) io.out(line);
    if (report.leaks.length > 0) io.out(`${report.leaks.length} cờ rò rỉ chờ phân xử: il adjudicate list ${scenarioRow.personaId}`);
    return 0;
  } catch (error) {
    await markEvalRunFailed(db, run.id, error instanceof IsolationError ? "isolation" : error instanceof BudgetExceededError ? "budget" : "model");
    if (error instanceof IsolationError) {
      io.err(`Eval dừng: cô lập context bị vỡ. ${error.message}`);
      return 1;
    }
    if (error instanceof BudgetExceededError) {
      io.err(`Eval lean dừng vì ngân sách: ${error.message}. Tăng eval_lean_budget_usd (il config set) nếu persona cần nhiều phép thử hơn.`);
      return 1;
    }
    if (!(error instanceof RateLimitError) && !(error instanceof LlmCallError)) throw error;
    io.err(`Eval lean dừng: ${error.message}`);
    return 1;
  }
}

export function evalCommand(db: Database | null, deps: () => EvalCommandDeps): Command {
  return {
    usage: "eval <persona>",
    summary: "Kiểm một persona: lean (agent QA, rẻ) hoặc phỏng vấn mô phỏng quick/full; lưu báo cáo.",
    run: (args, io) => runEval(args, io, db, deps()),
  };
}
