import { eq, sql } from "drizzle-orm";
import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { createPendingAction } from "@/db/repo/pending-actions";
import { logAdminAccess } from "@/db/repo/turns";
import { joinWaitlist } from "@/db/repo/waitlist";
import { adminAccessLog, branches, dailySpend, events, llmCalls, pendingActions, quotaTombstones, sessions, snapshots, turns, users, waitlist } from "@/db/schema";
import { resolveUser } from "@/server/auth";
import type { AppUser } from "@/server/auth";
import { canStartSession, sessionSpendToday } from "@/server/cost-cap";
import { deleteAccount } from "@/server/delete-account";
import { playedBeforeDeletion, quotaKeyOf } from "@/server/quota";
import { skipReplay, startReplay } from "@/server/replay";
import { openSession, sessionEntryPath } from "@/server/sessions";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { replayTurn, revealedSession } from "../helpers/replay-fixtures";
import { NOTES } from "../helpers/reveal-fixtures";
import { PLAYED, revealScript } from "../helpers/session-fixtures";
import { PERSONA_FILE, PERSONA_ID, authAccountRows, createGoogleLearner, createLearner, giveGoogleAccount, googleClaims, identityRows, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const NO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: [] };
const DEMO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] };
const LINH_SUBJECT = "google-subject-of-linh";
const keyOf = (subject: string) => createHmac("sha256", process.env.QUOTA_HASH_SECRET!).update(`google:${subject}`).digest("hex");
/** Today's date in UTC+7, as the ledger stores it. */
const dayInVietnam = (at: Date = new Date()) => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/**
 * A learner with a Google sign-in account and one finished session: six turns, notes, the reveal,
 * a guess, and a replay of one turn that was then stopped by skipping. Around it, one of every
 * other thing stored about a learner.
 */
async function learnerWithEverything(email = "linh@example.com", subject = LINH_SUBJECT) {
  const { learner, sessionId } = await revealedSession(PLAYED, NOTES, revealScript(), email);
  await giveGoogleAccount(learner, subject);
  await joinWaitlist(db(), learner.id, "no_more_personas");
  await createPendingAction(db(), { userId: learner.id, payload: { kind: "start_session", personaId: PERSONA_ID } });
  await logAdminAccess(db(), { adminEmail: "admin@example.com", channel: "cli", sessionId, userId: learner.id, action: "trace" });
  return { learner, sessionId };
}

/** Every row stored about the learner, per table. */
async function rowsAbout(learner: AppUser, sessionId: string) {
  return {
    user: (await db().select().from(users).where(eq(users.id, learner.id))).length,
    session: (await db().select().from(sessions).where(eq(sessions.userId, learner.id))).length,
    turn: (await db().select().from(turns).where(eq(turns.sessionId, sessionId))).length,
    snapshot: (await db().select().from(snapshots).where(eq(snapshots.sessionId, sessionId))).length,
    branch: (await db().select().from(branches).where(eq(branches.sessionId, sessionId))).length,
    eventOfUser: (await db().select().from(events).where(eq(events.userId, learner.id))).length,
    eventOfSession: (await db().select().from(events).where(eq(events.sessionId, sessionId))).length,
    pendingAction: (await db().select().from(pendingActions).where(eq(pendingActions.userId, learner.id))).length,
    waitlist: (await db().select().from(waitlist).where(eq(waitlist.userId, learner.id))).length,
    llmCall: (await db().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId))).length,
    accessLogWithIds: (await db().select().from(adminAccessLog)).filter((row) => row.userId !== null || row.sessionId !== null).length,
    authAccount: (await authAccountRows(learner.id)).length,
    authIdentity: (await identityRows(learner.id)).length,
  };
}

const NOTHING = {
  user: 0,
  session: 0,
  turn: 0,
  snapshot: 0,
  branch: 0,
  eventOfUser: 0,
  eventOfSession: 0,
  pendingAction: 0,
  waitlist: 0,
  llmCall: 0,
  accessLogWithIds: 0,
  authAccount: 0,
  authIdentity: 0,
};

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

