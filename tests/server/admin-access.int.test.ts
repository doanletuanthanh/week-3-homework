import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { sessionCostStats, spendByDay, spendByRole } from "@/db/repo/cost-report";
import { recordLlmCall, type LlmCallRecord } from "@/db/repo/llm-calls";
import { dailySpend } from "@/db/schema";
import { getAdminOverview } from "@/server/admin/overview";
import { assertAdmin } from "@/server/auth";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

const ADMIN = "admin@example.com";
const DEMO = "demo@example.com";
const LISTS = { ADMIN_EMAILS: [ADMIN], DEMO_ACCOUNT_EMAILS: [DEMO] };

beforeEach(resetDatabase);

function call(overrides: Partial<LlmCallRecord>): LlmCallRecord {
  return {
    scope: "session", role: "PERSONA", model: "gemini-3.8-flash", tokensIn: 1000, tokensOut: 100, tokensCached: 0, tokensReasoning: 0,
    costUsd: 0.001, latencyMs: 500, attempt: 1, ok: true, ...overrides,
  };
}

/** The error `notFound()` throws: what makes Next answer 404. */
const isNotFound = (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404";

async function refusal(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

describe("admin access", () => {
  it("answers 404 to a guest, a learner and a demo account, before it reads anything", async () => {
    const learner = await createLearner("an@example.com", LISTS);
    const demo = await createLearner(DEMO, LISTS);
    for (const user of [null, learner, demo]) {
      expect(isNotFound(await refusal(() => assertAdmin(user)))).toBe(true);
      expect(isNotFound(await refusal(() => getAdminOverview(getDb(), user)))).toBe(true);
    }
  });

  it("lets an admin in", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    expect(() => assertAdmin(admin)).not.toThrow();
    await expect(getAdminOverview(getDb(), admin)).resolves.toBeDefined();
  });
});

describe("admin overview", () => {
  it("shows the figures the cost report reads, today against the caps, and the usage", async () => {
    const db = getDb();
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("an@example.com", LISTS);
    const session = await startSession(learner);
    await createLearner(DEMO, LISTS).then(startSession);
    // A session with no model call: the system may still write to it (a sweep, an unpublish), which is not activity.
    await createLearner("binh@example.com", LISTS).then(startSession);
    await setConfig(db, "session_daily_cap_usd", 2, ADMIN);
    for (const record of [
      call({ sessionId: session.id, turnIndex: 1, costUsd: 0.004, tokensCached: 500 }),
      call({ sessionId: session.id, turnIndex: 2, role: "ANALYSIS", costUsd: 0.002, ok: false }),
      call({ scope: "eval", role: "QA_PLANNER", costUsd: 0.01 }),
      call({ scope: "generation", role: "SCENARIO_GENERATOR", costUsd: 0.02, tokensIn: 3000 }),
    ]) {
      await recordLlmCall(db, record);
    }
    // Spend of a deleted account: in the day totals only.
    await db.insert(dailySpend).values({ day: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), scope: "session", usd: 0.5 });

    const overview = await getAdminOverview(db, admin);

    expect(overview.today).toEqual([
      { scope: "session", usd: expect.closeTo(0.506, 9), capUsd: 2 },
      { scope: "generation", usd: expect.closeTo(0.02, 9), capUsd: 10 },
      { scope: "eval", usd: expect.closeTo(0.01, 9), capUsd: 5 },
      { scope: "moderation", usd: 0, capUsd: null },
    ]);
    expect(overview.days).toHaveLength(30);
    expect(overview.days.at(-1)!.usd).toBeCloseTo(0.536, 9);
    const window = { days: 30 };
    expect(overview.windowUsd).toBeCloseTo((await spendByDay(db, window)).reduce((sum, row) => sum + row.usd, 0), 9);
    expect(overview.sessionCost).toEqual(await sessionCostStats(db, window));
    expect(overview.topRoles.map((row) => row.role)).toEqual(["SCENARIO_GENERATOR", "QA_PLANNER", "PERSONA", "ANALYSIS"]);
    expect(overview.topRoles.reduce((sum, row) => sum + row.usd, 0)).toBeCloseTo((await spendByRole(db, window)).reduce((sum, row) => sum + row.usd, 0), 9);
    expect(overview.cacheHitShare).toBeCloseTo(500 / 6000, 9);
    expect(overview.failedCallShare).toBe(0.25);
    // Demo accounts are not counted; only the learner whose session made calls was active.
    expect(overview.usage.today).toEqual({ sessionsStarted: 2, activeLearners: 1, customAttempts: 0 });
  });

  it("shows empty figures, not errors, when nothing has been spent", async () => {
    const overview = await getAdminOverview(getDb(), await createLearner(ADMIN, LISTS));
    expect(overview.windowUsd).toBe(0);
    expect(overview.cacheHitShare).toBeNull();
    expect(overview.failedCallShare).toBeNull();
    expect(overview.topRoles).toEqual([]);
  });
});
