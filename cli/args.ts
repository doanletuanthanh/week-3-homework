import { CliError } from "./scenario-file";

/**
 * Splits command arguments into positional values and `--options`. `values` names the options
 * that take a value (`--profile full`); every other `--name` is a switch. An option the command
 * does not know is an error, so a typo never runs with defaults.
 */
export function parseArgs<V extends string, S extends string>(
  args: string[],
  spec: { values?: readonly V[]; switches?: readonly S[] },
): { positional: string[]; values: Partial<Record<V, string>>; switches: Set<S> } {
  const positional: string[] = [];
  const values: Partial<Record<V, string>> = {};
  const switches = new Set<S>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (spec.values?.includes(name as V)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new CliError(`Tùy chọn --${name} cần một giá trị.`);
      values[name as V] = value;
      index += 1;
    } else if (spec.switches?.includes(name as S)) {
      switches.add(name as S);
    } else {
      throw new CliError(`Không có tùy chọn --${name}.`);
    }
  }
  return { positional, values, switches };
}

/** A whole number option within bounds, or the fallback when the option was not given. */
export function intOption(raw: string | undefined, name: string, bounds: { min: number; max: number; fallback: number }): number {
  if (raw === undefined) return bounds.fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new CliError(`--${name} phải là số nguyên từ ${bounds.min} đến ${bounds.max}.`);
  }
  return value;
}

export const needsDb = (command: string) =>
  `Lệnh ${command} cần cơ sở dữ liệu: đặt DATABASE_URL_DIRECT (hoặc DATABASE_URL) trong .env.local.`;

/** Runs a command body; a problem the operator can fix is printed without a stack trace. */
export async function reportCliErrors(io: { err: (line: string) => void }, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    io.err(error.message);
    return 1;
  }
}
