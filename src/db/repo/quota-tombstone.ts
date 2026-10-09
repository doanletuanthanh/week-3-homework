import { eq, sql } from "drizzle-orm";
import { DAY_ZONE } from "@/config/limits";
import type { Executor } from "../client";
import { quotaTombstones } from "../schema";

/**
 * The Google account behind an auth user, as the auth server recorded it at sign-in. Read from
 * `auth.identities`, which a user cannot edit; the copy in the token's metadata can be changed.
 */
export async function findGoogleSubject(db: Executor, userId: string): Promise<string | null> {
  const [row] = await db.execute<{ provider_id: string }>(
    sql`SELECT provider_id FROM auth.identities WHERE user_id = ${userId} AND provider = 'google' LIMIT 1`,
  );
  return row?.provider_id ?? null;
}

/** Personas a deleted account behind this key had already played. */
export async function listPlayedPersonas(db: Executor, key: string): Promise<string[]> {
  const [row] = await db.select({ played: quotaTombstones.playedPersonaIds }).from(quotaTombstones).where(eq(quotaTombstones.key, key));
  return row?.played ?? [];
}

/** Adds to what is kept for the key. Call inside the transaction that deletes the account. */
export async function addPlayedPersonas(db: Executor, key: string, personaIds: string[]): Promise<void> {
  const played = [...new Set([...(await listPlayedPersonas(db, key)), ...personaIds])].sort();
  await db
    .insert(quotaTombstones)
    .values({ key, playedPersonaIds: played })
    .onConflictDoUpdate({ target: quotaTombstones.key, set: { playedPersonaIds: played, updatedAt: sql`now()` } });
}

/** The custom-topic limits a deleted account behind this key had used. The day counters are zero on any later day. */
export type KeptCustomUsage = { freeCustomUsed: boolean; failedCount: number; attemptsToday: number; refusalsToday: number; spendTodayUsd: number };

export const NO_CUSTOM_USAGE: KeptCustomUsage = { freeCustomUsed: false, failedCount: 0, attemptsToday: 0, refusalsToday: 0, spendTodayUsd: 0 };

export async function getKeptCustomUsage(db: Executor, key: string): Promise<KeptCustomUsage> {
  const [row] = await db.execute<{ free: boolean; failed: number; attempts: number; refusals: number; spend: number }>(sql`
    SELECT free_custom_used AS free, custom_failed_count AS failed,
      CASE WHEN custom_day = (now() AT TIME ZONE ${DAY_ZONE})::date THEN custom_attempts ELSE 0 END AS attempts,
      CASE WHEN custom_day = (now() AT TIME ZONE ${DAY_ZONE})::date THEN custom_refusals ELSE 0 END AS refusals,
      (CASE WHEN custom_day = (now() AT TIME ZONE ${DAY_ZONE})::date THEN custom_spend_usd ELSE 0 END)::float8 AS spend
    FROM quota_tombstone WHERE key = ${key}
  `);
  if (!row) return NO_CUSTOM_USAGE;
  return { freeCustomUsed: row.free, failedCount: row.failed, attemptsToday: row.attempts, refusalsToday: row.refusals, spendTodayUsd: row.spend };
}

/**
 * Adds what an account used of the custom-topic limits to what is kept for the key. The day
 * counters start again when the kept ones are from an earlier day. Call inside the transaction
 * that deletes the account.
 */
export async function addCustomUsage(db: Executor, key: string, used: KeptCustomUsage): Promise<void> {
  const today = sql`(now() AT TIME ZONE ${DAY_ZONE})::date`;
  const sameDay = sql`quota_tombstone.custom_day = ${today}`;
  await db.execute(sql`
    INSERT INTO quota_tombstone (key, free_custom_used, custom_failed_count, custom_day, custom_attempts, custom_refusals, custom_spend_usd)
    VALUES (${key}, ${used.freeCustomUsed}, ${used.failedCount}, ${today}, ${used.attemptsToday}, ${used.refusalsToday}, ${used.spendTodayUsd})
    ON CONFLICT (key) DO UPDATE SET
      free_custom_used = quota_tombstone.free_custom_used OR EXCLUDED.free_custom_used,
      custom_failed_count = quota_tombstone.custom_failed_count + EXCLUDED.custom_failed_count,
      custom_attempts = (CASE WHEN ${sameDay} THEN quota_tombstone.custom_attempts ELSE 0 END) + EXCLUDED.custom_attempts,
      custom_refusals = (CASE WHEN ${sameDay} THEN quota_tombstone.custom_refusals ELSE 0 END) + EXCLUDED.custom_refusals,
      custom_spend_usd = (CASE WHEN ${sameDay} THEN quota_tombstone.custom_spend_usd ELSE 0 END) + EXCLUDED.custom_spend_usd,
      custom_day = EXCLUDED.custom_day,
      updated_at = now()
  `);
}
