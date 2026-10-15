import type { Executor } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { sessionCostStats, spendByDay, spendByRole, usageCounts, type RoleSpend, type SessionCostStats, type UsageCounts } from "@/db/repo/cost-report";
import { LLM_SCOPES, type LlmScope } from "@/db/schema";
import { assertAdmin, type AppUser } from "../auth";

/** The days the overview charts: the last 30 calendar days in UTC+7, today included. */
export const OVERVIEW_DAYS = 30;
/** How many roles the "most expensive" list shows. */
const TOP_ROLES = 5;

/** The daily budget of each scope that has one, by its config key. Moderation runs inside the custom path and has none of its own. */
const CAP_OF: Partial<Record<LlmScope, "session_daily_cap_usd" | "generation_daily_budget_usd" | "eval_daily_budget_usd">> = {
  session: "session_daily_cap_usd",
  generation: "generation_daily_budget_usd",
  eval: "eval_daily_budget_usd",
};

export type ScopeToday = { scope: LlmScope; usd: number; capUsd: number | null };
export type DayTotals = { day: string; byScope: Record<LlmScope, number>; usd: number };
export type RoleTotal = { scope: LlmScope; role: string; calls: number; usd: number };

export type AdminOverview = {
  today: ScopeToday[];
  days: DayTotals[];
  windowUsd: number;
  topRoles: RoleTotal[];
  sessionCost: SessionCostStats;
  /** Share of input tokens the provider served from its cache, over the window. */
  cacheHitShare: number | null;
  /** Share of model attempts that failed, retries included, over the window. */
  failedCallShare: number | null;
  usage: { today: UsageCounts; window: UsageCounts };
};

const zeroScopes = (): Record<LlmScope, number> => Object.fromEntries(LLM_SCOPES.map((scope) => [scope, 0])) as Record<LlmScope, number>;
const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** Every calendar day of the window, oldest first, so a day without spend still has its bar. */
function windowDays(days: number, now: Date): string[] {
  // The day in UTC+7, as the caps count it.
  const today = new Date(now.getTime() + 7 * 3_600_000);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today.getTime() - (days - 1 - index) * 86_400_000);
    return day.toISOString().slice(0, 10);
  });
}

/** Sums the per-model rows of a role into one row per scope and role, most expensive first. */
function topRoles(rows: RoleSpend[]): RoleTotal[] {
  const byRole = new Map<string, RoleTotal>();
  for (const row of rows) {
    const key = `${row.scope}:${row.role}`;
    const total = byRole.get(key) ?? { scope: row.scope, role: row.role, calls: 0, usd: 0 };
    total.calls += row.calls;
    total.usd += row.usd;
    byRole.set(key, total);
  }
  return [...byRole.values()].sort((a, b) => b.usd - a.usd).slice(0, TOP_ROLES);
}

/**
 * What the admin overview shows: today's spend per scope against its cap, the last 30 days by
 * day and scope, the most expensive roles, the cost of a session, and how much the product was
 * used. Read only, from the same queries as `pnpm il cost-report`. Anyone but an admin gets 404.
 */
export async function getAdminOverview(db: Executor, user: AppUser | null, now: Date = new Date()): Promise<AdminOverview> {
  assertAdmin(user);
  const today = { days: 1 };
  const window = { days: OVERVIEW_DAYS };
  const [todayByDay, windowByDay, byRole, sessionCost, usageToday, usageWindow, ...caps] = await Promise.all([
    spendByDay(db, today),
    spendByDay(db, window),
    spendByRole(db, window),
    sessionCostStats(db, window),
    usageCounts(db, today),
    usageCounts(db, window),
    ...LLM_SCOPES.map((scope) => {
      const key = CAP_OF[scope];
      return key ? getConfig(db, key) : Promise.resolve(null);
    }),
  ]);

  const spentToday = zeroScopes();
  for (const row of todayByDay) spentToday[row.scope] += row.usd;

  const byDay = new Map(windowDays(OVERVIEW_DAYS, now).map((day) => [day, zeroScopes()]));
  for (const row of windowByDay) {
    const scopes = byDay.get(row.day);
    if (scopes) scopes[row.scope] += row.usd;
  }
  const days = [...byDay].map(([day, scopes]) => ({ day, byScope: scopes, usd: LLM_SCOPES.reduce((sum, scope) => sum + scopes[scope], 0) }));
  // From the rows, not the bars: near midnight the app clock and the database may name different
  // days, and the total must still be the one the cost report prints.
  const windowUsd = windowByDay.reduce((sum, row) => sum + row.usd, 0);

  const calls = byRole.reduce((sum, row) => sum + row.calls, 0);
  return {
    today: LLM_SCOPES.map((scope, index) => ({ scope, usd: spentToday[scope], capUsd: caps[index] })),
    days,
    windowUsd,
    topRoles: topRoles(byRole),
    sessionCost,
    cacheHitShare: shareOf(
      byRole.reduce((sum, row) => sum + row.tokensCached, 0),
      byRole.reduce((sum, row) => sum + row.tokensIn, 0),
    ),
    failedCallShare: shareOf(
      byRole.reduce((sum, row) => sum + row.failedCalls, 0),
      calls,
    ),
    usage: { today: usageToday, window: usageWindow },
  };
}