describe("deleteAccount: what goes (FR-66)", () => {
  it("leaves no row about the learner in any table, and removes the sign-in account", async () => {
    const { learner, sessionId } = await learnerWithEverything();
    await replayTurnOnce(learner, sessionId);
    const before = await rowsAbout(learner, sessionId);
    // The setup really put one of everything there, so the zeros below mean something.
    for (const [table, count] of Object.entries(before)) expect(count, table).toBeGreaterThan(0);

    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    expect(await rowsAbout(learner, sessionId)).toEqual(NOTHING);
    expect(await authAccountRows(learner.id)).toHaveLength(0);
  });

  it("leaves nothing that holds the learner's address, id, session id or words", async () => {
    const { learner, sessionId } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    const kept = JSON.stringify({
      tombstones: await db().select().from(quotaTombstones),
      events: await db().select().from(events),
      ledger: await db().select().from(dailySpend),
      accessLog: await db().select().from(adminAccessLog),
      calls: await db().select().from(llmCalls),
    });
    for (const personal of [learner.email, "linh", learner.id, sessionId, LINH_SUBJECT, "gửi ba mẹ", "Chị thường quản lý"]) {
      expect(kept).not.toContain(personal);
    }
  });

  it("keeps the admin access log row, without the ids it pointed at", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    expect(await db().select().from(adminAccessLog)).toMatchObject([
      { adminEmail: "admin@example.com", channel: "cli", action: "trace", userId: null, sessionId: null },
    ]);
  });

  it("writes one event that an account was deleted, tied to nobody", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    expect(await db().select().from(events)).toMatchObject([{ name: "account_deleted", userId: null, sessionId: null, props: { sessions: 1 } }]);
  });

  it("writes no event for a demo account, whose sessions are in no metric", async () => {
    const demo = await createGoogleLearner("demo@example.com", "google-subject-of-demo", DEMO_LISTS);
    await startSession(demo);

    expect(await deleteAccount(db(), demo)).toEqual({ ok: true });

    expect(await db().select().from(events)).toEqual([]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("does not touch another learner's account or data", async () => {
    const { learner } = await learnerWithEverything();
    const other = await createGoogleLearner("an@example.com", "google-subject-of-an");
    const otherSession = await startSession(other);
    await joinWaitlist(db(), other.id, "no_more_personas");
    const before = await rowsAbout(other, otherSession.id);

    await deleteAccount(db(), learner);

    expect(await rowsAbout(other, otherSession.id)).toEqual({ ...before, accessLogWithIds: 0 });
    expect(await db().select().from(users)).toMatchObject([{ id: other.id, email: "an@example.com" }]);
  });

  it("deletes an account that never played, and keeps nothing for it", async () => {
    const learner = await createGoogleLearner("moi@example.com", "google-subject-of-moi");

    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    expect(await db().select().from(users)).toEqual([]);
    expect(await db().select().from(quotaTombstones)).toEqual([]);
    expect(await authAccountRows(learner.id)).toHaveLength(0);
  });
});

/** One replay question, so the session has a replay branch with a turn and model calls of its own. */
async function replayTurnOnce(learner: AppUser, sessionId: string) {
  expect(await startReplay(db(), learner, sessionId)).toEqual({ ok: true });
  expect((await replayTurn(learner, sessionId, 1)).result).toMatchObject({ ok: true });
}

describe("deleteAccount: the daily caps", () => {
  it("leaves today's session spend exactly what it was", async () => {
    const { learner, sessionId } = await learnerWithEverything();
    const before = await sessionSpendToday(db());
    expect(before).toBeGreaterThan(0);
    expect(await db().select().from(dailySpend)).toEqual([]);

    await deleteAccount(db(), learner);

    expect(await db().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId))).toEqual([]);
    expect(await sessionSpendToday(db())).toBeCloseTo(before, 9);
    expect(await db().select().from(dailySpend)).toMatchObject([{ day: dayInVietnam(), scope: "session" }]);
  });

  it("still blocks a new session at a cap the deleted account's spend had reached", async () => {
    const { learner } = await learnerWithEverything();
    const spent = await sessionSpendToday(db());
    await setConfig(db(), "session_demo_reserve_usd", 0, "admin@example.com");
    await setConfig(db(), "session_daily_cap_usd", spent, "admin@example.com");
    expect(await canStartSession(db(), false)).toBe(false);

    await deleteAccount(db(), learner);

    expect(await canStartSession(db(), false)).toBe(false);
  });

  it("adds each call's cost to the ledger of its own day and scope, on top of what is there", async () => {
    const learner = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    const session = await startSession(learner);
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    const call = (costUsd: number, scope: "session" | "generation", createdAt: Date) =>
      ({ scope, sessionId: session.id, role: "PERSONA", model: "gpt-6-luna", tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensReasoning: 0, costUsd, latencyMs: 1, attempt: 1, ok: true, createdAt }) as const;
    await db().insert(llmCalls).values([
      call(0.25, "session", new Date()),
      call(0.5, "session", new Date()),
      call(0.125, "generation", new Date()),
      call(2, "session", yesterday),
      // A call that belongs to no session of the learner stays where it is.
      { ...call(9, "session", new Date()), sessionId: null },
    ]);
    await db().insert(dailySpend).values({ day: dayInVietnam(), scope: "session", usd: 1 });

    await deleteAccount(db(), learner);

    const ledger = await db().select().from(dailySpend).orderBy(dailySpend.day, dailySpend.scope);
    expect(ledger).toEqual([
      { day: dayInVietnam(yesterday), scope: "session", usd: 2 },
      { day: dayInVietnam(), scope: "generation", usd: 0.125 },
      { day: dayInVietnam(), scope: "session", usd: 1.75 },
    ]);
    expect(await db().select().from(llmCalls)).toMatchObject([{ sessionId: null, costUsd: 9 }]);
    // 9 of the call that stayed + 1.75 of the ledger.
    expect(await sessionSpendToday(db())).toBeCloseTo(10.75, 9);
  });
});

