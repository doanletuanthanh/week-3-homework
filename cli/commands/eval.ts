import type { Database } from "@/db/client";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { getConfig } from "@/db/repo/config";
import type { scenarios } from "@/db/schema";
import { IsolationError } from "@/eval/isolation";
import { formatQaReport } from "@/eval/qa/format";
import { RateLimitError } from "@/eval/rate-limit";
import { BudgetExceededError } from "@/graphs/qa-agent-graph";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import { batchLlmDeps, type BatchCollectorOptions, type GeminiBatchCollector } from "@/llm/gemini-batch";
import { runEvalJob, startLeanEval, type StartLeanEvalResult } from "@/server/eval-job";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE = "Cách dùng: il eval <persona> [--profile lean] [--fast] [--no-cache] [--concurrency N] [--trace]";

/** Calls one Gemini batch job carries at most in a lean run: the probes of a round run together. */
const LEAN_BATCH_CONCURRENCY = 64;

export type EvalCommandDeps = {
  /** How the run calls models: provider clients and the `llm_call` writer. */
  llmDeps?: Partial<CallModelDeps>;
  /** Turns LangSmith tracing on or off for this process. */
  setTracing: (on: boolean) => void;
  rateLimitDelaysMs?: number[];
  /** The Gemini batch collector a lean run sends its calls through unless `--fast` is given. */
  batchCollector?: (onJob: BatchCollectorOptions["onJob"]) => GeminiBatchCollector;
};

/**
 * `eval <persona>` (FR-34): runs the persona QA agent on the newest version of a persona and
 * stores its report. `lean` is the only profile; `--profile lean` is still accepted, so older
 * notes keep working. The simulated-interview profiles (`quick`, `full`, `reduced`) are gone:
 * their stored runs stay readable, but nothing runs them.
 */
export function runEval(args: string[], io: CliIo, db: Database | null, deps: EvalCommandDeps): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("eval"));
    const { positional, values, switches } = parseArgs(args, {
      values: ["profile", "concurrency"],
      switches: ["trace", "fast", "no-cache"],
    });
    if (values.profile !== undefined && values.profile !== "lean") {
      throw new CliError(`--profile ${values.profile} không còn: chỉ còn eval lean (agent QA).`);
    }
    if (positional.length !== 1) throw new CliError(USAGE);
    const concurrency = intOption(values.concurrency, "concurrency", { min: 1, max: LEAN_BATCH_CONCURRENCY, fallback: 4 });
    const scenarioRow = (await getScenarioByPersona(db, positional[0]))?.scenario;
    if (!scenarioRow) throw new CliError(`Không tìm thấy persona "${positional[0]}". Nhập kịch bản bằng il import trước.`);

    deps.setTracing(switches.has("trace"));
    const batch = !switches.has("fast");
    return runLean(db, io, deps, scenarioRow, {
      batch,
      refreshCache: switches.has("no-cache"),
      concurrency: values.concurrency === undefined && batch ? LEAN_BATCH_CONCURRENCY : concurrency,
    });
  });
}

/**
 * The persona QA agent, under the budget cap in config. It asks
 * nothing before spending: the cap bounds the run, and the daily eval budget bounds the day. By
 * default every Gemini call goes through Batch Mode at half price and the run takes minutes to
 * hours; `--fast` calls the models directly. Probes that already ran on the same content and
 * models come from the cache unless `--no-cache`. The run is the same job the admin page starts:
 * a lean run of the version that lost its runner is finished here instead of starting another.
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
  const started = await startLeanEval(db, scenarioRow.id, null);
  if (!started.ok) throw new CliError(LEAN_REFUSAL[started.reason](scenarioRow.personaId));
  const capUsd = await getConfig(db, "eval_lean_budget_usd");
  io.out(
    `Eval lean cho ${scenarioRow.personaId} phiên bản ${scenarioRow.version}, trần ${capUsd.toFixed(2)} USD, ${mode.batch ? "batch (rẻ một nửa, có thể mất vài phút tới vài giờ)" : "gọi trực tiếp (--fast)"}${mode.refreshCache ? ", chạy lại mọi phép thử và ghi đè cache" : ""}. Lần chạy ${started.runId}${started.resumed ? " (chạy tiếp lần trước bị dừng giữa chừng)" : ""}`,
  );
  const result = await runEvalJob(db, started.runId, {
    llmDeps,
    concurrency: mode.concurrency,
    refreshCache: mode.refreshCache,
    rateLimitDelaysMs: deps.rateLimitDelaysMs,
    runLimitMs: null,
  });
  if (result.outcome === "done") {
    for (const line of formatQaReport(result.report)) io.out(line);
    if (result.report.leaks.length > 0) io.out(`${result.report.leaks.length} cờ rò rỉ chờ phân xử: il adjudicate list ${scenarioRow.personaId}`);
    return 0;
  }
  if (result.outcome !== "failed") throw new CliError(`Lần chạy ${started.runId} đang được một lệnh eval khác chạy.`);
  const { error } = result;
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

const LEAN_REFUSAL: Record<Exclude<StartLeanEvalResult, { ok: true }>["reason"], (personaId: string) => string> = {
  not_found: (personaId) => `Không tìm thấy persona "${personaId}".`,
  running: (personaId) => `${personaId} đang có một lần eval lean chạy: chờ nó xong.`,
  over_budget: () => "Ngân sách eval hôm nay không đủ cho thêm một lần eval lean. Chờ sang ngày, hoặc tăng eval_daily_budget_usd (il config set).",
};

export function evalCommand(db: Database | null, deps: () => EvalCommandDeps): Command {
  return {
    usage: "eval <persona>",
    summary: "Kiểm một persona bằng agent QA (eval lean, dưới 0,1 USD); lưu báo cáo.",
    run: (args, io) => runEval(args, io, db, deps()),
  };
}
