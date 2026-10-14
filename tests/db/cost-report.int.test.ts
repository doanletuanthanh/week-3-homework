import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { evalRunCosts, sessionCostStats, spendByDay, spendByRole, tokensByTurn } from "@/db/repo/cost-report";
import type { LlmCallRecord } from "@/db/repo/llm-calls";
import { branches, dailySpend, evalRuns, llmCalls, scenarios } from "@/db/schema";
import { runCostReport } from "../../cli/commands/cost-report";
import { createLearner, PERSONA_ID, resetDatabase, startSession } from "../helpers/test-db";

beforeEach(resetDatabase);

const oneDay = { days: 1 };

function call(overrides: Partial<LlmCallRecord>): LlmCallRecord {
  return {
    scope: "session",
    role: "PERSONA",
    model: "gemini-3.8-flash",
    tokensIn: 1000,
    tokensOut: 100,
    tokensCached: 0,
    tokensReasoning: 0,
    costUsd: 0.001,
    latencyMs: 500,
    attempt: 1,
    ok: true,
    ...overrides,
  };
}

/** Two sessions of different cost, a failed retry, an eval run with its calls, a generation call and a ledger row. */
async function seed() {
  const db = getDb();
  const learner = await createLearner("linh@example.com");
  const first = await startSession(learner);
  const other = await createLearner("an@example.com");
  const second = await startSession(other);
  const [scenario] = await db.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.personaId, PERSONA_ID));
  const [run] = await db
    .insert(evalRuns)
    .values({ scenarioId: scenario.id, version: 1, profile: "quick", status: "done", turns: 30, costEstimateUsd: 0.7 })
    .returning({ id: evalRuns.id });

  await db.insert(llmCalls).values([
    call({ sessionId: first.id, turnIndex: 1, role: "ANALYSIS", tokensIn: 2000, tokensCached: 1500, costUsd: 0.002 }),
    call({ sessionId: first.id, turnIndex: 1, costUsd: 0.001 }),
    call({ sessionId: first.id, turnIndex: 2, role: "ANALYSIS", tokensIn: 3000, costUsd: 0.003, ok: false }),
    call({ sessionId: first.id, turnIndex: 2, role: "ANALYSIS", tokensIn: 3000, costUsd: 0.003, attempt: 2 }),
    call({ sessionId: second.id, turnIndex: 1, costUsd: 0.001 }),
    call({ scope: "eval", attemptId: run.id, role: "EVAL_LEAK_JUDGE", costUsd: 0.01 }),
    call({ scope: "eval", attemptId: run.id, role: "PERSONA", costUsd: 0.005 }),
    call({ scope: "generation", role: "SCENARIO_GENERATOR", costUsd: 0.05 }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  await db.insert(dailySpend).values({ day: today, scope: "session", usd: 0.5 });
  return { first, second, runId: run.id, today };
}

describe("cost report queries", () => {
  it("sums spend per scope, role and model, failed attempts included", async () => {
    await seed();
    const rows = await spendByRole(getDb(), oneDay);
    const analysis = rows.find((row) => row.scope === "session" && row.role === "ANALYSIS")!;
    expect(analysis).toMatchObject({ calls: 3, failedCalls: 1, tokensIn: 8000, tokensCached: 1500 });
    expect(analysis.usd).toBeCloseTo(0.008);
    expect(rows[0]).toMatchObject({ scope: "generation", role: "SCENARIO_GENERATOR" });
  });

  it("adds the ledger of deleted accounts to the per-day totals", async () => {
    const { today } = await seed();
    const rows = await spendByDay(getDb(), oneDay);
    expect(rows.find((row) => row.day === today && row.scope === "session")!.usd).toBeCloseTo(0.5 + 0.01);
    expect(rows.find((row) => row.day === today && row.scope === "eval")!.usd).toBeCloseTo(0.015);
  });

  it("gives per-session cost statistics", async () => {
    await seed();
    const stats = await sessionCostStats(getDb(), oneDay);
    expect(stats.sessions).toBe(2);
    expect(stats.avgUsd).toBeCloseTo((0.009 + 0.001) / 2);
    expect(stats.p95Usd).toBeGreaterThan(stats.p50Usd);
    expect(stats.avgTurns).toBeCloseTo(1.5);
  });

  it("attributes eval calls to their run, alone or in the window", async () => {
    const { runId } = await seed();
    const [run] = await evalRunCosts(getDb(), { ...oneDay, runId });
    expect(run).toMatchObject({ runId, personaId: PERSONA_ID, profile: "quick", calls: 2, failedCalls: 0 });
    expect(run.usd).toBeCloseTo(0.015);
    expect(run.estimateUsd).toBeCloseTo(0.7);
    expect(await evalRunCosts(getDb(), oneDay)).toHaveLength(1);
  });

  it("averages tokens per turn and role over successful session calls", async () => {
    await seed();
    const rows = await tokensByTurn(getDb(), oneDay);
    expect(rows.find((row) => row.turnIndex === 2 && row.role === "ANALYSIS")).toMatchObject({ calls: 1, avgTokensIn: 3000 });
    expect(rows.find((row) => row.turnIndex === 1 && row.role === "PERSONA")).toMatchObject({ calls: 2 });
  });

  it("counts whole days in UTC+7: a call three days old is in a five-day window, not in today's", async () => {
    await getDb()
      .insert(llmCalls)
      .values(call({ scope: "moderation", role: "MODERATION", createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }));
    expect(await spendByRole(getDb(), oneDay)).toEqual([]);
    expect(await spendByRole(getDb(), { days: 5 })).toMatchObject([{ scope: "moderation", calls: 1 }]);
  });

  it("leaves replay turns out of the per-turn token averages", async () => {
    const { first } = await seed();
    const [branch] = await getDb().insert(branches).values({ sessionId: first.id, kind: "replay", forkAfterTurn: 1 }).returning({ id: branches.id });
    await getDb().insert(llmCalls).values(call({ sessionId: first.id, branchId: branch.id, turnIndex: 2, role: "ANALYSIS", tokensIn: 99_000 }));
    expect((await tokensByTurn(getDb(), oneDay)).find((row) => row.turnIndex === 2 && row.role === "ANALYSIS")).toMatchObject({ calls: 1, avgTokensIn: 3000 });
  });
});

describe("il cost-report", () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
  }

  it("prints every section", async () => {
    await seed();
    const { io, out } = capture();
    expect(await runCostReport(["--days", "1"], io, getDb())).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("Chi phí LLM 1 ngày gần nhất");
    expect(text).toContain("Phiên phỏng vấn: 2 phiên");
    expect(text).toContain("EVAL_LEAK_JUDGE");
  });

  it("prints one run, and refuses an unknown one, a bad option and a missing database", async () => {
    const { runId } = await seed();
    const ok = capture();
    expect(await runCostReport(["--run", runId], ok.io, getDb())).toBe(0);
    expect(ok.out.join("\n")).toContain(runId);

    const notId = capture();
    expect(await runCostReport(["--run", "abc"], notId.io, getDb())).toBe(1);
    expect(notId.err.join("")).toContain("không phải id");

    const missing = capture();
    expect(await runCostReport(["--run", "00000000-0000-0000-0000-000000000000"], missing.io, getDb())).toBe(1);
    const bad = capture();
    expect(await runCostReport(["--days", "0"], bad.io, getDb())).toBe(1);
    expect(bad.err.join("")).toContain("--days");
    const noDb = capture();
    expect(await runCostReport([], noDb.io, null)).toBe(1);
  });
});
