import type { Database } from "@/db/client";
import { listAttempts, refundFreeScenario, sweepStaleAttempts, takeDownCustomScenario } from "@/db/repo/custom-topics";
import { logAdminAccess } from "@/db/repo/turns";
import { quotaKeyOf } from "@/server/quota";
import { isUuid } from "@/server/uuid";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE =
  "Cách dùng: il custom list [--limit N] | il custom stats | il custom takedown <id kịch bản> --reason <lý do> | il custom refund <id người học>";

/** The requests the kill-switch decision of FR-56 looks at. */
export const STATS_WINDOW = 30;
/** FR-56: below this pass rate, or above this cost per playable scenario, the path is turned off for review. */
export const MIN_PASS_RATE = 0.5;
export const MAX_COST_PER_PLAYABLE_USD = 12;

type Listed = Awaited<ReturnType<typeof listAttempts>>;

/**
 * SM-10 and SM-C8 over the newest requests that passed moderation: the share that passed their
 * checks, and what one playable scenario cost with the failed tries counted in.
 */
export function customStats(rows: Listed) {
  const finished = rows.map((row) => row.attempt).filter((attempt) => attempt.outcome !== "refused" && attempt.outcome !== "running");
  const passed = finished.filter((attempt) => attempt.outcome === "passed").length;
  const costUsd = finished.reduce((sum, attempt) => sum + attempt.costActualUsd, 0);
  const passRate = finished.length === 0 ? null : passed / finished.length;
  const costPerPlayable = passed === 0 ? null : costUsd / passed;
  return {
    requests: finished.length,
    passed,
    failed: finished.filter((attempt) => attempt.outcome === "failed").length,
    systemErrors: finished.filter((attempt) => attempt.outcome === "system_error").length,
    passRate,
    costUsd,
    costPerPlayable,
    // The rule applies once the window is full; before that the numbers are only shown.
    switchOff: finished.length >= STATS_WINDOW && ((passRate !== null && passRate < MIN_PASS_RATE) || (costPerPlayable !== null && costPerPlayable > MAX_COST_PER_PLAYABLE_USD)),
  };
}

/**
 * `custom list | stats | takedown | refund` (FR-56): what C10 of the Review Console would do for
 * the custom-topic path. Every one of them reads learner data, so every one writes the access
 * log: before anything is shown, and in the same transaction as anything it changes.
 */
export function runCustom(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("custom"));
    const { positional, values } = parseArgs(args, { values: ["limit", "reason"] });
    const [action, target] = positional;
    const email = operator();

    if (action === "list" && positional.length === 1) {
      const limit = intOption(values.limit, "limit", { min: 1, max: 200, fallback: STATS_WINDOW });
      await sweepStaleAttempts(db);
      await logAdminAccess(db, { adminEmail: email, channel: "cli", action: "custom list" });
      const rows = await listAttempts(db, limit);
      if (rows.length === 0) io.out("Chưa có yêu cầu tạo chủ đề nào.");
      for (const { attempt, email: learner, problemReportedAt, sessionStatus } of rows) {
        const result = attempt.outcome === "refused" ? `từ chối (${attempt.reasonCode})` : attempt.failureCode ? `${attempt.outcome} (${attempt.failureCode})` : attempt.outcome;
        io.out(`${attempt.createdAt.toISOString()}  ${learner}  ${result}  ${attempt.costActualUsd.toFixed(4)} USD  trọng tâm ${attempt.focus}`);
        io.out(`  chủ đề: ${attempt.topicText}`);
        if (attempt.scenarioId) io.out(`  kịch bản: ${attempt.scenarioId}  buổi: ${attempt.sessionId} (${sessionStatus})  người học: ${attempt.userId}`);
        if (problemReportedAt) io.out(`  NGƯỜI HỌC BÁO LỖI lúc ${problemReportedAt.toISOString()}`);
      }
      return 0;
    }

    if (action === "stats" && positional.length === 1) {
      await sweepStaleAttempts(db);
      await logAdminAccess(db, { adminEmail: email, channel: "cli", action: "custom stats" });
      // Refusals are not requests the rule counts, so more rows are read than the window holds.
      const rows = (await listAttempts(db, 200)).filter((row) => row.attempt.outcome !== "refused" && row.attempt.outcome !== "running").slice(0, STATS_WINDOW);
      const stats = customStats(rows);
      io.out(`${stats.requests} yêu cầu gần nhất (cửa sổ ${STATS_WINDOW}): ${stats.passed} qua, ${stats.failed} trượt, ${stats.systemErrors} lỗi hệ thống.`);
      io.out(`Tỉ lệ qua: ${stats.passRate === null ? "chưa có" : `${(stats.passRate * 100).toFixed(1)}%`} (ngưỡng tắt: dưới ${MIN_PASS_RATE * 100}%).`);
      io.out(
        `Chi phí mỗi kịch bản chơi được: ${stats.costPerPlayable === null ? "chưa có kịch bản nào qua" : `${stats.costPerPlayable.toFixed(2)} USD`} (ngưỡng tắt: trên ${MAX_COST_PER_PLAYABLE_USD} USD). Tổng ${stats.costUsd.toFixed(2)} USD.`,
      );
      io.out(
        stats.switchOff
          ? "Theo FR-56 nên tắt đường này để xem lại: il config set custom_path_enabled false"
          : stats.requests < STATS_WINDOW
            ? `Chưa đủ ${STATS_WINDOW} yêu cầu để áp ngưỡng tắt.`
            : "Trong ngưỡng: không cần tắt.",
      );
      return 0;
    }

    if (action === "takedown" && positional.length === 2) {
      const reason = values.reason?.trim();
      if (!reason) throw new CliError("Gỡ kịch bản cần lý do: --reason <lý do>.");
      if (!target || !isUuid(target)) throw new CliError(`"${target}" không phải id kịch bản.`);
      const taken = await takeDownCustomScenario(db, target, (tx, ownerUserId) =>
        logAdminAccess(tx, { adminEmail: email, channel: "cli", userId: ownerUserId, action: `custom takedown ${target}: ${reason}` }),
      );
      if (!taken) throw new CliError(`Không tìm thấy kịch bản tự tạo ${target}.`);
      io.out(`Đã gỡ kịch bản ${target}. ${taken.withdrawn} buổi đang dở chuyển sang "Đã dừng".`);
      return 0;
    }

    if (action === "refund" && positional.length === 2) {
      if (!target || !isUuid(target)) throw new CliError(`"${target}" không phải id người học.`);
      // The log and the change are one transaction; a learner that does not exist rolls both back.
      await db.transaction(async (tx) => {
        const known = await refundFreeScenario(tx, target, await quotaKeyOf(tx, target));
        if (!known) throw new CliError(`Không tìm thấy người học ${target}.`);
        await logAdminAccess(tx, { adminEmail: email, channel: "cli", userId: target, action: "custom refund" });
      });
      io.out(`Đã trả lại kịch bản miễn phí cho người học ${target}.`);
      return 0;
    }

    throw new CliError(USAGE);
  });
}

export function customCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "custom <list|stats|takedown|refund>",
    summary: "Chủ đề tự tạo: xem yêu cầu, chỉ số công tắc tắt, gỡ kịch bản, trả lại kịch bản miễn phí.",
    run: (args, io) => runCustom(args, io, db, operator),
  };
}
