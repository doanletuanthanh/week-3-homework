import { and, asc, count, desc, eq, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { RevealJson } from "@/engine/reveal-types";
import { tokenize } from "@/engine/tokens";
import { initialState } from "@/engine/types";
import type { Database, Executor } from "../client";
import { branches, generationAttempts, scenarios, sessions, snapshots, topics, turns } from "../schema";
import type { Scenario } from "@/scenario/schema";

export type ScenarioRow = typeof scenarios.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type TurnRow = typeof turns.$inferSelect;

/** A curated topic is everyone's; a custom one is its owner's alone. `viewerId` is null for a guest. */
export const visibleTo = (viewerId: string | null) =>
  viewerId === null ? isNull(topics.ownerUserId) : or(isNull(topics.ownerUserId), eq(topics.ownerUserId, viewerId));

/** Newest version of a persona, with its topic. Not filtered by learner: for the operator's commands only. */
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

/** Newest version of a persona this learner (or guest) may see: a custom persona exists for its owner only. */
export async function getVisibleScenario(db: Executor, personaId: string, viewerId: string | null) {
  const [row] = await db
    .select({ scenario: scenarios, topic: topics })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    // A generated scenario an operator took down is hidden from its owner as well.
    .where(and(eq(scenarios.personaId, personaId), visibleTo(viewerId), sql`NOT (${scenarios.origin} = 'generated' AND ${scenarios.status} = 'taken_down')`))
    .orderBy(desc(scenarios.version))
    .limit(1);
  return row ?? null;
}

/** Which versions a new session may start on: see `getPlayableScenario`. */
export const playableStatus = (requirePublished: boolean) =>
  requirePublished ? eq(scenarios.status, "published") : notInArray(scenarios.status, ["unpublished", "archived", "taken_down"]);

/**
 * The version a new session starts on: the newest published one, or, while the publish gate is
 * not enforced, the newest one that has not been pulled (unpublished, archived or taken down).
 * A custom persona is found for its owner only.
 */
export async function getPlayableScenario(db: Executor, personaId: string, requirePublished: boolean, viewerId: string | null) {
  const playable = playableStatus(requirePublished);
  const [row] = await db
    .select({ scenario: scenarios, topic: topics })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(and(eq(scenarios.personaId, personaId), playable, visibleTo(viewerId)))
    .orderBy(desc(scenarios.version))
    .limit(1);
  return row ?? null;
}

/** The persona the home page links to: this slice has exactly one authored persona. */
export async function getFirstPersonaId(db: Executor): Promise<string | null> {
  const [row] = await db
    .select({ personaId: scenarios.personaId })
    .from(scenarios)
    .where(eq(scenarios.origin, "authored"))
    .orderBy(asc(scenarios.createdAt))
    .limit(1);
  return row?.personaId ?? null;
}

/** The learner's session with a persona that counts for FR-5: a withdrawn one does not. */
export async function findSessionForPersona(db: Executor, userId: string, personaId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.personaId, personaId), ne(sessions.status, "withdrawn")))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return row ?? null;
}

/** What a session starts from: the main branch, turn 0 (the opening line) and snapshot 0 (the starting state). */
export async function insertOpening(tx: Executor, sessionId: string, scenario: Scenario): Promise<void> {
  const [branch] = await tx.insert(branches).values({ sessionId, kind: "main" }).returning({ id: branches.id });
  const opening = scenario.opening_line;
  await tx.insert(turns).values({ sessionId, branchId: branch.id, index: 0, personaText: opening, personaTokens: tokenize(opening) });
  const start = initialState(scenario.openness_start);
  await tx.insert(snapshots).values({
    sessionId,
    branchId: branch.id,
    index: 0,
    unlocked: start.unlocked,
    ledger: start.ledger,
    disclosed: start.disclosed,
    openness: start.openness,
  });
}

/**
 * Creates the session with its main branch, turn 0 (the opening line) and snapshot 0 (the
 * starting state) in one transaction. A non-demo learner has one session per persona, enforced
 * by a unique index: when it already exists, or a parallel request wins the insert, that session
 * is returned instead and nothing is written. `afterCreate` runs inside the transaction.
 */
