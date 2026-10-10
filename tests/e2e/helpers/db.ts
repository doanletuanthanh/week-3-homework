import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { branches, config, evalRuns, events, generationAttempts, llmCalls, pendingActions, quotaTombstones, scenarios, sessions, snapshots, stringApprovals, turns, users, waitlist } from "@/db/schema";
import { LOCAL_DATABASE_URL } from "../../helpers/local-stack";

process.env.DATABASE_URL = LOCAL_DATABASE_URL;

/** Marks the spend rows a test adds, so it can remove exactly those. */
const TEST_SPEND_ROLE = "E2E_TEST_SPEND";

/** Views of what the app wrote, for assertions, and the few writes a test needs to set a scene. */
export const db = {
  user: async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0],
  session: async (id: string) => (await getDb().select().from(sessions).where(eq(sessions.id, id)))[0],
  sessionsOf: (userId: string) => getDb().select().from(sessions).where(eq(sessions.userId, userId)),
  turnsOf: (sessionId: string) => getDb().select().from(turns).where(eq(turns.sessionId, sessionId)).orderBy(turns.index),
  /** The session's replay branch, when it has one. */
  replayOf: async (sessionId: string) => (await getDb().select().from(branches).where(and(eq(branches.sessionId, sessionId), eq(branches.kind, "replay"))))[0],
  /** Turns of one branch, in order. */
  turnsOfBranch: (branchId: string) => getDb().select().from(turns).where(eq(turns.branchId, branchId)).orderBy(turns.index),
  snapshotsOf: (sessionId: string) =>
    getDb().select().from(snapshots).where(eq(snapshots.sessionId, sessionId)).orderBy(snapshots.index),
  eventsOf: (sessionId: string) => getDb().select().from(events).where(eq(events.sessionId, sessionId)).orderBy(events.at),
  llmCallsOf: (sessionId: string) =>
    getDb().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId)).orderBy(llmCalls.createdAt),
  pendingActions: () => getDb().select().from(pendingActions),
  waitlistOf: (userId: string) => getDb().select().from(waitlist).where(eq(waitlist.userId, userId)),
  eventsNamed: (name: string) => getDb().select().from(events).where(eq(events.name, name)).orderBy(events.at),
  eventsOfUser: (userId: string) => getDb().select().from(events).where(eq(events.userId, userId)),
  tombstones: () => getDb().select().from(quotaTombstones),
  llmCallCount: async () => (await getDb().select({ id: llmCalls.id }).from(llmCalls)).length,
  /** Sign-in accounts with this id on the local auth server: one, or none once it is deleted. */
  /** Removes the Google identity: the auth server then knows the account by its password alone. */
  removeGoogleIdentity: (userId: string) => getDb().execute(sql`DELETE FROM auth.identities WHERE user_id = ${userId} AND provider = 'google'`),
  authAccounts: (userId: string) => getDb().execute<{ id: string }>(sql`SELECT id FROM auth.users WHERE id = ${userId}`),
  /**
   * Marks the account as the sign-in of one Google account, the way the auth server records a
   * Google sign-in. Google cannot be driven from a test, so the row is written directly.
   */
  addGoogleIdentity: async (userId: string, email: string, googleSubject: string) => {
    // One Google account per sign-in account: an earlier one is replaced.
    await getDb().execute(sql`DELETE FROM auth.identities WHERE user_id = ${userId} AND provider = 'google'`);
    await getDb().execute(sql`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (${googleSubject}, ${userId}, ${JSON.stringify({ sub: googleSubject, email })}::jsonb, 'google', now(), now(), now())
    `);
  },

  /** Adds session spend for today, as if earlier sessions had cost this much. */
  addSessionSpend: (usd: number) =>
    getDb().insert(llmCalls).values({
      scope: "session",
      role: TEST_SPEND_ROLE,
      model: "gpt-6-luna",
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      tokensReasoning: 0,
      costUsd: usd,
      latencyMs: 0,
      attempt: 1,
      ok: true,
    }),
  clearAddedSpend: () => getDb().delete(llmCalls).where(and(eq(llmCalls.role, TEST_SPEND_ROLE))),
  /** Turns the publish gate on for one test; `clearConfig` puts every setting back to its default. */
  requirePublished: () => getDb().insert(config).values({ key: "require_published", value: true, updatedBy: "e2e" }),
  clearConfig: () => getDb().delete(config),
  /** Sets every version of a persona to a status an operator's command gives it. */
  setScenarioStatus: (personaId: string, status: (typeof scenarios.$inferSelect)["status"]) => getDb().update(scenarios).set({ status }).where(eq(scenarios.personaId, personaId)),
  scenarioOf: async (personaId: string) => (await getDb().select().from(scenarios).where(eq(scenarios.personaId, personaId)))[0],
  /** Puts the persona back to an unevaluated draft: no run, flag, ruling, string check or approval. */
  resetPublishState: async () => {
    await getDb().delete(evalRuns);
    await getDb().delete(stringApprovals);
    await getDb().update(scenarios).set({ status: "draft", interimGate: false });
  },
  /** The learner's requests for a custom topic, newest first. */
  attemptsOf: (userId: string) => getDb().select().from(generationAttempts).where(eq(generationAttempts.userId, userId)).orderBy(sql`${generationAttempts.createdAt} DESC`),
  scenarioById: async (id: string) => (await getDb().select().from(scenarios).where(eq(scenarios.id, id)))[0],
  /** Turns the custom-topic path off, as `il config set custom_path_enabled false` does; `clearConfig` turns it on again. */
  pauseCustomPath: () => getDb().insert(config).values({ key: "custom_path_enabled", value: false, updatedBy: "e2e" }),
  /** Makes the runner of an attempt look dead: its heartbeat is older than the stale limit. */
  stopAttemptHeartbeat: (attemptId: string) => getDb().update(generationAttempts).set({ heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(generationAttempts.id, attemptId)),
  /** Moves an attempt past its ten minutes: the next look at it closes it as a system error. */
  expireAttempt: (attemptId: string) => getDb().update(generationAttempts).set({ deadlineAt: sql`now() - interval '1 second'` }).where(eq(generationAttempts.id, attemptId)),
  generationCallsOf: (attemptId: string) => getDb().select().from(llmCalls).where(eq(llmCalls.attemptId, attemptId)).orderBy(llmCalls.createdAt),
  generatedScenariosOf: (userId: string) =>
    getDb().execute(sql`SELECT s.id FROM scenario s JOIN topic t ON t.id = s.topic_id WHERE t.owner_user_id = ${userId} AND s.origin = 'generated'`),
  /**
   * Puts a passed attempt back to where a run that died after storing its draft leaves it: the
   * scenario is on the attempt as a draft, the session is still being prepared, and the runner's
   * heartbeat is old. What a browser cannot bring about: a function ended by the platform.
   */
  rewindToDraft: async (attemptId: string, sessionId: string) => {
    await getDb().transaction(async (tx) => {
      const [attempt] = await tx.select().from(generationAttempts).where(eq(generationAttempts.id, attemptId));
      const [scenario] = await tx.select().from(scenarios).where(eq(scenarios.id, attempt.scenarioId!));
      await tx.delete(branches).where(eq(branches.sessionId, sessionId));
      await tx.update(sessions).set({ status: "generating", scenarioId: null, personaId: null }).where(eq(sessions.id, sessionId));
      await tx
        .update(generationAttempts)
        .set({ outcome: "running", scenarioId: null, finishedAt: null, draft: scenario.content, runToken: attempt.id, heartbeatAt: sql`now() - interval '10 minutes'` })
        .where(eq(generationAttempts.id, attemptId));
      await tx.delete(scenarios).where(eq(scenarios.id, scenario.id));
      await tx.update(users).set({ freeCustomUsed: false }).where(eq(users.id, attempt.userId));
    });
  },
  endSession: (sessionId: string) => getDb().update(sessions).set({ endedAt: sql`now()` }).where(eq(sessions.id, sessionId)),
  /** Puts a session in a state later screens will give it, so the screens that exist can be checked against it. */
  setSessionStatus: (sessionId: string, status: (typeof sessions.$inferSelect)["status"]) =>
    getDb().update(sessions).set({ status }).where(eq(sessions.id, sessionId)),
};
