import type { Database } from "@/db/client";
import { getFlag, latestLeanRun, listEpisodes, listFlags, saveAdjudication, type FlagWithRulings } from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { flagStatus, type FlagStatus } from "@/eval/publish-gate";
import { isEpisodeReport } from "@/eval/types";
import { isUuid } from "@/server/uuid";
import { needsDb, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE =
  'Cách dùng: il adjudicate list <persona> | il adjudicate show <id cờ> | il adjudicate <id cờ> leak|not-leak "<lý do>"';

const STATUS_TEXT: Record<FlagStatus, string> = {
  open: "chưa phân xử",
  dismissed: "đã đóng: không phải rò rỉ",
  confirmed: "rò rỉ đã xác nhận",
};
const VERDICT_TEXT = { leak: "rò rỉ", not_leak: "không phải rò rỉ" } as const;
const KIND_TEXT = { content: "nội dung item chưa mở", topic: "nêu chủ đề còn khóa" } as const;

function printFlag(io: CliIo, { flag }: FlagWithRulings): void {
  io.out(`Cờ ${flag.id}`);
  io.out(`  ${flag.turn > 0 ? `Episode ${flag.episode}, lượt ${flag.turn}` : `Câu trả lời ${flag.episode}`}, item ${flag.itemId} (${KIND_TEXT[flag.kind]})`);
  io.out(`  Trích: ${flag.excerpt}`);
  io.out(`  Hook được phép: ${flag.allowedHooks.length > 0 ? flag.allowedHooks.map((line) => `"${line}"`).join("; ") : "(không có)"}`);
  io.out(`  Lý do của judge: ${flag.judgeReason}`);
}

/** Every ruling, oldest first, and where the flag stands: the latest ruling counts. */
function printRulings(io: CliIo, entry: Pick<FlagWithRulings, "rulings">): void {
  for (const ruling of entry.rulings) io.out(`  ${ruling.adminEmail}: ${VERDICT_TEXT[ruling.verdict]}. ${ruling.reason}`);
  io.out(`  Trạng thái: ${STATUS_TEXT[flagStatus(entry.rulings)]}`);
}

/** The question and the reply a flag is about: a turn of a full run, or a probe reply of a lean run. */
async function exchangeOf(db: Database, found: NonNullable<Awaited<ReturnType<typeof getFlag>>>) {
  const report = found.run.reportJson;
  if (report && !isEpisodeReport(report)) {
    const reply = report.observations.flatMap((observation) => observation.replies).find((candidate) => candidate.id === found.flag.episode);
    return reply ? { question: reply.question, answer: reply.personaText } : null;
  }
  const episode = (await listEpisodes(db, found.run.id)).find((candidate) => candidate.key === found.flag.episode);
  const turn = episode?.turns.find((candidate) => candidate.index === found.flag.turn);
  return turn ? { question: turn.question, answer: turn.personaText } : null;
}

/**
 * `adjudicate`: an admin rules on a leak flag of the newest lean run, with a reason. One ruling
 * settles the flag: `not-leak` clears it and `leak` blocks publishing. A ruling can be changed by
 * ruling again; every ruling is kept, so the history shows who ruled and why.
 */
export function runAdjudicate(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("adjudicate"));
    const [first, second, ...rest] = args;
    if (!first || !second) throw new CliError(USAGE);

    if (first === "list") {
      if (rest.length > 0) throw new CliError(USAGE);
      const found = await getScenarioByPersona(db, second);
      if (!found) throw new CliError(`Không tìm thấy persona "${second}".`);
      const latest = await latestLeanRun(db, found.scenario.id);
      if (!latest || latest.status !== "done") throw new CliError(`Phiên bản ${found.scenario.version} của ${second} chưa có lần eval lean nào hoàn tất.`);
      const flags = await listFlags(db, latest.id);
      const open = flags.filter((entry) => flagStatus(entry.rulings) === "open");
      io.out(`Lần chạy ${latest.id} (${latest.profile}): ${flags.length} cờ, còn ${open.length} cờ chưa phân xử.`);
      for (const entry of open) printFlag(io, entry);
      return 0;
    }

    const flagId = first === "show" ? second : first;
    const found = isUuid(flagId) ? await getFlag(db, flagId) : null;
    if (!found) throw new CliError(`Không tìm thấy cờ ${flagId}.`);
    const entry = { flag: found.flag, rulings: found.rulings };

    if (first === "show") {
      if (rest.length > 0) throw new CliError(USAGE);
      printFlag(io, entry);
      const exchange = await exchangeOf(db, found);
      if (exchange) {
        io.out(`  Người hỏi: ${exchange.question}`);
        io.out(`  Nhân vật: ${exchange.answer}`);
      }
      printRulings(io, entry);
      return 0;
    }

    const verdict = second === "leak" ? "leak" : second === "not-leak" ? "not_leak" : null;
    const reason = rest.join(" ").trim();
    if (!verdict || reason === "") throw new CliError(USAGE);
    const email = operator();
    await saveAdjudication(db, { flagId, adminEmail: email, verdict, reason });
    io.out(`Đã ghi: ${VERDICT_TEXT[verdict]}.`);
    printRulings(io, (await getFlag(db, flagId))!);
    return 0;
  });
}

export function adjudicateCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "adjudicate <list|show|id cờ>",
    summary: "Phân xử cờ rò rỉ của lần eval lean mới nhất; một phán quyết là đủ, phán quyết mới nhất có hiệu lực.",
    run: (args, io) => runAdjudicate(args, io, db, operator),
  };
}
