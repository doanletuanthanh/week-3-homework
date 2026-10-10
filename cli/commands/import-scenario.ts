import { dirname, join } from "node:path";
import type { Database } from "@/db/client";
import { ScenarioImportError, insertScenarioVersion, listOtherPersonaTags } from "@/db/repo/scenarios";
import { topicSchema } from "@/scenario/schema";
import { validateScenario, type Violation } from "@/scenario/validate";
import { CliError, printViolations, readJsonFile, type CliIo, type Command } from "../scenario-file";

export type ImportResult =
  | { ok: true; scenarioId: string; personaId: string; version: number }
  | { ok: false; violations: Violation[] };

/**
 * Imports a scenario file as a new draft version of its persona. The topic is read from
 * `topic.json` in the same folder and created or updated. Nothing is written unless the file
 * passes every `validate` rule, including the cross-persona tag rule.
 */
export async function importScenarioFile(db: Database, file: string): Promise<ImportResult> {
  const input = await readJsonFile(file);
  const topicFile = join(dirname(file), "topic.json");
  const topic = topicSchema.safeParse(await readJsonFile(topicFile));
  if (!topic.success) {
    const where = topic.error.issues.map((issue) => issue.path.join(".") || "(file)").join(", ");
    throw new CliError(`File chủ đề "${topicFile}" không hợp lệ ở: ${where}. Cần đủ id, title, summary, role (ux, ba hoặc pm) và display_order (số nguyên ≥ 0).`);
  }

  const { topic_id: topicId, persona_id: personaId } = (input ?? {}) as Record<string, unknown>;
  const otherPersonas =
    typeof topicId === "string" && typeof personaId === "string" ? await listOtherPersonaTags(db, topicId, personaId) : [];
  const result = validateScenario(input, { otherPersonas });
  if (!result.scenario) return { ok: false, violations: result.violations };
  if (result.scenario.topic_id !== topic.data.id) {
    throw new CliError(
      `Kịch bản thuộc chủ đề "${result.scenario.topic_id}" nhưng "${topicFile}" là chủ đề "${topic.data.id}".`,
    );
  }

  const row = await insertScenarioVersion(db, topic.data, result.scenario);
  return { ok: true, scenarioId: row.id, personaId: row.personaId, version: row.version };
}

/** `import <file>`: validate, then store as a new draft version. Exit code 1 when nothing was written. */
export async function runImport(args: string[], io: CliIo, db: Database | null): Promise<number> {
  const [file] = args;
  if (!file) {
    io.err("Thiếu đường dẫn file. Cách dùng: il import <file>");
    return 1;
  }
  if (!db) {
    io.err("Lệnh import cần cơ sở dữ liệu: đặt DATABASE_URL_DIRECT (hoặc DATABASE_URL) trong .env.local.");
    return 1;
  }
  try {
    const result = await importScenarioFile(db, file);
    if (!result.ok) {
      printViolations(io, file, result.violations);
      return 1;
    }
    io.out(`Đã nhập ${result.personaId} phiên bản ${result.version} (bản nháp), id ${result.scenarioId}.`);
    return 0;
  } catch (error) {
    if (!(error instanceof CliError) && !(error instanceof ScenarioImportError)) throw error;
    io.err(error.message);
    return 1;
  }
}

export function importCommand(db: Database | null): Command {
  return {
    usage: "import <file>",
    summary: "Nhập file kịch bản thành một phiên bản nháp mới của persona.",
    run: (args, io) => runImport(args, io, db),
  };
}
