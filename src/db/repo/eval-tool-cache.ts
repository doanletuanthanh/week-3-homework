import { eq } from "drizzle-orm";
import type { CachedToolResult, QaReport } from "@/eval/qa/types";
import type { Executor } from "../client";
import { evalToolCache } from "../schema";

/** What the cache holds: a probe's result, or the report of a whole run. */
export type CachedValue = CachedToolResult | QaReport;

/** Where the persona QA agent keeps probe results and finished reports between runs. */
export type ToolCache = {
  get(key: string): Promise<CachedValue | null>;
  set(key: string, result: CachedValue): Promise<void>;
};

/** The cache in `eval_tool_cache`. A key written again keeps the newest result: a refreshing run replaces what it re-measured. */
export function dbToolCache(db: Executor): ToolCache {
  return {
    async get(key) {
      const [row] = await db.select({ result: evalToolCache.resultJson }).from(evalToolCache).where(eq(evalToolCache.key, key)).limit(1);
      return row?.result ?? null;
    },
    async set(key, result) {
      await db
        .insert(evalToolCache)
        .values({ key, resultJson: result })
        .onConflictDoUpdate({ target: evalToolCache.key, set: { resultJson: result, createdAt: new Date() } });
    },
  };
}
