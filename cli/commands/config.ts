import type { Database } from "@/db/client";
import { CONFIG, getConfig, isConfigKey, listConfig, setConfig } from "@/db/repo/config";
import { CliError, type CliIo, type Command } from "../scenario-file";

const USAGE = "Cách dùng: il config list | il config get <khóa> | il config set <khóa> <giá trị>";

/** `config list | get | set`: operator settings that take effect without a deploy. */
export async function runConfig(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  const [action, key, rawValue] = args;
  if (!db) {
    io.err("Lệnh config cần cơ sở dữ liệu: đặt DATABASE_URL_DIRECT (hoặc DATABASE_URL) trong .env.local.");
    return 1;
  }

  if (action === "list" && args.length === 1) {
    for (const row of await listConfig(db)) {
      const origin = row.isDefault ? "mặc định" : `đặt bởi ${row.updatedBy}, ${row.updatedAt!.toISOString()}`;
      io.out(`${row.key} = ${JSON.stringify(row.value)}  (${origin})`);
      io.out(`  ${row.summary}`);
    }
    return 0;
  }

  if ((action !== "get" && action !== "set") || !key) {
    io.err(USAGE);
    return 1;
  }
  if (!isConfigKey(key)) {
    io.err(`Không có khóa "${key}". Các khóa: ${Object.keys(CONFIG).join(", ")}.`);
    return 1;
  }

  if (action === "get") {
    io.out(JSON.stringify(await getConfig(db, key)));
    return 0;
  }

  if (rawValue === undefined || args.length !== 3) {
    io.err(USAGE);
    return 1;
  }
  try {
    const email = operator();
    let value: unknown;
    try {
      value = JSON.parse(rawValue);
    } catch {
      throw new CliError(`Giá trị "${rawValue}" không phải JSON (ví dụ: true, false, 5, 0.5).`);
    }
    const checked = CONFIG[key].schema.safeParse(value);
    if (!checked.success) throw new CliError(`Giá trị ${rawValue} không hợp lệ cho "${key}": ${checked.error.issues[0].message}`);
    await setConfig(db, key, checked.data, email);
    io.out(`${key} = ${JSON.stringify(checked.data)}`);
    return 0;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    io.err(error.message);
    return 1;
  }
}

export function configCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "config <list|get|set>",
    summary: "Xem và đổi cấu hình vận hành (cap chi phí, cổng publish).",
    run: (args, io) => runConfig(args, io, db, operator),
  };
}
