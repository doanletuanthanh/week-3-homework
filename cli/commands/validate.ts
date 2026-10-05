import { validateScenario, type ValidateContext } from "@/scenario/validate";
import { CliError, printViolations, readJsonFile, type CliIo, type Command } from "../scenario-file";

/** Reads the tags other personas of a topic use; absent when the CLI has no database connection. */
export type OtherPersonaTagsLoader = (topicId: string, personaId: string) => Promise<ValidateContext["otherPersonas"]>;

/**
 * `validate <file>`: checks a scenario file and prints every violation. Exit code 1 on any. The
 * cross-persona tag rule needs the database; without one it is skipped and the output says so.
 */
export async function runValidate(
  args: string[],
  io: CliIo,
  loadOtherPersonaTags?: OtherPersonaTagsLoader,
): Promise<number> {
  const [file] = args;
  if (!file) {
    io.err("Thiếu đường dẫn file. Cách dùng: il validate <file>");
    return 1;
  }
  let input: unknown;
  try {
    input = await readJsonFile(file);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    io.err(error.message);
    return 1;
  }

  const context: ValidateContext = {};
  const { topic_id: topicId, persona_id: personaId } = (input ?? {}) as Record<string, unknown>;
  if (!loadOtherPersonaTags) {
    io.out("Không có kết nối cơ sở dữ liệu: bỏ qua kiểm tra trùng topic tag với persona khác cùng chủ đề.");
  } else if (typeof topicId === "string" && typeof personaId === "string") {
    try {
      context.otherPersonas = await loadOtherPersonaTags(topicId, personaId);
    } catch {
      io.out("Không kết nối được cơ sở dữ liệu: bỏ qua kiểm tra trùng topic tag với persona khác cùng chủ đề.");
    }
  }

  const result = validateScenario(input, context);
  if (!result.scenario) {
    printViolations(io, file, result.violations);
    return 1;
  }
  const { scenario } = result;
  io.out(`OK ${file}: ${scenario.persona_id}, ${scenario.items.length} item, ${scenario.surface_facts.length} fact bề mặt.`);
  return 0;
}

export function validateCommand(loadOtherPersonaTags?: OtherPersonaTagsLoader): Command {
  return {
    usage: "validate <file>",
    summary: "Kiểm file kịch bản theo schema và luật soạn (FR-33).",
    run: (args, io) => runValidate(args, io, loadOtherPersonaTags),
  };
}
