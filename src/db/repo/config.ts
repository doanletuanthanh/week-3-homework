import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../client";
import { config } from "../schema";

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
