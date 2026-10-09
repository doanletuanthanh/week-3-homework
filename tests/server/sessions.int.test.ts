import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { getSession, listTurns } from "@/db/repo/sessions";
import { branches, dailySpend, events, llmCalls, scenarios, sessions, snapshots, turns } from "@/db/schema";
import { canStartSession, sessionSpendToday } from "@/server/cost-cap";
import { openSession, sessionEntryPath } from "@/server/sessions";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { PERSONA_FILE, PERSONA_ID, createLearner, resetDatabase, startSession } from "../helpers/test-db";

const DEMO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] };

beforeEach(resetDatabase);

describe("openSession", () => {
  it("creates the session with its main branch, turn 0 and snapshot 0 together", async () => {
    const learner = await createLearner("linh@example.com");

    const session = await startSession(learner);

    expect(session).toMatchObject({ userId: learner.id, personaId: PERSONA_ID, status: "interviewing", isDemo: false, endedAt: null, turnClaim: null });
    const [branch] = await getDb().select().from(branches);
    expect(branch).toMatchObject({ sessionId: session.id, kind: "main" });

    const transcript = await listTurns(getDb(), learner.id, session.id);
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toMatchObject({ index: 0, learnerText: null, learnerTokens: null, branchId: branch.id });
    expect(transcript[0].personaText).toContain("chị là Thu");
    expect(transcript[0].personaTokens.join(" ")).toBe(transcript[0].personaText);

    expect(await getDb().select().from(snapshots)).toMatchObject([
      { sessionId: session.id, branchId: branch.id, index: 0, unlocked: [], ledger: [], disclosed: [], openness: 4 },
    ]);
  });

  it("writes one session_started event with the persona, the topic and the kind", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await startSession(learner); // "Tiếp tục": no second event

    expect(await getDb().select().from(events)).toMatchObject([
      {
        userId: learner.id,
        sessionId: session.id,
        name: "session_started",
        props: { persona_id: PERSONA_ID, topic_id: "ux-chi-tieu", kind: "curated", scenario_version: 1 },
      },
    ]);
  });

  it("returns the existing session instead of starting a second one for the same persona", async () => {
    const learner = await createLearner("linh@example.com");

    const first = await startSession(learner);
    const second = await startSession(learner);

    expect(second.id).toBe(first.id);
    expect(await getDb().select().from(sessions)).toHaveLength(1);
    expect(await getDb().select().from(turns)).toHaveLength(1);
    expect(await getDb().select().from(snapshots)).toHaveLength(1);
  });

  it("creates one session when the same learner presses start several times at once", async () => {
    const learner = await createLearner("linh@example.com");

    const results = await Promise.all(Array.from({ length: 5 }, () => startSession(learner)));

    expect(new Set(results.map((session) => session.id)).size).toBe(1);
    expect(await getDb().select().from(sessions)).toHaveLength(1);
    expect(await getDb().select().from(turns)).toHaveLength(1);
    expect(await getDb().select().from(branches)).toHaveLength(1);
    expect(await getDb().select().from(events)).toHaveLength(1);
  });

  it("is held to one session per learner and persona by the database, not only by the check", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);

    const second = getDb().insert(sessions).values({ userId: learner.id, scenarioId: session.scenarioId, personaId: PERSONA_ID });

    await expect(second).rejects.toMatchObject({ cause: { constraint_name: "session_user_persona_key" } });
  });

  it("does not count a withdrawn session: the learner starts again with the persona", async () => {
    const learner = await createLearner("linh@example.com");
    const first = await startSession(learner);
    await getDb().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, first.id));

    const second = await startSession(learner);

    expect(second.id).not.toBe(first.id);
    expect(await getDb().select().from(sessions)).toHaveLength(2);
  });

  it("gives a demo account a new session every time, and writes no event for it", async () => {
    const demo = await createLearner("demo@example.com", DEMO_LISTS);

    const first = await startSession(demo);
    const second = await startSession(demo);

    expect(second.id).not.toBe(first.id);
    expect(first.isDemo).toBe(true);
    expect(await getDb().select().from(events)).toHaveLength(0);
  });

  it("gives each learner their own session with the same persona", async () => {
    const a = await startSession(await createLearner("a@example.com"));
    const b = await startSession(await createLearner("b@example.com"));
    expect(a.id).not.toBe(b.id);
  });

  it("refuses an unknown persona and creates nothing", async () => {
    const learner = await createLearner("linh@example.com");
    const result = await openSession(getDb(), learner, "khong-co");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(sessionEntryPath(result, "khong-co")).toBe("/");
    expect(await getDb().select().from(sessions)).toHaveLength(0);
  });
});

describe("openSession: which version is playable", () => {
  const setStatus = (version: number, status: (typeof scenarios.$inferSelect)["status"]) =>
    getDb().update(scenarios).set({ status }).where(eq(scenarios.version, version));
  const versionOf = async (scenarioId: string) =>
    (await getDb().select({ version: scenarios.version }).from(scenarios).where(eq(scenarios.id, scenarioId)))[0].version;

  it("starts on the newest draft while the publish gate is off (the default)", async () => {
    await importScenarioFile(getDb(), PERSONA_FILE); // version 2, a draft
    const session = await startSession(await createLearner("linh@example.com"));
    expect(await versionOf(session.scenarioId!)).toBe(2);
  });

  it("skips versions that were unpublished, archived or taken down", async () => {
    await importScenarioFile(getDb(), PERSONA_FILE);
    await importScenarioFile(getDb(), PERSONA_FILE);
    await setStatus(3, "taken_down");
    await setStatus(2, "unpublished");

    const session = await startSession(await createLearner("linh@example.com"));

    expect(await versionOf(session.scenarioId!)).toBe(1);
  });

  it("starts only on a published version once require_published is on", async () => {
    await importScenarioFile(getDb(), PERSONA_FILE); // version 2, a draft
    await setConfig(getDb(), "require_published", true, "admin@example.com");
    const learner = await createLearner("linh@example.com");

    expect(await openSession(getDb(), learner, PERSONA_ID)).toEqual({ ok: false, reason: "not_found" });

    await setStatus(1, "published");
    const session = await startSession(learner);
    expect(await versionOf(session.scenarioId!)).toBe(1);
  });
});

