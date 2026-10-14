import type { Database } from "@/db/client";
import { evalRunCosts, sessionCostStats, spendByDay, spendByRole, tokensByTurn } from "@/db/repo/cost-report";
import { isUuid } from "@/server/uuid";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const usd = (value: number) => `${value.toFixed(4)} USD`;
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

/**
 * `cost-report [--days n] [--run <id>]`: where the LLM money went, read from `llm_call`. With
 * `--run`, only the cost of that evaluation run. Calls no model and writes nothing.
 */
export async function runCostReport(args: string[], io: CliIo, db: Database | null): Promise<number> {
  return reportCliErrors(io, async () => {
    const { values } = parseArgs(args, { values: ["days", "run"] as const });
    if (!db) {
      io.err(needsDb("cost-report"));
      return 1;
    }
    const days = intOption(values.days, "days", { min: 1, max: 365, fallback: 7 });
    const window = { days };

    if (values.run !== undefined) {
      if (!isUuid(values.run)) throw new CliError(`"${values.run}" không phải id của một lần eval.`);
      const runs = await evalRunCosts(db, { ...window, runId: values.run });
      if (runs.length === 0) {
        io.err(`Không có lần eval "${values.run}".`);
        return 1;
      }
      printEvalRuns(io, runs);
      return 0;
    }

    const [byRole, byDay, sessions, runs, turns] = await Promise.all([
      spendByRole(db, window),
      spendByDay(db, window),
      sessionCostStats(db, window),
      evalRunCosts(db, window),
      tokensByTurn(db, window),
    ]);

    io.out(`Chi phí LLM ${days} ngày gần nhất (UTC+7, tính cả hôm nay)`);
    io.out("");
    io.out("Theo scope / role / model:");
    for (const row of byRole) {
      io.out(
        `  ${row.scope.padEnd(10)} ${row.role.padEnd(20)} ${row.model.padEnd(22)} ${String(row.calls).padStart(6)} lần gọi` +
          `  lỗi ${share(row.failedCalls, row.calls).padStart(4)}  cache ${share(row.tokensCached, row.tokensIn).padStart(4)}` +
          `  in ${Math.round(row.tokensIn)}  out ${Math.round(row.tokensOut)} (suy luận ${Math.round(row.tokensReasoning)})  ${usd(row.usd)}`,
      );
    }
    if (byRole.length === 0) io.out("  (không có lần gọi nào)");

    io.out("");
    io.out("Theo ngày (UTC+7), gồm cả chi phí của tài khoản đã xóa:");
    for (const row of byDay) io.out(`  ${row.day}  ${row.scope.padEnd(10)} ${usd(row.usd)}`);
    if (byDay.length === 0) io.out("  (không có)");

    io.out("");
    io.out(
      `Phiên phỏng vấn: ${sessions.sessions} phiên, trung bình ${usd(sessions.avgUsd)}, p50 ${usd(sessions.p50Usd)}, ` +
        `p95 ${usd(sessions.p95Usd)}, trung bình ${sessions.avgTurns.toFixed(1)} lượt`,
    );

    io.out("");
    io.out("Token trung bình mỗi lần gọi, theo lượt (phiên phỏng vấn):");
    for (const row of turns) {
      io.out(
        `  lượt ${String(row.turnIndex).padStart(2)}  ${row.role.padEnd(14)} in ${Math.round(row.avgTokensIn)}` +
          `  cache ${Math.round(row.avgTokensCached)}  out ${Math.round(row.avgTokensOut)}  (${row.calls} lần gọi)`,
      );
    }
    if (turns.length === 0) io.out("  (không có)");

    io.out("");
    printEvalRuns(io, runs);
    return 0;
  });
}

function printEvalRuns(io: CliIo, runs: Awaited<ReturnType<typeof evalRunCosts>>): void {
  io.out("Các lần eval:");
  for (const run of runs) {
    io.out(
      `  ${run.runId}  ${run.personaId} v${run.version}  ${run.profile.padEnd(7)} ${run.status.padEnd(7)}` +
        `  ${run.calls} lần gọi (lỗi ${run.failedCalls})  thực ${usd(run.usd)}  ước tính ${usd(run.estimateUsd)}  ${run.createdAt}`,
    );
  }
  if (runs.length === 0) io.out("  (không có)");
}

export function costReportCommand(db: Database | null): Command {
  return {
    usage: "cost-report [--days n] [--run <id>]",
    summary: "Chi phí LLM theo scope, role, ngày, phiên và lần eval (không gọi model).",
    run: (args, io) => runCostReport(args, io, db),
  };
}
