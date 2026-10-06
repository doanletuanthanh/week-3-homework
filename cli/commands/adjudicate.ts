import type { Database } from "@/db/client";
import { getFlag, latestFullRun, listEpisodes, listFlags, saveAdjudication, type FlagWithRulings } from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { flagStatus, type FlagStatus } from "@/eval/publish-gate";
import { isUuid } from "@/server/uuid";
import { needsDb, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE =
  'Cách dùng: il adjudicate list <persona> | il adjudicate show <id cờ> | il adjudicate <id cờ> leak|not-leak "<lý do>"';

const STATUS_TEXT: Record<FlagStatus, string> = {
  open: "chưa đủ hai phán quyết",
  dismissed: "đã đóng: không phải rò rỉ",
  confirmed: "rò rỉ đã xác nhận",
};
const VERDICT_TEXT = { leak: "rò rỉ", not_leak: "không phải rò rỉ" } as const;
const KIND_TEXT = { content: "nội dung item chưa mở", topic: "nêu chủ đề còn khóa" } as const;

function printFlag(io: CliIo, { flag }: FlagWithRulings): void {
  io.out(`Cờ ${flag.id}`);
  io.out(`  Episode ${flag.episode}, lượt ${flag.turn}, item ${flag.itemId} (${KIND_TEXT[flag.kind]})`);
  io.out(`  Trích: ${flag.excerpt}`);
  io.out(`  Hook được phép: ${flag.allowedHooks.length > 0 ? flag.allowedHooks.map((line) => `"${line}"`).join("; ") : "(không có)"}`);
  io.out(`  Lý do của judge: ${flag.judgeReason}`);
}

/** Another admin's ruling is shown only to an admin who has already ruled, so nobody rules by copying. */
function printRulings(io: CliIo, entry: FlagWithRulings, operator: string): void {
  const own = entry.rulings.find((ruling) => ruling.adminEmail === operator);
  if (!own) {
    io.out("  Phán quyết: ẩn cho tới khi bạn ghi phán quyết của mình.");
    return;
  }
  for (const ruling of entry.rulings) {
    io.out(`  ${ruling.adminEmail}: ${VERDICT_TEXT[ruling.verdict]}. ${ruling.reason}`);
  }
  io.out(`  Trạng thái: ${STATUS_TEXT[flagStatus(entry.rulings)]}`);
}

/**
 * `adjudicate` (FR-60): each admin records their own ruling on a leak flag, with a reason. A flag
 * closes on two matching rulings from two different admins. Two that disagree count as a
 * confirmed leak for as long as they disagree; either admin may change their ruling until both
 * agree (PRD C6), and a closed flag is final.
 */
export function runAdjudicate(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("adjudicate"));
    const [first, second, ...rest] = args;
    if (!first || !second) throw new CliError(USAGE);
    const email = operator();

    if (first === "list") {
      if (rest.length > 0) throw new CliError(USAGE);
      const found = await getScenarioByPersona(db, second);
      if (!found) throw new CliError(`Không tìm thấy persona "${second}".`);
      const latest = await latestFullRun(db, found.scenario.id);
      if (!latest) throw new CliError(`Phiên bản ${found.scenario.version} của ${second} chưa có lần eval đầy đủ nào hoàn tất.`);
      const flags = await listFlags(db, latest.run.id);
      const mine = flags.filter((entry) => !entry.rulings.some((ruling) => ruling.adminEmail === email));
      io.out(`Lần chạy ${latest.run.id}: ${flags.length} cờ, bạn còn ${mine.length} cờ chưa phân xử.`);
      for (const entry of mine) printFlag(io, entry);
      return 0;
    }

    const flagId = first === "show" ? second : first;
    const found = isUuid(flagId) ? await getFlag(db, flagId) : null;
    if (!found) throw new CliError(`Không tìm thấy cờ ${flagId}.`);
    const entry = { flag: found.flag, rulings: found.rulings };

    if (first === "show") {
      if (rest.length > 0) throw new CliError(USAGE);
      printFlag(io, entry);
      const episode = (await listEpisodes(db, found.run.id)).find((candidate) => candidate.key === found.flag.episode);
      const turn = episode?.turns.find((candidate) => candidate.index === found.flag.turn);
      if (turn) {
        io.out(`  Người hỏi: ${turn.question}`);
        io.out(`  Nhân vật: ${turn.personaText}`);
      }
      printRulings(io, entry, email);
      return 0;
    }

    const verdict = second === "leak" ? "leak" : second === "not-leak" ? "not_leak" : null;
    const reason = rest.join(" ").trim();
    if (!verdict || reason === "") throw new CliError(USAGE);
    // PRD C6: a ruling can be changed until two admins agree; after that the flag is settled.
    const settled = entry.rulings.length >= 2 && entry.rulings.every((ruling) => ruling.verdict === entry.rulings[0].verdict);
    if (settled) throw new CliError("Cờ này đã đóng vì hai quản trị viên cùng phán quyết; không ghi thêm hay sửa được nữa.");
    await saveAdjudication(db, { flagId, adminEmail: email, verdict, reason });
    io.out(`Đã ghi: ${VERDICT_TEXT[verdict]}.`);
    printRulings(io, (await getFlag(db, flagId))!, email);
    return 0;
  });
}

export function adjudicateCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "adjudicate <list|show|id cờ>",
    summary: "Phân xử cờ rò rỉ của lần eval đầy đủ; mỗi quản trị viên ghi phán quyết riêng.",
    run: (args, io) => runAdjudicate(args, io, db, operator),
  };
}