describe("deleteAccount: the ledger's day", () => {
  it("is the day in Vietnam: a call made at 00:30 there belongs to that day, not to the day before", async () => {
    const learner = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    const session = await startSession(learner);
    // 17:30 UTC on the 10th is 00:30 on the 11th in Vietnam.
    await db().insert(llmCalls).values({ scope: "session", sessionId: session.id, role: "PERSONA", model: "gpt-6-luna", tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensReasoning: 0, costUsd: 0.5, latencyMs: 1, attempt: 1, ok: true, createdAt: new Date("2026-03-10T17:30:00Z") });

    await deleteAccount(db(), learner);

    expect(await db().select().from(dailySpend)).toEqual([{ day: "2026-03-11", scope: "session", usd: 0.5 }]);
  });
});

describe("deleteAccount: what is kept so that no limit is reset", () => {
  it("keeps the personas the account played under a keyed hash of its Google account, and nothing else", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    const rows = await db().select().from(quotaTombstones);
    expect(rows).toMatchObject([{ key: keyOf(LINH_SUBJECT), playedPersonaIds: [PERSONA_ID] }]);
    expect(Object.keys(rows[0]).sort()).toEqual(["key", "playedPersonaIds", "updatedAt"]);
    expect(rows[0].key).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("delete, sign in again with the same Google account: no second session with a persona already played", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    // The auth server gives the returning person a new account id; the Google account is the same.
    const back = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    expect(back.id).not.toBe(learner.id);

    const result = await openSession(db(), back, PERSONA_ID);
    expect(result).toEqual({ ok: false, reason: "played_before" });
    expect(sessionEntryPath(result, PERSONA_ID)).toBe("/prep/chi-thu");
    expect(await playedBeforeDeletion(db(), back.id, PERSONA_ID)).toBe(true);
    expect(await db().select().from(sessions)).toEqual([]);
    // Asking many times at once does not get through either.
    const many = await Promise.all(Array.from({ length: 5 }, () => openSession(db(), back, PERSONA_ID)));
    expect(many.every((entry) => !entry.ok)).toBe(true);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("publishing a new version of the persona does not open a session for the returning account either", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);
    await importScenarioFile(db(), PERSONA_FILE);

    const back = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    expect(await openSession(db(), back, PERSONA_ID)).toEqual({ ok: false, reason: "played_before" });
  });

  it("does not hold a different Google account to it, even one using the deleted account's address", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    const someoneElse = await createGoogleLearner("linh@example.com", "another-google-subject");

    expect(await playedBeforeDeletion(db(), someoneElse.id, PERSONA_ID)).toBe(false);
    expect(await openSession(db(), someoneElse, PERSONA_ID)).toMatchObject({ ok: true });
  });

  it("the returning account may still play a persona it had not played", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);
    const back = await createGoogleLearner("linh@example.com", LINH_SUBJECT);

    expect(await playedBeforeDeletion(db(), back.id, "anh-khoa")).toBe(false);
  });

  it("does not count a withdrawn session or a demo session as played", async () => {
    const learner = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    const session = await startSession(learner);
    await db().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, session.id));
    const demo = await createGoogleLearner("demo@example.com", "google-subject-of-demo", DEMO_LISTS);
    await startSession(demo);

    await deleteAccount(db(), learner);
    await deleteAccount(db(), demo);

    expect(await db().select().from(quotaTombstones)).toEqual([]);
    const back = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    expect(await openSession(db(), back, PERSONA_ID)).toMatchObject({ ok: true });
  });

  it("adds to what an earlier deletion of the same Google account kept", async () => {
    const first = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    const session = await startSession(first);
    // Stands for a session with a second persona: the rule counts by this column.
    await db().update(sessions).set({ personaId: "anh-khoa" }).where(eq(sessions.id, session.id));
    await deleteAccount(db(), first);

    const second = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    await startSession(second);
    await deleteAccount(db(), second);

    expect(await db().select().from(quotaTombstones)).toMatchObject([{ key: keyOf(LINH_SUBJECT), playedPersonaIds: ["anh-khoa", PERSONA_ID] }]);
  });

  it("still deletes an account the auth server holds no Google identity for, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const learner = await createLearner("linh@example.com");
    await startSession(learner);

    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });

    expect(await db().select().from(users)).toEqual([]);
    expect(await db().select().from(quotaTombstones)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "account_deleted_without_quota_key" }));
  });
});

