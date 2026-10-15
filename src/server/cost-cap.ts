import { sql } from "drizzle-orm";
import { DAY_ZONE } from "@/config/limits";
import type { Executor } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import type { LlmScope } from "@/db/schema";

/**
 * LLM spend of one scope since 00:00 UTC+7: every `llm_call` of that scope today (failed attempts
 * and retries included), plus the `daily_spend` ledger, which keeps the spend of rows that no
 * longer exist. Each scope has its own budget; spend of one never counts against another.
 */
export async function spendToday(db: Executor, scope: LlmScope): Promise<number> {
  const [row] = await db.execute<{ usd: number }>(sql`
    SELECT (
      COALESCE((
        SELECT sum(cost_usd) FROM llm_call
        WHERE scope = ${scope}
          AND created_at >= date_trunc('day', now() AT TIME ZONE ${DAY_ZONE}) AT TIME ZONE ${DAY_ZONE}
      ), 0)
      + COALESCE((
        SELECT sum(usd) FROM daily_spend
        WHERE scope = ${scope} AND day = (now() AT TIME ZONE ${DAY_ZONE})::date
      ), 0)
    )::float8 AS usd
  `);
  return row.usd;
}

/** LLM spend of interview sessions today. Generation and eval spend never count here. */
export const sessionSpendToday = (db: Executor): Promise<number> => spendToday(db, "session");

/**
 * FR-37: the cap blocks new sessions only; a session that exists runs to its end. Learners stop
 * at the cap minus the demo reserve, so a demo account can still start a session after that.
 */
export async function canStartSession(db: Executor, isDemo: boolean): Promise<boolean> {
  const [cap, reserve, spent] = await Promise.all([
    getConfig(db, "session_daily_cap_usd"),
    getConfig(db, "session_demo_reserve_usd"),
    sessionSpendToday(db),
  ]);
  // In whole millionths of a dollar: `1.3 - 1` is a hair above `0.3` in floating point, and a
  // cap typed to the cent would let one more session start.
  return micro(spent) < micro(isDemo ? cap : cap - reserve);
}

const micro = (usd: number) => Math.round(usd * 1_000_000);
