import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { generationCommittedToday, refundFreeScenario, sweepStaleAttempts } from "@/db/repo/custom-topics";
import { generationAttempts, llmCalls, users } from "@/db/schema";
import { resolveUser } from "@/server/auth";
import { sessionSpendToday } from "@/server/cost-cap";
import { getCustomQuota } from "@/server/custom-topic";
import { deleteAccount } from "@/server/delete-account";
import {
  INVALID,
  addGenerationSpend,
  attempt,
  attemptRow,
  attemptsOf,
  backdateAttempts,
  customTopics,
  generatedScenarios,
  sessionsOf,
  setBudget,
  expireAttempt,
  stopHeartbeat,
  submit,
  userRow,
} from "../helpers/custom-db";
import { createGoogleLearner, createLearner, giveGoogleAccount, googleClaims, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const REFUSE = { moderation: { decision: "refuse", reason_code: "real_person", constraints: [], focus: "general" } };
const blocked = (block: string, runningSessionId: string | null = null) => ({ ok: false, error: "blocked", block, runningSessionId });

vi.setConfig({ testTimeout: 60_000 });

beforeEach(resetDatabase);

describe("the limits of FR-56, read on Màn 10", () => {
  it("starts with one free scenario and three attempts", async () => {
    const learner = await createLearner("minh@example.com");
    expect(await getCustomQuota(db(), learner)).toEqual({ block: null, runningSessionId: null, freeLeft: 1, attemptsLeftToday: 3, reserveUsd: 1 });
  });

  it("allows one running attempt: a second submit is refused and names the session being prepared", async () => {
    const learner = await createLearner("minh@example.com");
    const first = await submit(learner);
    if (!first.result.ok) throw new Error("unreachable");

    const second = await submit(learner);
    expect(second.result).toEqual(blocked("running", first.result.sessionId));
    // Refused before the moderation call: the learner cannot start a second one, so nothing is checked.
    expect(second.models.calls).toEqual([]);
    expect(await attemptsOf(learner.id)).toHaveLength(1);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "running", runningSessionId: first.result.sessionId, attemptsLeftToday: 2 });
  });

  it("creates one attempt when five submits arrive together", async () => {
    const learner = await createLearner("minh@example.com");
    const results = await Promise.all(Array.from({ length: 5 }, () => submit(learner)));

    expect(results.filter(({ result }) => result.ok)).toHaveLength(1);
    for (const { result } of results.filter(({ result }) => !result.ok)) expect(result).toMatchObject({ error: "blocked", block: "running" });
    expect(await attemptsOf(learner.id)).toHaveLength(1);
    expect(await sessionsOf(learner.id)).toHaveLength(1);
    expect(await customTopics()).toHaveLength(1);
  });

  it("refuses a second running attempt in the database itself, whatever the code above it does", async () => {
    const learner = await createLearner("minh@example.com");
    await submit(learner);
    const second = db().insert(generationAttempts).values({ userId: learner.id, topicText: "một chủ đề khác", focus: "general", moderationDecision: "allow", outcome: "running" });
    await expect(second).rejects.toMatchObject({ cause: { constraint_name: "generation_attempt_running_key" } });
  });

  it("blocks the fourth attempt of a day, and opens again the next day", async () => {
    const learner = await createLearner("minh@example.com");
    for (let count = 1; count <= 3; count += 1) {
      expect((await attempt(learner, INVALID)).outcome).toBe("failed");
      expect((await getCustomQuota(db(), learner)).attemptsLeftToday).toBe(3 - count);
    }

    const fourth = await submit(learner);
    expect(fourth.result).toEqual(blocked("daily_attempts"));
    expect(fourth.models.calls).toEqual([]);
    expect(await attemptsOf(learner.id)).toHaveLength(3);

    await backdateAttempts(learner.id, 1);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3 });
    expect((await submit(learner)).result).toMatchObject({ ok: true });
  });

  it("counts a passed attempt and a failed one, not a refusal and not a system error", async () => {
    const learner = await createLearner("minh@example.com");
    await submit(learner, REFUSE);
    await submit(learner, REFUSE);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3 });

    // The safety call fails after its retries: a system error.
    const broken = await attempt(learner, { override: { SAFETY: () => ({ error: new Error("provider down") }) } });
    expect(broken.outcome).toBe("system_error");
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
    expect((await userRow(learner.id)).customFailedCount).toBe(0);

    await attempt(learner, INVALID);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 2, freeLeft: 1 });
    expect((await userRow(learner.id)).customFailedCount).toBe(1);
  });

  it("closes the path to an account for good after six failed attempts: the seventh is refused", async () => {
    const learner = await createLearner("minh@example.com");
    for (let count = 1; count <= 6; count += 1) {
      await attempt(learner, INVALID);
      await backdateAttempts(learner.id, 1);
    }
    expect((await userRow(learner.id)).customFailedCount).toBe(6);

    const seventh = await submit(learner);
    expect(seventh.result).toEqual(blocked("failures_exhausted"));
    expect(seventh.models.calls).toEqual([]);
    // It is for the life of the account: another day changes nothing.
    await backdateAttempts(learner.id, 30);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "failures_exhausted" });
  });

  it("spends the free scenario only on a pass, and an operator can give it back", async () => {
    const learner = await createLearner("minh@example.com");
    await attempt(learner, INVALID);
    expect((await userRow(learner.id)).freeCustomUsed).toBe(false);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, freeLeft: 1 });

    expect((await attempt(learner)).outcome).toBe("passed");
    expect((await userRow(learner.id)).freeCustomUsed).toBe(true);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "free_used", freeLeft: 0 });
    expect((await submit(learner)).result).toEqual(blocked("free_used"));

    expect(await refundFreeScenario(db(), learner.id, null)).toBe(true);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, freeLeft: 1, attemptsLeftToday: 1 });
  }, 30_000);

  it("locks the path until midnight after ten refused topics in a day", async () => {
    const learner = await createLearner("minh@example.com");
    for (let count = 0; count < 10; count += 1) expect((await submit(learner, REFUSE)).result).toEqual({ ok: false, error: "refused" });

    const next = await submit(learner);
    expect(next.result).toEqual(blocked("refusal_locked"));
    expect(next.models.calls).toEqual([]);
    expect(await sessionsOf(learner.id)).toEqual([]);

    await backdateAttempts(learner.id, 1);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: null, attemptsLeftToday: 3 });
  });

  it("shows the paused state first when the operator turned the path off, and takes no attempt", async () => {
    const learner = await createLearner("minh@example.com");
    await submit(learner);
    await setConfig(db(), "custom_path_enabled", false, "admin@example.com");

    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "paused" });
    const other = await createLearner("lan@example.com");
    const refused = await submit(other);
    expect(refused.result).toEqual(blocked("paused"));
    expect(refused.models.calls).toEqual([]);

    await setConfig(db(), "custom_path_enabled", true, "admin@example.com");
    expect((await submit(other)).result).toMatchObject({ ok: true });
  });

  it("is checked for a demo account too (FR-45)", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    const first = await submit(demo);
    expect(first.result).toMatchObject({ ok: true });
    expect((await sessionsOf(demo.id))[0].isDemo).toBe(true);
    expect((await submit(demo)).result).toMatchObject({ error: "blocked", block: "running" });
  });
});