describe("deleteAccount: when it does not happen", () => {
  it("is refused while a scenario is being prepared for the learner, and deletes nothing", async () => {
    const { learner, sessionId } = await learnerWithEverything();
    const second = await db().insert(sessions).values({ userId: learner.id, scenarioId: (await db().select().from(sessions))[0].scenarioId, personaId: "tu-tao", status: "generating" }).returning();
    const before = await rowsAbout(learner, sessionId);

    expect(await deleteAccount(db(), learner)).toEqual({ ok: false, error: "generating" });

    expect(await rowsAbout(learner, sessionId)).toEqual(before);
    expect(await db().select().from(quotaTombstones)).toEqual([]);
    expect((await db().select().from(events)).map((event) => event.name)).not.toContain("account_deleted");

    // Once the scenario is no longer being prepared, the account can go.
    await db().update(sessions).set({ status: "failed_eval" }).where(eq(sessions.id, second[0].id));
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });
  });

  it("removes nothing at all when one step of it fails", async () => {
    const { learner, sessionId } = await learnerWithEverything();
    const before = await rowsAbout(learner, sessionId);
    const spendBefore = await sessionSpendToday(db());
    await db().execute(sql`CREATE OR REPLACE FUNCTION public.test_refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'auth server refused'; END $$`);
    await db().execute(sql`CREATE TRIGGER test_refuse_delete BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.test_refuse_delete()`);
    try {
      await expect(deleteAccount(db(), learner)).rejects.toThrow();
    } finally {
      await db().execute(sql`DROP TRIGGER test_refuse_delete ON auth.users`);
      await db().execute(sql`DROP FUNCTION public.test_refuse_delete()`);
    }

    expect(await rowsAbout(learner, sessionId)).toEqual(before);
    expect(await db().select().from(quotaTombstones)).toEqual([]);
    expect(await db().select().from(dailySpend)).toEqual([]);
    expect(await sessionSpendToday(db())).toBeCloseTo(spendBefore, 9);
    expect((await db().select().from(events)).map((event) => event.name)).not.toContain("account_deleted");
    // The account is whole: it can still be used, and deleted.
    expect(await skipReplay(db(), learner, sessionId)).toEqual({ ok: true });
    expect(await deleteAccount(db(), learner)).toEqual({ ok: true });
  });

  it("answers not_found for an account that does not exist, and when asked twice at once deletes once", async () => {
    expect(await deleteAccount(db(), { id: randomUUID(), isDemo: false })).toEqual({ ok: false, error: "not_found" });

    const { learner } = await learnerWithEverything();
    const results = await Promise.all([deleteAccount(db(), learner), deleteAccount(db(), learner)]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect((await db().select().from(events)).filter((event) => event.name === "account_deleted")).toHaveLength(1);
    expect(await db().select().from(quotaTombstones)).toHaveLength(1);
  });
});