export async function createSession(
  db: Database,
  input: { userId: string; scenario: ScenarioRow; isDemo: boolean },
  afterCreate?: (tx: Executor, session: SessionRow) => Promise<void>,
): Promise<{ session: SessionRow; created: boolean }> {
  const { userId, scenario, isDemo } = input;
  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({ userId, scenarioId: scenario.id, personaId: scenario.personaId, isDemo })
      .onConflictDoNothing()
      .returning();
    if (!session) return null;

    await insertOpening(tx, session.id, scenario.content);
    await afterCreate?.(tx, session);
    return session;
  });
  if (created) return { session: created, created: true };

  const existing = await findSessionForPersona(db, userId, scenario.personaId);
  if (!existing) throw new Error("session insert conflicted but no existing session was found");
  return { session: existing, created: false };
}

/**
 * A learner's own session with its scenario and topic; null when it does not exist or belongs to
 * someone else. A custom session has no scenario until its checks passed: such a session is not
 * found here but with `getPendingCustomSession`.
 */
export async function getSession(db: Executor, userId: string, sessionId: string) {
  const [row] = await db
    .select({ session: sessions, scenario: scenarios, topic: topics })
    .from(sessions)
    .innerJoin(scenarios, eq(scenarios.id, sessions.scenarioId))
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Turns of the main interview, in order. Rows hold analysis data: map them before sending anything to a browser. */
export async function listTurns(db: Executor, userId: string, sessionId: string): Promise<TurnRow[]> {
  const rows = await db
    .select({ turn: turns })
    .from(turns)
    .innerJoin(sessions, eq(sessions.id, turns.sessionId))
    .innerJoin(branches, eq(branches.id, turns.branchId))
    .where(and(eq(turns.sessionId, sessionId), eq(sessions.userId, userId), eq(branches.kind, "main")))
    .orderBy(asc(turns.index));
  return rows.map((row) => row.turn);
}

/** What one row of the learner's session list is built from. */
export type SessionListRow = {
  id: string;
  status: SessionRow["status"];
  startedAt: Date;
  /** Read for a `done` session only: no other session's result leaves the database for a list. */
  revealJson: RevealJson | null;
  /** Null for a custom session whose scenario does not exist (yet). */
  displayName: string | null;
  topicTitle: string | null;
  /** The topic the learner typed, for a custom session. */
  customTopicText: string | null;
};

/** A learner's own sessions, newest first. */
export async function listSessionRows(db: Executor, userId: string, page: { offset: number; limit: number }): Promise<SessionListRow[]> {
  return db
    .select({
      id: sessions.id,
      status: sessions.status,
      startedAt: sessions.startedAt,
      revealJson: sql<RevealJson | null>`CASE WHEN ${sessions.status} = 'done' THEN ${sessions.revealJson} END`,
      displayName: scenarios.displayName,
      topicTitle: topics.title,
      customTopicText: generationAttempts.topicText,
    })
    .from(sessions)
    .leftJoin(scenarios, eq(scenarios.id, sessions.scenarioId))
    .leftJoin(topics, eq(topics.id, scenarios.topicId))
    .leftJoin(generationAttempts, eq(generationAttempts.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.startedAt), desc(sessions.id))
    .limit(page.limit)
    .offset(page.offset);
}

export async function countSessions(db: Executor, userId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(sessions).where(eq(sessions.userId, userId));
  return row.total;
}

/** True while a scenario is being prepared for the learner: the account cannot be deleted meanwhile. */
export async function hasGeneratingSession(db: Executor, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "generating")))
    .limit(1);
  return row !== undefined;
}

/** Removes a session with its turns, snapshots, branches and events. Its model-call rows stay, so its cost stays counted. */
export async function deleteSession(db: Executor, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** How many questions the learner has asked in the main interview. */
export async function countLearnerTurns(db: Executor, sessionId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(turns)
    .innerJoin(branches, eq(branches.id, turns.branchId))
    .where(and(eq(turns.sessionId, sessionId), eq(branches.kind, "main"), sql`${turns.index} > 0`));
  return row.total;
}