describe("daily cost cap", () => {
  const spend = (usd: number, scope: "session" | "generation" | "eval" = "session", createdAt = new Date()) =>
    getDb()
      .insert(llmCalls)
      .values({ scope, role: "PERSONA", model: "gpt-6-luna", tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensReasoning: 0, costUsd: usd, latencyMs: 1, attempt: 1, ok: true, createdAt });
  /** Today's date in UTC+7, as the ledger stores it. */
  const todayInVietnam = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  it("adds today's session calls and the ledger, and ignores other scopes and earlier days", async () => {
    await spend(1.25);
    await spend(0.5);
    await spend(9, "generation");
    await spend(9, "eval");
    await spend(7, "session", new Date(Date.now() - 25 * 3_600_000));
    await getDb().insert(dailySpend).values([
      { day: todayInVietnam(), scope: "session", usd: 0.25 },
      { day: todayInVietnam(), scope: "generation", usd: 4 },
      { day: "2020-01-01", scope: "session", usd: 4 },
    ]);

    expect(await sessionSpendToday(getDb())).toBeCloseTo(2, 9);
  });

  it("counts a failed call's cost as well", async () => {
    await getDb()
      .insert(llmCalls)
      .values({ scope: "session", role: "ANALYSIS", model: "gpt-6-luna", tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensReasoning: 0, costUsd: 0.4, latencyMs: 1, attempt: 2, ok: false });
    expect(await sessionSpendToday(getDb())).toBeCloseTo(0.4, 9);
  });

  it("blocks learners at the cap minus the demo reserve, and demo accounts only at the cap", async () => {
    // Defaults: cap 5 USD, demo reserve 1 USD.
    await spend(3.99);
    expect(await canStartSession(getDb(), false)).toBe(true);
    await spend(0.01);
    expect(await canStartSession(getDb(), false)).toBe(false);
    expect(await canStartSession(getDb(), true)).toBe(true);
    await spend(1);
    expect(await canStartSession(getDb(), true)).toBe(false);
  });

  it("refuses a new session at the cap, sends the learner back to the prep screen, and writes nothing", async () => {
    await spend(4);
    const learner = await createLearner("linh@example.com");

    const result = await openSession(getDb(), learner, PERSONA_ID);

    expect(result).toEqual({ ok: false, reason: "cap_reached" });
    expect(sessionEntryPath(result, PERSONA_ID)).toBe("/prep/chi-thu?blocked=cap");
    expect(await getDb().select().from(sessions)).toHaveLength(0);
    expect(await getDb().select().from(events)).toHaveLength(0);
  });

  it("still returns a session that already exists when the cap is reached", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await spend(100);

    expect(await openSession(getDb(), learner, PERSONA_ID)).toMatchObject({ ok: true, session: { id: session.id } });
  });

  it("honours the demo reserve: a demo account starts a session a learner cannot", async () => {
    await spend(4.5);
    const demo = await createLearner("demo@example.com", DEMO_LISTS);
    expect(await openSession(getDb(), await createLearner("linh@example.com"), PERSONA_ID)).toEqual({ ok: false, reason: "cap_reached" });
    expect(await openSession(getDb(), demo, PERSONA_ID)).toMatchObject({ ok: true });
  });

  it("follows the cap and the reserve set in config", async () => {
    await spend(0.6);
    await setConfig(getDb(), "session_daily_cap_usd", 1, "admin@example.com");
    await setConfig(getDb(), "session_demo_reserve_usd", 0.5, "admin@example.com");
    expect(await canStartSession(getDb(), false)).toBe(false);
    expect(await canStartSession(getDb(), true)).toBe(true);

    await setConfig(getDb(), "session_daily_cap_usd", 10, "admin@example.com");
    expect(await canStartSession(getDb(), false)).toBe(true);
  });
});

describe("session ownership", () => {
  it("does not return learner A's session or turns to learner B", async () => {
    const a = await createLearner("a@example.com");
    const b = await createLearner("b@example.com");
    const session = await startSession(a);

    expect(await getSession(getDb(), a.id, session.id)).not.toBeNull();
    expect(await getSession(getDb(), b.id, session.id)).toBeNull();
    expect(await listTurns(getDb(), b.id, session.id)).toEqual([]);
  });

  it("returns null for a session id that does not exist", async () => {
    const a = await createLearner("a@example.com");
    expect(await getSession(getDb(), a.id, randomUUID())).toBeNull();
  });

  it("removes turns, snapshots, the branch and events with the learner's session", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);

    await getDb().delete(sessions).where(eq(sessions.id, session.id));

    for (const table of [turns, snapshots, branches, events]) expect(await getDb().select().from(table)).toHaveLength(0);
  });
});
