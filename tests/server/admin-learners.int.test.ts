import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { spendByDay } from "@/db/repo/cost-report";
import { recordLlmCall } from "@/db/repo/llm-calls";
import { loadSessionTrace } from "@/db/repo/turns";
import { adminAccessLog, config, generationAttempts, llmCalls } from "@/db/schema";
import { listAuditLog, listConfigFor, updateConfigFor } from "@/server/admin/config";
import { getCustomAttempt, getLearner, getTranscript, listCustomAttempts, listLearners } from "@/server/admin/learners";
import { describeTrace } from "@/server/session-trace";
import type { AppUser } from "@/server/auth";
import { deleteAccount } from "@/server/delete-account";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

const ADMIN = "admin@example.com";
const LISTS = { ADMIN_EMAILS: [ADMIN], DEMO_ACCOUNT_EMAILS: [] };
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const db = () => getDb();

vi.setConfig({ testTimeout: 60_000 });
beforeEach(resetDatabase);

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

const logRows = () => db().select().from(adminAccessLog);

async function spend(sessionId: string | null, costUsd: number, attemptId: string | null = null) {
  await recordLlmCall(db(), {
    scope: attemptId ? "generation" : "session", sessionId, attemptId, role: "ANALYSIS", model: "gemini-3.8-flash",
    tokensIn: 100, tokensOut: 10, tokensCached: 0, tokensReasoning: 0, costUsd, latencyMs: 100, attempt: 1, ok: true,
  });
}

async function attemptOf(learner: AppUser, overrides: Partial<typeof generationAttempts.$inferInsert> = {}) {
  const [row] = await db()
    .insert(generationAttempts)
    .values({ userId: learner.id, topicText: "Sinh viên tự nấu ăn để tiết kiệm", focus: "general", moderationDecision: "allow", outcome: "failed", failureCode: "invalid", ...overrides })
    .returning();
  return row;
}

/** Every admin call of this phase, with arguments that would work for an admin. */
const CALLS: [string, (user: AppUser | null) => Promise<unknown>][] = [
  ["listLearners", (user) => listLearners(db(), user, 1)],
  ["getLearner", (user) => getLearner(db(), user, UNKNOWN, 1)],
  ["getTranscript", (user) => getTranscript(db(), user, UNKNOWN)],
  ["listCustomAttempts", (user) => listCustomAttempts(db(), user, { page: 1 })],
  ["getCustomAttempt", (user) => getCustomAttempt(db(), user, UNKNOWN)],
  ["listConfigFor", (user) => listConfigFor(db(), user)],
  ["updateConfigFor", (user) => updateConfigFor(db(), user, { key: "session_daily_cap_usd", value: "1" })],
  ["listAuditLog", (user) => listAuditLog(db(), user, { page: 1 })],
];

describe("admin learners, config and audit: access", () => {
  it.each(CALLS)("%s answers 404 to a guest and a learner, and reads or changes nothing", async (_, call) => {
    const learner = await createLearner("an@example.com", LISTS);
    for (const user of [null, learner]) expect(isNotFound(await refusal(() => call(user)))).toBe(true);
    expect(await logRows()).toEqual([]);
    expect(await db().select().from(config)).toEqual([]);
  });
});

