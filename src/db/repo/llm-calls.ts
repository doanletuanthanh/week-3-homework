import type { Executor } from "../client";
import { llmCalls } from "../schema";

export type LlmCallRecord = typeof llmCalls.$inferInsert;

/** Always called with the plain database handle, never a transaction: the row must outlive any rollback. */
export async function recordLlmCall(db: Executor, record: LlmCallRecord): Promise<void> {
  await db.insert(llmCalls).values(record);
}
