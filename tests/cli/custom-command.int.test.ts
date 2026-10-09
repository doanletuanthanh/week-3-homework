import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { adminAccessLog, scenarios, sessions } from "@/db/schema";
import { getCustomQuota, reportCustomProblem } from "@/server/custom-topic";
import { runConfig } from "../../cli/commands/config";
import { MAX_COST_PER_PLAYABLE_USD, STATS_WINDOW, customStats, runCustom } from "../../cli/commands/custom";
import { CliError } from "../../cli/scenario-file";
import { INVALID, TOPIC, attempt, expireAttempt, generatedScenarios, sessionsOf, submit, userRow } from "../helpers/custom-db";
import { createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const admin = () => "admin@example.com";
const noOperator = () => {
  throw new CliError("Lệnh này cần biết ai đang chạy: đặt OPERATOR_EMAIL trong .env.local.");
};

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

const log = () => db().select().from(adminAccessLog).orderBy(adminAccessLog.at);

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("il custom list", () => {
  it("prints every request with what became of it and writes the access log first", async () => {
    const learner = await createLearner("minh@example.com");
    const passed = await attempt(learner);
    await db().update(sessions).set({ status: "revealed" }).where(eq(sessions.id, passed.sessionId));
    await reportCustomProblem(db(), learner, passed.sessionId);
    const other = await createLearner("lan@example.com");
    await attempt(other, INVALID);
    await submit(other, { moderation: { decision: "refuse", reason_code: "sexual", constraints: [], focus: "general" } }, { topic: "một chủ đề bị từ chối" });

    const { io, out } = capture();
    expect(await runCustom(["list"], io, db(), admin)).toBe(0);

    const text = out.join("\n");
    expect(text).toContain(`minh@example.com  passed`);
    expect(text).toContain(`chủ đề: ${TOPIC}`);
    expect(text).toContain(`kịch bản: ${(await generatedScenarios())[0].id}`);
    expect(text).toContain("NGƯỜI HỌC BÁO LỖI");
    expect(text).toContain("lan@example.com  failed (invalid)");
    expect(text).toContain("lan@example.com  từ chối (sexual)");
    expect(text).toContain("chủ đề: một chủ đề bị từ chối");
    expect(await log()).toMatchObject([{ adminEmail: "admin@example.com", channel: "cli", action: "custom list" }]);
  });

  it("closes an attempt nobody finished in time before listing, so it is not shown as running for ever", async () => {
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner);
    if (!result.ok) throw new Error("unreachable");
    await expireAttempt(result.attemptId);

    const { io, out } = capture();
    await runCustom(["list", "--limit", "5"], io, db(), admin);
    expect(out.join("\n")).toContain("system_error (system_error)");
  });

  it("needs to know who is running it, and shows nothing when it does not", async () => {
    await attempt(await createLearner("minh@example.com"), INVALID);
    const { io, out, err } = capture();
    expect(await runCustom(["list"], io, db(), noOperator)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("OPERATOR_EMAIL");
    expect(await log()).toEqual([]);
  });
});

describe("il custom takedown", () => {
  it("takes the scenario away from its owner, withdraws the unfinished session, and logs the reason", async () => {
    const learner = await createLearner("minh@example.com");
    const { sessionId } = await attempt(learner);
    const [scenario] = await generatedScenarios();

    const { io, out } = capture();
    expect(await runCustom(["takedown", scenario.id, "--reason", "nhân vật nêu tên một công ty thật"], io, db(), admin)).toBe(0);

    expect(out.join("\n")).toContain("1 buổi đang dở");
    expect((await db().select().from(scenarios).where(eq(scenarios.id, scenario.id)))[0].status).toBe("taken_down");
    expect((await sessionsOf(learner.id))[0]).toMatchObject({ id: sessionId, status: "withdrawn" });
    expect(await log()).toMatchObject([{ adminEmail: "admin@example.com", userId: learner.id, action: `custom takedown ${scenario.id}: nhân vật nêu tên một công ty thật` }]);
  });

  it("refuses without a reason, for an id that is no generated scenario, and for an authored persona", async () => {
    await attempt(await createLearner("minh@example.com"));
    const [scenario] = await generatedScenarios();
    const authored = (await db().select().from(scenarios).where(eq(scenarios.origin, "authored")))[0];

    for (const args of [["takedown", scenario.id], ["takedown", scenario.id, "--reason", "   "], ["takedown", "not-an-id", "--reason", "x"], ["takedown", randomUUID(), "--reason", "x"], ["takedown", authored.id, "--reason", "x"]]) {
      const { io, err } = capture();
      expect(await runCustom(args, io, db(), admin), args.join(" ")).toBe(1);
      expect(err).toHaveLength(1);
    }
    expect((await db().select().from(scenarios).where(eq(scenarios.id, scenario.id)))[0].status).toBe("published");
    expect((await db().select().from(scenarios).where(eq(scenarios.id, authored.id)))[0].status).toBe("draft");
    expect(await log()).toEqual([]);
  });
});

describe("il custom refund", () => {
  it("gives the free scenario back to the learner and logs it", async () => {
    const learner = await createLearner("minh@example.com");
    await attempt(learner);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "free_used" });

    const { io } = capture();
    expect(await runCustom(["refund", learner.id], io, db(), admin)).toBe(0);
    expect((await userRow(learner.id)).freeCustomUsed).toBe(false);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, freeLeft: 1 });
    expect(await log()).toMatchObject([{ userId: learner.id, action: "custom refund" }]);
  });

  it("refuses an id that names no learner", async () => {
    const { io, err } = capture();
    expect(await runCustom(["refund", randomUUID()], io, db(), admin)).toBe(1);
    expect(err.join("\n")).toContain("Không tìm thấy người học");
    expect(await runCustom(["refund", "minh@example.com"], io, db(), admin)).toBe(1);
  });
});

