import { eq } from "drizzle-orm";
import { CUSTOM_ATTEMPTS_PER_DAY, CUSTOM_LIFETIME_FAILURES, CUSTOM_REFUSALS_PER_DAY, GENERATION_ACCOUNT_SHARE } from "@/config/limits";
import type { Executor } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { accountCommittedToday, countAttemptsToday, findRunningAttempt, generationCommittedToday } from "@/db/repo/custom-topics";
import { NO_CUSTOM_USAGE, getKeptCustomUsage } from "@/db/repo/quota-tombstone";
import { users } from "@/db/schema";
import { quotaKeyOf } from "./quota";

/**
 * Why a learner cannot start a custom topic right now, in the order Màn 10 shows them: only the
 * first one that holds is reported. `ok` when nothing stands in the way.
 */
export type QuotaBlock = "paused" | "running" | "free_used" | "failures_exhausted" | "budget_exhausted" | "daily_attempts" | "refusal_locked";

export type CustomQuota = {
  block: QuotaBlock | null;
  /** The session being prepared, when `block` is `running`. */
  runningSessionId: string | null;
  freeLeft: 0 | 1;
  attemptsLeftToday: number;
  /** What a new attempt would hold of the budget. */
  reserveUsd: number;
};

/**
 * The limits of FR-56 for one learner, read from what is stored: nothing is cached, so the answer
 * inside the creating transaction (after its locks) is the one that counts. What a deleted
 * account behind the same Google account had used is added, so deleting and signing in again
 * resets no limit. Stale attempts must have been swept by the caller.
 */
export async function readCustomQuota(db: Executor, user: { id: string }): Promise<CustomQuota> {
  const [enabled, budget, reserveUsd, running, today, committed, accountCommitted, [row], key] = await Promise.all([
    getConfig(db, "custom_path_enabled"),
    getConfig(db, "generation_daily_budget_usd"),
    getConfig(db, "generation_reserve_usd"),
    findRunningAttempt(db, user.id),
    countAttemptsToday(db, user.id),
    generationCommittedToday(db),
    accountCommittedToday(db, user.id),
    db.select({ freeCustomUsed: users.freeCustomUsed, customFailedCount: users.customFailedCount }).from(users).where(eq(users.id, user.id)),
    quotaKeyOf(db, user.id),
  ]);
  const kept = key === null ? NO_CUSTOM_USAGE : await getKeptCustomUsage(db, key);

  const freeUsed = (row?.freeCustomUsed ?? false) || kept.freeCustomUsed;
  const failed = (row?.customFailedCount ?? 0) + kept.failedCount;
  const attempts = today.attempts + kept.attemptsToday;
  const refusals = today.refusals + kept.refusalsToday;
  const overBudget = committed + reserveUsd > budget || accountCommitted + kept.spendTodayUsd + reserveUsd > budget * GENERATION_ACCOUNT_SHARE;

  let block: QuotaBlock | null = null;
  if (!enabled) block = "paused";
  else if (running) block = "running";
  else if (freeUsed) block = "free_used";
  else if (failed >= CUSTOM_LIFETIME_FAILURES) block = "failures_exhausted";
  else if (overBudget) block = "budget_exhausted";
  else if (attempts >= CUSTOM_ATTEMPTS_PER_DAY) block = "daily_attempts";
  else if (refusals >= CUSTOM_REFUSALS_PER_DAY) block = "refusal_locked";

  return {
    block,
    runningSessionId: running?.sessionId ?? null,
    freeLeft: freeUsed ? 0 : 1,
    attemptsLeftToday: Math.max(0, CUSTOM_ATTEMPTS_PER_DAY - attempts),
    reserveUsd,
  };
}
