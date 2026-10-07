import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { config, evalRuns, events, llmCalls, pendingActions, scenarios, sessions, snapshots, stringApprovals, turns, users } from "@/db/schema";
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
  snapshotsOf: (sessionId: string) =>
    getDb().select().from(snapshots).where(eq(snapshots.sessionId, sessionId)).orderBy(snapshots.index),
  eventsOf: (sessionId: string) => getDb().select().from(events).where(eq(events.sessionId, sessionId)).orderBy(events.at),
  llmCallsOf: (sessionId: string) =>
    getDb().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId)).orderBy(llmCalls.createdAt),
  pendingActions: () => getDb().select().from(pendingActions),

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
  scenarioOf: async (personaId: string) => (await getDb().select().from(scenarios).where(eq(scenarios.personaId, personaId)))[0],
  /** Puts the persona back to an unevaluated draft: no run, flag, ruling, string check or approval. */
  resetPublishState: async () => {
    await getDb().delete(evalRuns);
    await getDb().delete(stringApprovals);
    await getDb().update(scenarios).set({ status: "draft", interimGate: false });
  },
  endSession: (sessionId: string) => getDb().update(sessions).set({ endedAt: sql`now()` }).where(eq(sessions.id, sessionId)),
  /** Puts a session in a state later screens will give it, so the screens that exist can be checked against it. */
  setSessionStatus: (sessionId: string, status: (typeof sessions.$inferSelect)["status"]) =>
    getDb().update(sessions).set({ status }).where(eq(sessions.id, sessionId)),
};
