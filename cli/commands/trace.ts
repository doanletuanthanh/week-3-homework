import type { Database } from "@/db/client";
import { loadSessionTrace, logAdminAccess } from "@/db/repo/turns";
import { describeTrace } from "@/server/session-trace";
import { isUuid } from "@/server/uuid";
import { CliError, type CliIo, type Command } from "../scenario-file";

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

    const { title, turns } = describeTrace(trace);
    io.out(title);
    for (const turn of turns) {
      io.out("");
      io.out(turn.title);
      for (const line of turn.lines) {
        if (line.items) {
          io.out(`  ${line.label}:`);
          for (const item of line.items) io.out(`    - ${item}`);
        } else io.out(line.label ? `  ${line.label}: ${line.text}` : `  ${line.text}`);
      }
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
