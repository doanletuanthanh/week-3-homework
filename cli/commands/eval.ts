import { eq } from "drizzle-orm";
import { MAX_TURNS } from "@/config/limits";
import type { Database } from "@/db/client";
import {
  createEvalRun,
  finishEvalRun,
  getEvalRun,
  listEpisodes,
  lockEvalRun,
  markEvalRunFailed,
  markEvalRunRunning,
  saveEpisode,
} from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { scenarios } from "@/db/schema";
import { IsolationError } from "@/eval/isolation";
import { buildReport, formatReport } from "@/eval/report";
import { RateLimitError } from "@/eval/run-episode";
import { episodeSpecs, estimateRun, runEpisodes } from "@/eval/run-eval";
import type { EpisodeResult } from "@/eval/types";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import type { Role, RoleSpec } from "@/llm/roles";
import { isUuid } from "@/server/uuid";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE =
  "Cách dùng: il eval <persona> [--profile quick|full] [--turns N] [--concurrency N] [--yes] [--trace] | il eval --resume <id lần chạy>";

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
      switches: ["yes", "trace"],
    });
    const concurrency = intOption(values.concurrency, "concurrency", { min: 1, max: 16, fallback: 4 });

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
    if (profile !== "quick" && profile !== "full") throw new CliError("--profile phải là quick hoặc full.");
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

export function evalCommand(db: Database | null, deps: () => EvalCommandDeps): Command {
  return {
    usage: "eval <persona>",
    summary: "Chạy phỏng vấn mô phỏng (quick hoặc full) và lưu báo cáo FR-34.",
    run: (args, io) => runEval(args, io, db, deps()),
  };
}