describe("a token that outlives its account", () => {
  const strict = { requireAuthAccount: true };

  it("creates no row and counts as signed out once the account is deleted", async () => {
    const { learner } = await learnerWithEverything();
    await deleteAccount(db(), learner);

    // Another browser still holds a token for the deleted account, and sends several requests at once.
    const stale = await Promise.all(Array.from({ length: 4 }, () => resolveUser(db(), googleClaims(learner.email, learner.id), NO_LISTS, strict)));

    expect(stale).toEqual([null, null, null, null]);
    expect(await db().select().from(users)).toEqual([]);
  });

  it("is not served from a row that was left behind without its account, and cannot start a session", async () => {
    // A row with no sign-in account behind it, as an interrupted request could once have left.
    const orphan = await createLearner("linh@example.com");

    expect(await resolveUser(db(), googleClaims(orphan.email, orphan.id), NO_LISTS, strict)).toBeNull();
    expect(await resolveUser(db(), googleClaims("moi@example.com", orphan.id), NO_LISTS, strict)).toBeNull();
    // The row was not rewritten by the refused request.
    expect(await db().select().from(users)).toMatchObject([{ id: orphan.id, email: "linh@example.com" }]);
  });

  it("signs a real account in as before: the row is created once, kept, and follows the account's address", async () => {
    const id = randomUUID();
    await giveGoogleAccount({ id, email: "linh@example.com" }, LINH_SUBJECT);

    const first = await resolveUser(db(), googleClaims("linh@example.com", id), NO_LISTS, strict);
    const again = await resolveUser(db(), googleClaims("Linh.Moi@example.com", id), NO_LISTS, strict);

    expect(first).toEqual({ id, email: "linh@example.com", isAdmin: false, isDemo: false, noticeAcked: false });
    expect(again).toMatchObject({ id, email: "linh.moi@example.com" });
    expect(await db().select().from(users)).toHaveLength(1);
  });

  it("still rejects a token that is not a Google sign-in, whatever the account", async () => {
    const id = randomUUID();
    await giveGoogleAccount({ id, email: "linh@example.com" }, LINH_SUBJECT);
    const claims = { ...googleClaims("linh@example.com", id), app_metadata: { provider: "email", providers: ["email"] } };

    expect(await resolveUser(db(), claims, NO_LISTS, strict)).toBeNull();
    expect(await db().select().from(users)).toEqual([]);
  });
});

describe("quotaKeyOf", () => {
  it("is the same for one Google account whatever the auth account, and different for another", async () => {
    const one = await createGoogleLearner("linh@example.com", LINH_SUBJECT);
    const key = await quotaKeyOf(db(), one.id);
    await deleteAccount(db(), one);
    const again = await createGoogleLearner("linh-moi@example.com", LINH_SUBJECT);
    const other = await createGoogleLearner("an@example.com", "google-subject-of-an");

    expect(key).toBe(keyOf(LINH_SUBJECT));
    expect(await quotaKeyOf(db(), again.id)).toBe(key);
    expect(await quotaKeyOf(db(), other.id)).not.toBe(key);
    expect(key).not.toContain(LINH_SUBJECT);
  });

  it("is null without a Google identity, and refuses to work without the secret", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await quotaKeyOf(db(), learner.id)).toBeNull();

    const withIdentity = await createGoogleLearner("an@example.com", "google-subject-of-an");
    const secret = process.env.QUOTA_HASH_SECRET;
    delete process.env.QUOTA_HASH_SECRET;
    try {
      await expect(quotaKeyOf(db(), withIdentity.id)).rejects.toThrow("QUOTA_HASH_SECRET is not set");
    } finally {
      process.env.QUOTA_HASH_SECRET = secret;
    }
  });

  it("ignores an identity of another provider", async () => {
    const learner = await createLearner("linh@example.com");
    await db().execute(sql`INSERT INTO auth.users (id, email) VALUES (${learner.id}, ${learner.email})`);
    await db().execute(sql`INSERT INTO auth.identities (provider_id, user_id, identity_data, provider) VALUES (${learner.id}, ${learner.id}, '{}'::jsonb, 'email')`);

    expect(await quotaKeyOf(db(), learner.id)).toBeNull();
  });
});
