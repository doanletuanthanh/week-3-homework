import type { Database } from "@/db/client";
import { approveVersion, latestLeanRun } from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { needsDb, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE = 'Cách dùng: il approve <persona> "<ghi chú>"';

/**
 * `approve <persona> "<note>"`: an admin approves the newest version of a persona, on its newest
 * finished lean run. The approval holds only for that run: evaluating the version again needs a
 * new approval. It is one input of the publish gate, not a publish.
 */
export function runApprove(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("approve"));
    const [personaId, ...rest] = args;
    const note = rest.join(" ").trim();
    if (!personaId || note === "") throw new CliError(USAGE);
    const email = operator();

    const found = await getScenarioByPersona(db, personaId);
    if (!found) throw new CliError(`Không tìm thấy persona "${personaId}".`);
    const { scenario } = found;
    const run = await latestLeanRun(db, scenario.id);
    if (!run || run.status !== "done") {
      throw new CliError(`Phiên bản ${scenario.version} của ${personaId} chưa có lần eval lean nào hoàn tất: chạy il eval ${personaId} --profile lean trước.`);
    }
    await approveVersion(db, { scenarioId: scenario.id, version: scenario.version, evalRunId: run.id, adminEmail: email, note });
    io.out(`Đã duyệt ${personaId} phiên bản ${scenario.version} trên lần eval ${run.id} (${email}).`);
    io.out(`Kiểm cổng publish: il publish ${personaId}`);
    return 0;
  });
}

export function approveCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "approve <persona>",
    summary: "Quản trị viên duyệt phiên bản mới nhất trên lần eval lean mới nhất (một đầu vào của cổng publish).",
    run: (args, io) => runApprove(args, io, db, operator),
  };
}
