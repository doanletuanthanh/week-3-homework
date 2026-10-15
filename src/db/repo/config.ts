import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, Executor } from "../client";
import { config } from "../schema";
import { logAdminAccess } from "./turns";

/**
 * Every setting an operator can change without a deploy. A key with no row has its default.
 * Money is in USD. The cap defaults are placeholders for a small pilot, not measured values.
 */
export const CONFIG = {
  require_published: {
    schema: z.boolean(),
    default: false,
    summary: "Chỉ cho chơi phiên bản persona đã publish (FR-35). Mặc định tắt: bản nháp cũng chơi được.",
  },
  session_daily_cap_usd: {
    schema: z.number().nonnegative(),
    default: 5,
    summary: "Cap chi phí LLM của các buổi trong một ngày (UTC+7). Chạm cap thì chặn buổi mới.",
  },
  session_demo_reserve_usd: {
    schema: z.number().nonnegative(),
    default: 1,
    summary: "Phần của cap dành riêng cho tài khoản demo.",
  },
  custom_path_enabled: {
    schema: z.boolean(),
    default: true,
    summary: "Công tắc của đường tạo chủ đề (FR-56). Tắt: Màn 10 hiện trạng thái tạm dừng, không nhận lần thử mới.",
  },
  generation_daily_budget_usd: {
    schema: z.number().nonnegative(),
    default: 10,
    summary: "Ngân sách LLM cho việc sinh kịch bản tự tạo trong một ngày (UTC+7), tách khỏi cap của buổi. Mỗi tài khoản dùng tối đa 20%.",
  },
  generation_reserve_usd: {
    schema: z.number().positive(),
    default: 1,
    summary: "Chi phí giữ trước cho mỗi lần thử sinh kịch bản. Lần thử bị dừng khi tiêu tới mức này.",
  },
  eval_lean_budget_usd: {
    schema: z.number().positive(),
    default: 0.1,
    summary: "Trần chi phí của một lần eval lean (agent QA) cho một persona. Agent bỏ các phép thử thêm khi sắp chạm trần; tới trần thì mọi lần gọi đang chạy bị dừng.",
  },
  eval_daily_budget_usd: {
    schema: z.number().nonnegative(),
    default: 5,
    summary: "Ngân sách LLM cho eval trong một ngày (UTC+7), tách khỏi cap của buổi. Không bắt đầu lần eval lean mới nếu phần đã tiêu cộng trần của lần đó vượt mức này.",
  },
  guide_checks_per_day: {
    schema: z.number().int().nonnegative(),
    default: 5,
    summary: "Số lần kiểm tra bộ câu hỏi một tài khoản được dùng trong một ngày (UTC+7). Mỗi lần là một lần gọi model, tính vào cap của buổi. 0 là tắt.",
  },
} as const;

export type ConfigKey = keyof typeof CONFIG;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG)[K]["schema"]>;

export function isConfigKey(key: string): key is ConfigKey {
  return Object.hasOwn(CONFIG, key);
}

export async function getConfig<K extends ConfigKey>(db: Executor, key: K): Promise<ConfigValue<K>> {
  const [row] = await db.select({ value: config.value }).from(config).where(eq(config.key, key)).limit(1);
  if (!row) return CONFIG[key].default as ConfigValue<K>;
  // Rows are only written through `setConfig`, so a value that does not parse means manual tampering.
  return CONFIG[key].schema.parse(row.value) as ConfigValue<K>;
}

/** Stores a value after checking it against the key's type. Throws on a value of the wrong type. */
export async function setConfig<K extends ConfigKey>(
  db: Executor,
  key: K,
  value: unknown,
  updatedBy: string,
): Promise<ConfigValue<K>> {
  const parsed = CONFIG[key].schema.parse(value) as ConfigValue<K>;
  await db
    .insert(config)
    .values({ key, value: parsed, updatedBy })
    .onConflictDoUpdate({ target: config.key, set: { value: parsed, updatedBy, updatedAt: new Date() } });
  return parsed;
}

/** Every key with its current value and whether that value is the default. */
export async function listConfig(db: Executor) {
  const rows = new Map((await db.select().from(config)).map((row) => [row.key, row]));
  return (Object.keys(CONFIG) as ConfigKey[]).map((key) => {
    const row = rows.get(key);
    return {
      key,
      value: row ? row.value : CONFIG[key].default,
      isDefault: !row,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
      summary: CONFIG[key].summary,
    };
  });
}

export type ParsedConfigValue<K extends ConfigKey> = { ok: true; value: ConfigValue<K> } | { ok: false; reason: "not_json" | "invalid"; message: string };

/**
 * Reads a value as an operator types it (JSON: `true`, `5`, `0.5`) and checks it against the
 * key's type. The CLI and the admin console both go through it, so they accept the same values.
 */
export function parseConfigInput<K extends ConfigKey>(key: K, raw: string): ParsedConfigValue<K> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not_json", message: `Giá trị "${raw}" không phải JSON (ví dụ: true, false, 5, 0.5).` };
  }
  const checked = CONFIG[key].schema.safeParse(value);
  if (!checked.success) return { ok: false, reason: "invalid", message: `Giá trị ${raw} không hợp lệ cho "${key}": ${checked.error.issues[0].message}` };
  return { ok: true, value: checked.data as ConfigValue<K> };
}

/**
 * Changes a setting and records who changed it, from what, to what, in `admin_access_log`. The
 * change and its log row are one transaction: neither exists without the other.
 */
export async function changeConfig<K extends ConfigKey>(
  db: Database,
  key: K,
  value: ConfigValue<K>,
  by: { email: string; channel: "console" | "cli" },
): Promise<{ from: ConfigValue<K>; to: ConfigValue<K> }> {
  return db.transaction(async (tx) => {
    // Two changes of the same key at once would both read the same old value: one waits for the other.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`config:${key}`}))`);
    const from = await getConfig(tx, key);
    const to = await setConfig(tx, key, value, by.email);
    await logAdminAccess(tx, { adminEmail: by.email, channel: by.channel, action: `config set ${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}` });
    return { from, to };
  });
}
