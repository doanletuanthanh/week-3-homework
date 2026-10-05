import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database, Executor } from "../client";
import { scenarios, sessions, topics, turns } from "../schema";

export type ScenarioRow = typeof scenarios.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type TurnRow = typeof turns.$inferSelect;

/** Newest version of a persona, with its topic. */
export async function getScenarioByPersona(db: Executor, personaId: string) {
  const [row] = await db
    .select({ scenario: scenarios, topic: topics })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(eq(scenarios.personaId, personaId))
    .orderBy(desc(scenarios.version))
    .limit(1);
  return row ?? null;
}

/** The persona the home page links to: this slice has exactly one. */
export async function getFirstPersonaId(db: Executor): Promise<string | null> {
  const [row] = await db
    .select({ personaId: scenarios.personaId })
    .from(scenarios)
    .orderBy(asc(scenarios.createdAt))
    .limit(1);
  return row?.personaId ?? null;
}

export async function findSessionForPersona(db: Executor, userId: string, personaId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.personaId, personaId)))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Creates the session and its turn 0 (the opening line) together. A non-demo learner has one
 * session per persona: when it already exists, or a parallel request wins the insert, that
 * session is returned instead.
 */
export async function createSession(
  db: Database,
  input: { userId: string; scenario: ScenarioRow; isDemo: boolean },
): Promise<SessionRow> {
  const { userId, scenario, isDemo } = input;
  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({ userId, scenarioId: scenario.id, personaId: scenario.personaId, isDemo })
      .onConflictDoNothing()
      .returning();
    if (!session) return null;
    await tx.insert(turns).values({ sessionId: session.id, index: 0, personaText: scenario.content.opening_line });
    return session;
  });
  if (created) return created;

  const existing = await findSessionForPersona(db, userId, scenario.personaId);
  if (!existing) throw new Error("session insert conflicted but no existing session was found");
  return existing;
}

/** A learner's own session with its scenario; null when it does not exist or belongs to someone else. */
export async function getSession(db: Executor, userId: string, sessionId: string) {
  const [row] = await db
    .select({ session: sessions, scenario: scenarios })
    .from(sessions)
    .innerJoin(scenarios, eq(scenarios.id, sessions.scenarioId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listTurns(db: Executor, userId: string, sessionId: string): Promise<TurnRow[]> {
  const rows = await db
    .select({ turn: turns })
    .from(turns)
    .innerJoin(sessions, eq(sessions.id, turns.sessionId))
    .where(and(eq(turns.sessionId, sessionId), eq(sessions.userId, userId)))
    .orderBy(asc(turns.index));
  return rows.map((row) => row.turn);
}

/**
 * Writes one finished turn and touches the session in a single transaction. Returns false when
 * the session is not the learner's or another request already wrote this index; nothing is
 * written in either case.
 */
export async function appendTurn(
  db: Database,
  input: {
    userId: string;
    sessionId: string;
    index: number;
    learnerText: string;
    personaText: string;
    latencyMs: number;
  },
): Promise<boolean> {
  const { userId, sessionId, ...turn } = input;
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .update(sessions)
      .set({ updatedAt: sql`now()` })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    if (!owned) return false;
    const inserted = await tx
      .insert(turns)
      .values({ sessionId, ...turn })
      .onConflictDoNothing()
      .returning({ index: turns.index });
    return inserted.length > 0;
  });
}