describe("the generation budget (FR-56): reserved up front, apart from the session cap", () => {
  it("holds the reserve of a running attempt and gives back what was not spent when it ends", async () => {
    await setBudget(1, 0.1);
    const learner = await createLearner("minh@example.com");
    const { result } = await submit(learner);
    if (!result.ok) throw new Error("unreachable");
    expect(await generationCommittedToday(db())).toBeCloseTo(0.1, 9);

    const { runGeneration } = await import("@/server/generation");
    const { dbModels } = await import("../helpers/custom-db");
    await runGeneration(db(), result.attemptId, { llmDeps: dbModels(INVALID).llmDeps });
    const row = await attemptRow(result.attemptId);
    // Three generator tries were paid for; the rest of the reserve is free again.
    expect(row.costActualUsd).toBeGreaterThan(0);
    expect(row.costActualUsd).toBeLessThan(0.01);
    expect(await generationCommittedToday(db())).toBeCloseTo(row.costActualUsd, 9);
  });

  it("blocks a new attempt when the day's budget cannot hold another reserve, and leaves sessions alone", async () => {
    await setBudget(1, 0.1);
    await addGenerationSpend(0.95);
    const learner = await createLearner("minh@example.com");

    const refused = await submit(learner);
    expect(refused.result).toEqual(blocked("budget_exhausted"));
    expect(refused.models.calls).toEqual([]);
    // The two budgets are apart: generation spend is not session spend, and a session can still start.
    expect(await sessionSpendToday(db())).toBe(0);
    const { startSession } = await import("../helpers/test-db");
    expect((await startSession(learner)).status).toBe("interviewing");
  });

  it("blocks an account that used a fifth of the day's budget while others can still start", async () => {
    await setBudget(1, 0.1);
    const heavy = await createLearner("heavy@example.com");
    const first = await attempt(heavy, INVALID);
    // As if that attempt had cost 0.15 USD: with another reserve the account would pass 20 % of 1 USD.
    await addGenerationSpend(0.15, first.attemptId);

    expect(await getCustomQuota(db(), heavy)).toMatchObject({ block: "budget_exhausted" });
    expect((await submit(heavy)).result).toEqual(blocked("budget_exhausted"));
    const light = await createLearner("light@example.com");
    expect((await submit(light)).result).toMatchObject({ ok: true });
  });

  it("never lets reserved plus spent pass the budget when five learners submit together", async () => {
    await setBudget(0.05, 0.01);
    await addGenerationSpend(0.025);
    const learners = await Promise.all(Array.from({ length: 5 }, (_, index) => createLearner(`learner-${index}@example.com`)));

    const results = await Promise.all(learners.map((learner) => submit(learner)));

    // 0.025 spent: two reserves of 0.01 fit under 0.05, a third does not.
    expect(results.filter(({ result }) => result.ok)).toHaveLength(2);
    for (const { result } of results.filter(({ result }) => !result.ok)) expect(result).toEqual(blocked("budget_exhausted"));
    expect(await generationCommittedToday(db())).toBeCloseTo(0.045, 9);
    expect(await generationCommittedToday(db())).toBeLessThanOrEqual(0.05);
  });

  it("frees the budget, the running slot and the session of an attempt nobody finished in time", async () => {
    await setBudget(0.05, 0.01);
    await addGenerationSpend(0.035);
    const stuck = await createLearner("stuck@example.com");
    const waiting = await createLearner("waiting@example.com");
    const first = await submit(stuck);
    if (!first.result.ok) throw new Error("unreachable");
    // 0.035 spent and 0.01 held by the running attempt: there is no room for a second reserve.
    expect((await submit(waiting)).result).toMatchObject({ error: "blocked", block: "budget_exhausted" });

    // Its ten minutes are over and nobody finished it.
    await expireAttempt(first.result.attemptId);
    // The next submit of anyone closes the dead attempt before it reads the budget.
    expect((await submit(waiting)).result).toMatchObject({ ok: true });

    expect(await attemptRow(first.result.attemptId)).toMatchObject({ outcome: "system_error", failureCode: "system_error", runToken: null });
    expect((await sessionsOf(stuck.id))[0].status).toBe("failed_eval");
    // It was a system error: the learner has all three attempts. The budget is now held by the other learner's attempt.
    expect(await getCustomQuota(db(), stuck)).toMatchObject({ block: "budget_exhausted", attemptsLeftToday: 3 });
    await setBudget(1, 0.01);
    expect(await getCustomQuota(db(), stuck)).toMatchObject({ block: null, attemptsLeftToday: 3 });
    expect((await userRow(stuck.id)).customFailedCount).toBe(0);
  });

  it("closes an attempt past its deadline wherever the limits are read, and only that one", async () => {
    const late = await createLearner("late@example.com");
    const fresh = await createLearner("fresh@example.com");
    const young = await submit(fresh);
    // The request started 601 seconds ago: the attempt is past its deadline the moment it exists.
    const old = await submit(late, {}, {}, Date.now() - 601_000);
    if (!old.result.ok || !young.result.ok) throw new Error("unreachable");

    expect(await sweepStaleAttempts(db())).toBe(1);
    expect((await attemptRow(old.result.attemptId)).outcome).toBe("system_error");
    expect((await attemptRow(young.result.attemptId)).outcome).toBe("running");
    expect(await sweepStaleAttempts(db())).toBe(0);
  });
});

