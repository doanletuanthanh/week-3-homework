import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Executor } from "../client";
import { generationAttempts, scenarios, sessions, topics, type TopicRole } from "../schema";
import { playableStatus, visibleTo, type SessionRow } from "./sessions";

/**
 * The public face of a persona, for a card. Named columns only: the sealed items never leave the
 * database through a list, just how many there are.
 */
const personaColumns = {
  personaId: scenarios.personaId,
  topicId: scenarios.topicId,
  displayName: scenarios.displayName,
  avatarKey: scenarios.avatarKey,
  tagline: scenarios.tagline,
  origin: scenarios.origin,
  name: sql<string>`${scenarios.content}->'persona'->>'name'`,
  researchGoal: sql<string>`${scenarios.content}->>'research_goal'`,
  itemCount: sql<number>`jsonb_array_length(${scenarios.content}->'items')`,
  // When the persona was first imported, not when this version was: a new version keeps its place.
  // The outer column is written out: drizzle renders a column of a one-table query without its table.
  firstImportedAt: sql`(SELECT min(first.created_at) FROM scenario first WHERE first.persona_id = "scenario"."persona_id")`.mapWith(scenarios.createdAt),
};

export type PersonaCardRow = {
  personaId: string;
  topicId: string;
  displayName: string;
  avatarKey: string | null;
  tagline: string;
  origin: "authored" | "generated";
  name: string;
  researchGoal: string;
  itemCount: number;
  firstImportedAt: Date;
};

export type CuratedPersonaRow = PersonaCardRow & { topicTitle: string; topicSummary: string; topicRole: TopicRole | null; topicOrder: number };

/**
 * Every persona of a curated topic that a session can start on, as the version it would start
 * on. Topics in library order, personas in the order they were written.
 */
export async function listCuratedPersonas(db: Executor, requirePublished: boolean): Promise<CuratedPersonaRow[]> {
  const rows = await db
    .selectDistinctOn([scenarios.personaId], {
      ...personaColumns,
      topicTitle: topics.title,
      topicSummary: topics.summary,
      topicRole: topics.role,
      topicOrder: topics.displayOrder,
    })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(and(eq(topics.kind, "curated"), isNull(topics.ownerUserId), playableStatus(requirePublished)))
    .orderBy(scenarios.personaId, desc(scenarios.version));
  return rows.sort(
    (a, b) =>
      a.topicOrder - b.topicOrder ||
      a.topicId.localeCompare(b.topicId) ||
      a.firstImportedAt.getTime() - b.firstImportedAt.getTime() ||
      a.personaId.localeCompare(b.personaId),
  );
}

export type TopicRow = { id: string; title: string; summary: string; kind: "curated" | "custom"; role: TopicRole | null };

/** The shape of every topic id, curated or custom. An id read from a URL that is not one names no topic. */
const TOPIC_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A topic this learner (or guest) may see: a custom one exists for its owner alone. */
export async function getVisibleTopic(db: Executor, topicId: string, viewerId: string | null): Promise<TopicRow | null> {
  // Asked of the database, some texts are an error (a zero byte) and not "no such row".
  if (topicId.length > 200 || !TOPIC_ID.test(topicId)) return null;
  const [topic] = await db
    .select({ id: topics.id, title: topics.title, summary: topics.summary, kind: topics.kind, role: topics.role })
    .from(topics)
    .where(and(eq(topics.id, topicId), visibleTo(viewerId)));
  return topic ?? null;
}

/**
 * A topic with the personas a session can start on. Null when the topic does not exist or is
 * another learner's custom topic: the two are not told apart.
 */
export async function getTopicWithPersonas(
  db: Executor,
  topicId: string,
  options: { requirePublished: boolean; viewerId: string | null },
): Promise<{ topic: TopicRow; personas: PersonaCardRow[] } | null> {
  const topic = await getVisibleTopic(db, topicId, options.viewerId);
  if (!topic) return null;
  const personas = await db
    .selectDistinctOn([scenarios.personaId], personaColumns)
    .from(scenarios)
    .where(and(eq(scenarios.topicId, topicId), playableStatus(options.requirePublished)))
    .orderBy(scenarios.personaId, desc(scenarios.version));
  personas.sort((a, b) => a.firstImportedAt.getTime() - b.firstImportedAt.getTime() || a.personaId.localeCompare(b.personaId));
  return { topic, personas };
}

export type PersonaSessionRow = { personaId: string; id: string; status: SessionRow["status"]; startedAt: Date };

/** The learner's newest session with each persona that counts for FR-5: a withdrawn one does not. */
export async function listSessionsForPersonas(db: Executor, userId: string, personaIds: string[]): Promise<PersonaSessionRow[]> {
  if (personaIds.length === 0) return [];
  const rows = await db
    .selectDistinctOn([sessions.personaId], { personaId: sessions.personaId, id: sessions.id, status: sessions.status, startedAt: sessions.startedAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), inArray(sessions.personaId, personaIds), ne(sessions.status, "withdrawn")))
    .orderBy(sessions.personaId, desc(sessions.startedAt), desc(sessions.id));
  return rows.flatMap((row) => (row.personaId === null ? [] : [{ ...row, personaId: row.personaId }]));
}

/** Persona ids the learner has a session with in one of these states. */
async function listPersonaIds(db: Executor, userId: string, state: "done" | "counting"): Promise<string[]> {
  const rows = await db
    .selectDistinct({ personaId: sessions.personaId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), state === "done" ? eq(sessions.status, "done") : ne(sessions.status, "withdrawn")));
  return rows.flatMap((row) => (row.personaId === null ? [] : [row.personaId]));
}

/** Persona ids the learner has any counting session with (FR-5: a withdrawn one does not count). */
export const listPractisedPersonaIds = (db: Executor, userId: string) => listPersonaIds(db, userId, "counting");

/** Persona ids the learner has finished a session with. */
export const listDonePersonaIds = (db: Executor, userId: string) => listPersonaIds(db, userId, "done");

export type OwnCustomTopicRow = { topicId: string; title: string; createdAt: Date; sessionId: string; status: SessionRow["status"] };

const NOT_PLAYABLE: SessionRow["status"][] = ["generating", "failed_eval", "withdrawn"];

/**
 * The learner's own custom topics, newest first. Each carries the session its card speaks for:
 * the one that can be played, or when there is none, the one of the newest attempt (PRD §7).
 * A topic whose scenario was taken down has nothing left to open and is left out; its stopped
 * session stays in "Buổi của tôi".
 */
export async function listOwnCustomTopics(db: Executor, userId: string): Promise<OwnCustomTopicRow[]> {
  const rows = await db
    .select({ topicId: topics.id, title: topics.title, createdAt: topics.createdAt, sessionId: sessions.id, status: sessions.status })
    .from(topics)
    .innerJoin(generationAttempts, eq(generationAttempts.topicId, topics.id))
    .innerJoin(sessions, eq(sessions.id, generationAttempts.sessionId))
    .where(and(eq(topics.kind, "custom"), eq(topics.ownerUserId, userId)))
    .orderBy(desc(topics.createdAt), asc(topics.id), desc(generationAttempts.createdAt));
  const byTopic = new Map<string, OwnCustomTopicRow>();
  for (const row of rows) {
    const chosen = byTopic.get(row.topicId);
    // Rows of a topic come newest attempt first: the first is kept unless a later one can be played.
    if (!chosen || (NOT_PLAYABLE.includes(chosen.status) && !NOT_PLAYABLE.includes(row.status))) byTopic.set(row.topicId, row);
  }
  return [...byTopic.values()].filter((topic) => topic.status !== "withdrawn");
}