describe("admin learners", () => {
  it("lists accounts with their sessions, custom attempts and spend, and logs the read", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    const attempt = await attemptOf(learner);
    await spend(session.id, 0.02);
    // A custom attempt's call names its session too: it must count once.
    await spend(session.id, 0.03, attempt.id);
    await spend(null, 0.05, attempt.id);

    const list = await listLearners(db(), admin, 1);

    expect(list).toMatchObject({ page: 1, pages: 1, total: 2 });
    const row = list.rows.find((entry) => entry.id === learner.id)!;
    expect(row).toMatchObject({ email: "linh@example.com", sessions: 1, customAttempts: 1 });
    expect(row.spendUsd).toBeCloseTo(0.1, 9);
    expect(row.lastSeen.getTime()).toBeGreaterThanOrEqual(row.firstSeen.getTime());
    expect(await logRows()).toMatchObject([{ adminEmail: ADMIN, channel: "console", action: "list_learners", userId: null }]);
  });

  it("pages the list 50 rows at a time", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    for (let index = 0; index < 50; index += 1) await createLearner(`learner-${index}@example.com`, LISTS, { googleSubject: null });
    const first = await listLearners(db(), admin, 1);
    const second = await listLearners(db(), admin, 2);
    expect([first.rows.length, second.rows.length, first.pages, first.total]).toEqual([50, 1, 2, 51]);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(51);
  });

  it("shows one account with its sessions and their cost, logged with the learner", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await spend(session.id, 0.02);

    const detail = (await getLearner(db(), admin, learner.id, 1))!;

    expect(detail.learner).toMatchObject({ id: learner.id, sessions: 1 });
    expect(detail.sessions.rows).toMatchObject([{ id: session.id, status: "interviewing", personaId: "chi-thu", costUsd: 0.02 }]);
    expect(await logRows()).toMatchObject([{ action: "read_learner", userId: learner.id, sessionId: null }]);
    expect(await getLearner(db(), admin, UNKNOWN, 1)).toBeNull();
    expect(await getLearner(db(), admin, "not-a-uuid", 1)).toBeNull();
    expect(await logRows()).toHaveLength(1);
  });

  it("shows a transcript as the CLI trace does, and logs the read with the session and its learner", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    const callsBefore = (await db().select().from(llmCalls)).length;

    const transcript = (await getTranscript(db(), admin, session.id))!;

    expect(transcript).toMatchObject({ sessionId: session.id, userId: learner.id, ...describeTrace((await loadSessionTrace(db(), session.id))!) });
    expect(transcript.turns[0].title).toBe("Lượt 0 (lời mở đầu, không gọi LLM)");
    expect(await logRows()).toMatchObject([{ adminEmail: ADMIN, channel: "console", action: "read_transcript", sessionId: session.id, userId: learner.id }]);
    expect(await db().select().from(llmCalls)).toHaveLength(callsBefore);
    expect(await getTranscript(db(), admin, UNKNOWN)).toBeNull();
    expect(await logRows()).toHaveLength(1);
  });

  it("drops a deleted account from the lists while its spend stays in the day's total", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await spend(session.id, 0.04);
    const before = await spendByDay(db(), { days: 1 });

    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    expect((await listLearners(db(), admin, 1)).rows.map((row) => row.email)).toEqual([ADMIN]);
    expect(await getLearner(db(), admin, learner.id, 1)).toBeNull();
    const total = (rows: { usd: number }[]) => rows.reduce((sum, row) => sum + row.usd, 0);
    expect(total(await spendByDay(db(), { days: 1 }))).toBeCloseTo(total(before), 9);
  });
});

describe("admin custom topics", () => {
  it("lists requests without their topic text, filtered by outcome, and leaves admin drafts out", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const failed = await attemptOf(learner, { finishedAt: new Date(), costActualUsd: 0.12, runAttempt: 2 });
    await attemptOf(learner, { outcome: "refused", failureCode: null, reasonCode: "real_person" });
    await attemptOf(admin, { personaId: "chi-mai", outcome: "passed", failureCode: null });

    const all = await listCustomAttempts(db(), admin, { page: 1 });
    const onlyFailed = await listCustomAttempts(db(), admin, { outcome: "failed", page: 1 });

    expect(all.total).toBe(2);
    expect(onlyFailed.rows).toMatchObject([{ id: failed.id, email: "linh@example.com", failureCode: "invalid", costActualUsd: 0.12, runAttempt: 2 }]);
    expect(JSON.stringify(all.rows)).not.toContain("tiết kiệm");
    expect((await logRows()).map((row) => row.action)).toEqual(["list_custom_topics", "list_custom_topics failed"]);
  });

  it("shows the topic text on the detail page only, and logs that read with the learner", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const attempt = await attemptOf(learner);
    const draft = await attemptOf(admin, { personaId: "chi-mai" });

    const found = (await getCustomAttempt(db(), admin, attempt.id))!;

    expect(found).toMatchObject({ email: "linh@example.com", attempt: { topicText: "Sinh viên tự nấu ăn để tiết kiệm" } });
    expect(await logRows()).toMatchObject([{ action: "read_custom_topic", userId: learner.id }]);
    expect(await getCustomAttempt(db(), admin, draft.id)).toBeNull();
    expect(await logRows()).toHaveLength(1);
  });
});

