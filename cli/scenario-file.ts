import { readFile } from "node:fs/promises";
import type { Violation } from "@/scenario/validate";

/** Where a command writes; tests pass their own to read what was printed. */
export type CliIo = { out: (line: string) => void; err: (line: string) => void };

export type Command = {
  usage: string;
  summary: string;
  /** Returns the process exit code. */
  run: (args: string[], io: CliIo) => Promise<number>;
};

/** A problem the operator can fix; its message is printed without a stack trace. */
export class CliError extends Error {}

/** Parsed JSON of a file; a missing file or broken JSON becomes a message for the operator. */
export async function readJsonFile(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new CliError(`Không đọc được file "${path}".`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError(`File "${path}" không phải JSON hợp lệ: ${(error as Error).message}`);
  }
}

export function printViolations(io: CliIo, file: string, violations: Violation[]): void {
  io.err(`LỖI ${file}: ${violations.length} vi phạm`);
  for (const violation of violations) {
    io.err(`  ${violation.path || "(gốc)"}  [${violation.code}]  ${violation.message}`);
  }
}
