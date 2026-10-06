import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  SET_KINDS,
  TestSetError,
  formatScore,
  judgementExitCode,
  labelCaseSchema,
  parseTestSet,
  runLabelSet,
  runVerdictSet,
  verdictCaseSchema,
  type SetKind,
} from "@/eval/judgement-eval";
import type { CallModelDeps } from "@/llm/call-model";
import { validateScenario } from "@/scenario/validate";
import { parseArgs, reportCliErrors } from "../args";
import { CliError, readJsonFile, type CliIo, type Command } from "../scenario-file";

const USAGE = `Cách dùng: il judgement-eval <file .jsonl> [--kind ${SET_KINDS.join("|")}] [--scenario <file>]`;
const DEFAULT_SCENARIO = "scenarios/ux-chi-tieu/chi-thu.json";

/**
 * `judgement-eval <set>` (NFR-7): runs a hand-labelled test set through the production prompt and
 * prints each rate against its hard gate. Exit code 1 when a gate is missed, 2 when every rate
 * passes but the set is smaller than NFR-7 requires, 0 when the gate is proven.
 */
export function runJudgementEval(args: string[], io: CliIo, llmDeps?: Partial<CallModelDeps>): Promise<number> {
  return reportCliErrors(io, async () => {
    const { positional, values } = parseArgs(args, { values: ["kind", "scenario"] });
    const [file] = positional;
    if (!file || positional.length !== 1) throw new CliError(USAGE);

    const kind = (values.kind ?? basename(file).replace(/\.jsonl$/u, "")) as SetKind;
    if (!SET_KINDS.includes(kind)) {
      throw new CliError(`Không biết loại bộ thử "${kind}". Đặt tên file theo loại hoặc dùng --kind (${SET_KINDS.join(", ")}).`);
    }
    const scenarioFile = values.scenario ?? DEFAULT_SCENARIO;
    const { scenario } = validateScenario(await readJsonFile(scenarioFile));
    if (!scenario) throw new CliError(`Kịch bản "${scenarioFile}" không qua validate.`);

    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new CliError(`Không đọc được file "${file}".`);
    }

    const options = { scope: { scope: "eval" as const }, llmDeps };
    try {
      const score =
        kind === "label-classifier"
          ? await runLabelSet(scenario, parseTestSet(raw, labelCaseSchema), options)
          : await runVerdictSet(scenario, parseTestSet(raw, verdictCaseSchema), options);
      io.out(`Bộ thử ${kind}: ${score.size} ca, kịch bản ${scenario.persona_id}`);
      for (const line of formatScore(score)) io.out(line);
      return judgementExitCode(score);
    } catch (error) {
      if (!(error instanceof TestSetError)) throw error;
      throw new CliError(`${file}: ${error.message}`);
    }
  });
}

export function judgementEvalCommand(llmDeps: () => Partial<CallModelDeps>): Command {
  return {
    usage: "judgement-eval <file>",
    summary: "Chạy bộ thử gán tay qua prompt production và in các tỉ lệ NFR-7.",
    run: (args, io) => runJudgementEval(args, io, llmDeps()),
  };
}
