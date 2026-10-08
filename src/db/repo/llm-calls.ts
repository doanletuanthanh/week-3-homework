import { sql } from "drizzle-orm";
import { DAY_ZONE } from "@/config/limits";
import type { Executor } from "../client";
import { llmCalls } from "../schema";

export type LlmCallRecord = typeof llmCalls.$inferInsert;

/** Always called with the plain database handle, never a transaction: the row must outlive any rollback. */
export async function recordLlmCall(db: Executor, record: LlmCallRecord): Promise<void> {
  await db.insert(llmCalls).values(record);
}

/**
 * Removes the model-call rows of a learner's sessions and adds their cost to the `daily_spend`
 * ledger, per day and scope, so a daily cap reads the same total before and after.
 */
export async function moveSpendToLedger(db: Executor, userId: string): Promise<void> {
  await db.execute(sql`
    WITH removed AS (
      DELETE FROM llm_call
      WHERE session_id IN (SELECT id FROM "session" WHERE user_id = ${userId})
      RETURNING scope, cost_usd, created_at
    )
    INSERT INTO daily_spend (day, scope, usd)
    SELECT (created_at AT TIME ZONE ${DAY_ZONE})::date, scope, sum(cost_usd) FROM removed GROUP BY 1, 2
    ON CONFLICT (day, scope) DO UPDATE SET usd = daily_spend.usd + EXCLUDED.usd
  `);
}
