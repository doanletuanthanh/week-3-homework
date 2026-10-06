import type { Database } from "@/db/client";
import { loadSessionTrace, logAdminAccess } from "@/db/repo/turns";
import { isUuid } from "@/server/uuid";
import { CliError, type CliIo, type Command } from "../scenario-file";

const OUTCOME_TEXT = { satisfied: "thỏa", not_satisfied: "không thỏa", prerequisite_locked: "tiên quyết còn khóa" } as const;
const none = (values: string[]) => (values.length > 0 ? values.join(", ") : "(không)");

/**
 * `trace <session>` (FR-44): prints, turn by turn, what the engine saw and decided: the learner
 * question, Call 1 output, the verdict for the previous turn, the corrections code made, the
 * unlock rules that ran, the item opened, the hook selected with its verdict, and openness before
 * and after. Reads stored data only (no model call) and records the access.
 */
export async function runTrace(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  const [sessionId] = args;
  if (!sessionId || args.length !== 1) {
    io.err("Cách dùng: il trace <id buổi>");
    return 1;
  }
  if (!db) {
    io.err("Lệnh trace cần cơ sở dữ liệu: đặt DATABASE_URL_DIRECT (hoặc DATABASE_URL) trong .env.local.");
    return 1;
  }
  try {
    const email = operator();
    if (!isUuid(sessionId)) throw new CliError(`"${sessionId}" không phải id buổi.`);
    const trace = await loadSessionTrace(db, sessionId);
    if (!trace) throw new CliError(`Không tìm thấy buổi ${sessionId}.`);
    // Logged before anything is shown: the access happened even if printing fails.
    await logAdminAccess(db, { adminEmail: email, channel: "cli", sessionId, userId: trace.session.userId, action: "trace" });

    const { session, scenario, turns } = trace;
    const state = session.endedAt ? `${session.status}, đã kết thúc` : session.status;
    io.out(`Buổi ${session.id} · ${scenario.personaId} phiên bản ${scenario.version} · ${state} · ${turns.length - 1} lượt`);

    for (const [position, { turn, snapshot }] of turns.entries()) {
      io.out("");
      if (turn.index === 0) {
        io.out(`Lượt 0 (lời mở đầu, không gọi LLM)`);
        io.out(`  Persona: ${turn.personaText}`);
        io.out(`  Openness: ${snapshot.openness}`);
        continue;
      }
      const decision = turn.decisionJson;
      const previous = turns[position - 1].turn;
      io.out(`Lượt ${turn.index}`);
      io.out(`  Người học: ${turn.learnerText}`);
      io.out(`  Call 1: ${turn.analysisJson ? JSON.stringify(turn.analysisJson) : "(không lưu)"}`);
      io.out(
        previous.verdictJson
          ? `  Verdict cho lượt ${previous.index}: hook đã thả = ${previous.verdictJson.hook_dropped}; đã kể = ${none(previous.verdictJson.disclosed_item_ids)}; vi phạm = ${none(previous.verdictJson.violations)}`
          : `  Verdict cho lượt ${previous.index}: (không áp dụng)`,
      );
      if (!decision) {
        io.out("  (Lượt này được ghi trước khi có engine: không có phân tích.)");
      } else {
        io.out(decision.corrections.length === 0 ? "  Sửa của code: (không)" : "  Sửa của code:");
        for (const fix of decision.corrections) {
          io.out(`    - ${fix.field}: ${JSON.stringify(fix.from)} → ${JSON.stringify(fix.to)} (${fix.reason})`);
        }
        const { analysis } = decision;
        io.out(
          `  Sau khi kiểm: nhãn = ${analysis.label}; loại = ${analysis.question_type}; grounded_turn_id = ${analysis.grounded_turn_id}; introduced_span = ${JSON.stringify(analysis.introduced_span)}; hook = ${analysis.hook_item_id}; tag = ${analysis.tag_item_id}`,
        );
        io.out("  Luật mở khóa:");
        for (const rule of decision.rules) io.out(`    - ${rule.itemId} [${rule.path}]: ${OUTCOME_TEXT[rule.outcome]}`);
        io.out(`  Item mở: ${decision.unlockedItemId ?? "(không)"}`);
        const hookVerdict = turn.verdictJson ? (turn.verdictJson.hook_dropped ? "đã thả" : "chưa thả") : "chưa có verdict";
        io.out(`  Hook được chọn: ${turn.hookSelected ? `${turn.hookSelected} (${hookVerdict})` : "(không)"}`);
        io.out(`  Openness: ${decision.opennessBefore} → ${decision.opennessAfter}`);
      }
      io.out(`  Persona: ${turn.personaText}${turn.flagged ? "  [GẮN CỜ: vi phạm do-not-assert]" : ""}`);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    io.err(error.message);
    return 1;
  }
}

export function traceCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "trace <id buổi>",
    summary: "In từng lượt của một buổi: phân tích, luật mở khóa, hook, openness.",
    run: (args, io) => runTrace(args, io, db, operator),
  };
}