describe("il custom stats and the kill switch (FR-56)", () => {
  it("prints the pass rate and the cost of a playable scenario over the requests that passed moderation", async () => {
    await attempt(await createLearner("a@example.com"));
    await attempt(await createLearner("b@example.com"), INVALID);
    await submit(await createLearner("c@example.com"), { moderation: { decision: "refuse", reason_code: "other", constraints: [], focus: "general" } });

    const { io, out } = capture();
    expect(await runCustom(["stats"], io, db(), admin)).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("2 yêu cầu gần nhất (cửa sổ 30): 1 qua, 1 trượt, 0 lỗi hệ thống.");
    expect(text).toContain("Tỉ lệ qua: 50.0%");
    expect(text).toContain("Chưa đủ 30 yêu cầu để áp ngưỡng tắt.");
    expect(await log()).toMatchObject([{ action: "custom stats" }]);
  }, 30_000);

  it("pauses Màn 10 when the operator turns the path off with config set", async () => {
    const learner = await createLearner("minh@example.com");
    const { io } = capture();
    expect(await runConfig(["set", "custom_path_enabled", "false"], io, db(), admin)).toBe(0);
    expect(await getConfig(db(), "custom_path_enabled")).toBe(false);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "paused" });
    expect((await submit(learner)).result).toMatchObject({ error: "blocked", block: "paused" });

    expect(await runConfig(["set", "generation_reserve_usd", "0"], io, db(), admin)).toBe(1);
    expect(await runConfig(["set", "generation_daily_budget_usd", "25"], io, db(), admin)).toBe(0);
    expect(await getConfig(db(), "generation_daily_budget_usd")).toBe(25);
  });

  it("prints the usage for anything else", async () => {
    const { io, err } = capture();
    expect(await runCustom(["delete-everything"], io, db(), admin)).toBe(1);
    expect(await runCustom([], io, db(), admin)).toBe(1);
    expect(await runCustom(["list"], io, null, admin)).toBe(1);
    expect(err[0]).toContain("Cách dùng: il custom list");
    expect(err[2]).toContain("cần cơ sở dữ liệu");
  });
});

describe("customStats: the numbers the switch decision reads", () => {
  type Row = Parameters<typeof customStats>[0][number];
  const row = (outcome: string, costActualUsd: number) => ({ attempt: { outcome, costActualUsd } }) as unknown as Row;
  const many = (count: number, outcome: string, cost: number) => Array.from({ length: count }, () => row(outcome, cost));

  it("counts passes over finished requests, and what one playable scenario cost with the failed tries in it", () => {
    const stats = customStats([...many(2, "passed", 1), ...many(1, "failed", 0.5), ...many(1, "system_error", 0.5), row("refused", 0), row("running", 0)]);
    expect(stats).toMatchObject({ requests: 4, passed: 2, failed: 1, systemErrors: 1, passRate: 0.5, costUsd: 3, costPerPlayable: 1.5, switchOff: false });
  });

  it("does not apply the rule before the window is full", () => {
    expect(customStats(many(STATS_WINDOW - 1, "failed", 1))).toMatchObject({ passRate: 0, costPerPlayable: null, switchOff: false });
    expect(customStats([])).toMatchObject({ requests: 0, passRate: null, costPerPlayable: null, switchOff: false });
  });

  it("says to switch off below a 50 % pass rate, or above 12 USD a playable scenario", () => {
    expect(customStats([...many(14, "passed", 1), ...many(16, "failed", 1)])).toMatchObject({ switchOff: true });
    expect(customStats([...many(15, "passed", 1), ...many(15, "failed", 1)])).toMatchObject({ passRate: 0.5, switchOff: false });
    expect(customStats(many(30, "passed", MAX_COST_PER_PLAYABLE_USD + 0.5))).toMatchObject({ passRate: 1, switchOff: true });
    expect(customStats(many(30, "passed", MAX_COST_PER_PLAYABLE_USD))).toMatchObject({ switchOff: false });
    expect(customStats(many(30, "failed", 0.1))).toMatchObject({ switchOff: true });
  });
});
