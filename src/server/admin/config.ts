import type { Database, Executor } from "@/db/client";
import { CONFIG, changeConfig, isConfigKey, listConfig, parseConfigInput } from "@/db/repo/config";
import { accessLogAdmins, countAccessLog, listAccessLog, type AccessLogFilter, type AccessLogRow } from "@/db/repo/turns";
import { assertAdmin, type AppUser } from "../auth";
import { pageOf, pageWindow, type AdminPage } from "../admin-paging";

/** The admin's config editor and audit log. Neither reads learner data, so reading them is not logged. */

export type ConfigEntry = Awaited<ReturnType<typeof listConfig>>[number] & { defaultValue: unknown; kind: "boolean" | "number" };

/** Every setting with its current value, its default and what it does. */
export async function listConfigFor(db: Executor, user: AppUser | null): Promise<ConfigEntry[]> {
  assertAdmin(user);
  return (await listConfig(db)).map((row) => {
    const defaultValue = CONFIG[row.key].default;
    return { ...row, defaultValue, kind: typeof defaultValue === "boolean" ? "boolean" : "number" };
  });
}

export type ConfigChangeResult =
  | { ok: true; key: string; from: unknown; to: unknown }
  | { ok: false; reason: "unknown_key" | "not_json" | "invalid"; message: string };

/**
 * Changes one setting from what the admin typed, checked as `il config set` checks it. It takes
 * effect on the next request, which reads the table again. The change is logged with its old and
 * new value; a refused value changes and logs nothing.
 */
export async function updateConfigFor(db: Database, user: AppUser | null, input: { key: string; value: string }): Promise<ConfigChangeResult> {
  assertAdmin(user);
  const { key, value } = input;
  if (!isConfigKey(key)) return { ok: false, reason: "unknown_key", message: `Không có khóa "${key}".` };
  const parsed = parseConfigInput(key, value.trim());
  if (!parsed.ok) return parsed;
  const { from, to } = await changeConfig(db, key, parsed.value, { email: user.email, channel: "console" });
  return { ok: true, key, from, to };
}

export type AuditLog = AdminPage<AccessLogRow> & { admins: string[] };

/** The access log, newest first, filtered by admin and by how the action starts. */
export async function listAuditLog(db: Executor, user: AppUser | null, filter: AccessLogFilter & { page: number }): Promise<AuditLog> {
  assertAdmin(user);
  const where: AccessLogFilter = { adminEmail: filter.adminEmail || undefined, actionPrefix: filter.actionPrefix?.trim() || undefined };
  const [rows, total, admins] = await Promise.all([
    listAccessLog(db, { ...where, ...pageWindow(filter.page) }),
    countAccessLog(db, where),
    accessLogAdmins(db),
  ]);
  return { ...pageOf(rows, filter.page, total), admins };
}