describe("the limits survive deleting the account and signing in again (accepted deviation from FR-66)", () => {
  const SUBJECT = "google-subject-of-minh";

  async function signInAgain(email = "minh@example.com") {
    const again = await resolveUser(db(), googleClaims(email), { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: [] });
    await giveGoogleAccount(again!, SUBJECT);
    return again!;
  }

  it("keeps the used free scenario", async () => {
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    await attempt(learner);
    await db().update(users).set({ visibilityAckVersion: 1 }).where(eq(users.id, learner.id));
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    const again = await signInAgain();
    expect(again.id).not.toBe(learner.id);
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: "free_used", freeLeft: 0 });
    expect((await submit(again)).result).toMatchObject({ error: "blocked", block: "free_used" });
  }, 30_000);

  it("keeps the lifetime failures, today's attempts, today's refusals and today's spend", async () => {
    await setBudget(1, 0.1);
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    const first = await attempt(learner, INVALID);
    await attempt(learner, INVALID);
    await submit(learner, REFUSE);
    await addGenerationSpend(0.08, first.attemptId);
    const spentBefore = await generationCommittedToday(db());
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    // Nothing of the learner is left: no attempt, no topic, no generated scenario.
    expect(await db().select().from(generationAttempts)).toEqual([]);
    expect(await customTopics()).toEqual([]);
    expect(await generatedScenarios()).toEqual([]);
    // The day's budget reads the same total: the spend moved to the ledger.
    expect(await generationCommittedToday(db())).toBeCloseTo(spentBefore, 9);
    expect((await db().select().from(llmCalls)).filter((call) => call.scope === "generation" && call.sessionId !== null)).toEqual([]);

    const again = await signInAgain();
    const quota = await getCustomQuota(db(), again);
    expect(quota).toMatchObject({ block: null, attemptsLeftToday: 1, freeLeft: 1 });
    // One more failed attempt and the two kept ones are three for the day.
    await attempt(again, INVALID);
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: "daily_attempts", attemptsLeftToday: 0 });

    // The account share counts what the deleted account spent today: 0.08 kept, and 0.1 more would pass 0.2.
    await backdateAttempts(again.id, 0);
    const kept = await db().execute<{ failed: number; spend: number; refusals: number }>(
      (await import("drizzle-orm")).sql`SELECT custom_failed_count AS failed, custom_spend_usd::float8 AS spend, custom_refusals AS refusals FROM quota_tombstone`,
    );
    expect(kept[0].failed).toBe(2);
    expect(kept[0].refusals).toBe(1);
    expect(kept[0].spend).toBeGreaterThan(0.08);
  });

  it("starts the day counters again on a later day, and keeps the lifetime ones", async () => {
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    for (let count = 0; count < 3; count += 1) await attempt(learner, INVALID);
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });
    const { sql } = await import("drizzle-orm");
    await db().execute(sql`UPDATE quota_tombstone SET custom_day = custom_day - 1`);

    const again = await signInAgain();
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: null, attemptsLeftToday: 3 });
    for (let count = 0; count < 3; count += 1) {
      await attempt(again, INVALID);
      await backdateAttempts(again.id, 1);
    }
    // Three before the deletion and three after: six for the Google account.
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: "failures_exhausted" });
  });

  it("keeps the account's share of the budget even when every attempt of the day was a system error", async () => {
    await setBudget(1, 0.1);
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    const broken = await attempt(learner, { override: { SAFETY: () => ({ error: new Error("provider down") }) } });
    expect(broken.outcome).toBe("system_error");
    // As if the failed tries had cost 0.15 USD: with another reserve the account would pass 20 % of 1 USD.
    await addGenerationSpend(0.15, broken.attemptId);
    expect(await getCustomQuota(db(), learner)).toMatchObject({ block: "budget_exhausted", attemptsLeftToday: 3 });
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    expect(await getCustomQuota(db(), await signInAgain())).toMatchObject({ block: "budget_exhausted", attemptsLeftToday: 3 });
  });

  it("gives the free scenario back to a learner whose use of it is in the kept row", async () => {
    const { quotaKeyOf } = await import("@/server/quota");
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    await attempt(learner);
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });
    const again = await signInAgain();
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: "free_used" });

    // Without the key only the new account's own flag is cleared, and the kept one still blocks.
    expect(await refundFreeScenario(db(), again.id, null)).toBe(true);
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: "free_used" });
    expect(await refundFreeScenario(db(), again.id, await quotaKeyOf(db(), again.id))).toBe(true);
    expect(await getCustomQuota(db(), again)).toMatchObject({ block: null, freeLeft: 1 });
  });

  it("does not hold the account for an attempt whose runner died", async () => {
    const learner = await createGoogleLearner("minh@example.com", SUBJECT);
    const { result } = await submit(learner);
    if (!result.ok) throw new Error("unreachable");
    // A runner is working on it: the account waits.
    const { claimAttempt } = await import("@/db/repo/custom-topics");
    expect(await claimAttempt(db(), result.attemptId)).not.toBeNull();
    expect(await deleteAccount(db(), learner)).toEqual({ ok: false, error: "generating" });

    await stopHeartbeat(result.attemptId);
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });
    expect(await db().select().from(generationAttempts)).toEqual([]);
    // A system error is not an attempt: nothing of it is kept.
    expect(await getCustomQuota(db(), await signInAgain())).toMatchObject({ block: null, attemptsLeftToday: 3, freeLeft: 1 });
  });
});