describe("admin config", () => {
  it("lists every key with its value, default and meaning", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const entries = await listConfigFor(db(), admin);
    expect(entries.find((entry) => entry.key === "require_published")).toMatchObject({ value: false, defaultValue: false, kind: "boolean", isDefault: true });
    expect(entries.find((entry) => entry.key === "session_daily_cap_usd")).toMatchObject({ value: 5, kind: "number" });
    expect(entries.every((entry) => entry.summary.length > 0)).toBe(true);
  });

  it("changes a value for the next read and logs the old and new value", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    expect(await updateConfigFor(db(), admin, { key: "session_daily_cap_usd", value: " 2.5 " })).toEqual({ ok: true, key: "session_daily_cap_usd", from: 5, to: 2.5 });
    expect(await updateConfigFor(db(), admin, { key: "custom_path_enabled", value: "false" })).toMatchObject({ ok: true, from: true, to: false });

    expect(await getConfig(db(), "session_daily_cap_usd")).toBe(2.5);
    expect(await getConfig(db(), "custom_path_enabled")).toBe(false);
    expect((await logRows()).map((row) => [row.channel, row.action])).toEqual([
      ["console", "config set session_daily_cap_usd: 5 → 2.5"],
      ["console", "config set custom_path_enabled: true → false"],
    ]);
  });

  it.each([
    ["an unknown key", { key: "khong_co", value: "1" }, "unknown_key"],
    ["a value of the wrong type", { key: "require_published", value: "1" }, "invalid"],
    ["a negative cap", { key: "session_daily_cap_usd", value: "-1" }, "invalid"],
    ["a value that is not JSON", { key: "require_published", value: "yes" }, "not_json"],
  ])("refuses %s and changes and logs nothing", async (_, input, reason) => {
    const admin = await createLearner(ADMIN, LISTS);
    expect(await updateConfigFor(db(), admin, input)).toMatchObject({ ok: false, reason });
    expect(await db().select().from(config)).toEqual([]);
    expect(await logRows()).toEqual([]);
  });
});

describe("admin audit log", () => {
  it("lists the log newest first, filtered by admin and by how the action starts", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    await getTranscript(db(), admin, session.id);
    await updateConfigFor(db(), admin, { key: "session_daily_cap_usd", value: "3" });
    await db().insert(adminAccessLog).values({ adminEmail: "other@example.com", channel: "cli", action: "trace" });

    const all = await listAuditLog(db(), admin, { page: 1 });
    expect(all.rows.map((row) => row.action)).toEqual(["trace", "config set session_daily_cap_usd: 5 → 3", "read_transcript"]);
    expect(all.admins).toEqual([ADMIN, "other@example.com"]);
    expect((await listAuditLog(db(), admin, { page: 1, adminEmail: ADMIN })).total).toBe(2);
    expect((await listAuditLog(db(), admin, { page: 1, actionPrefix: "config" })).rows).toMatchObject([{ action: "config set session_daily_cap_usd: 5 → 3" }]);
    // Wildcards are text: `%` matches nothing.
    expect((await listAuditLog(db(), admin, { page: 1, actionPrefix: "%" })).total).toBe(0);
  });
});
