import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Scenario, TopicFile } from "@/scenario/schema";
import type { Database, Executor } from "../client";
import { scenarios, topics } from "../schema";

export class ScenarioImportError extends Error {}

/** Creates the topic or updates what its file says: title, summary, role and place in the library. */
async function upsertTopic(db: Executor, topic: TopicFile): Promise<void> {
  const fields = { title: topic.title, summary: topic.summary, role: topic.role, displayOrder: topic.display_order };
  await db
    .insert(topics)
    .values({ id: topic.id, ...fields })
    .onConflictDoUpdate({ target: topics.id, set: fields });
}

/**
 * Topic tags of the newest version of every other persona in the topic, for the rule that two
 * personas of one topic never share a tag.
 */
export async function listOtherPersonaTags(
  db: Executor,
  topicId: string,
  personaId: string,
): Promise<{ personaId: string; topicTags: string[] }[]> {
  const rows = await db
    .selectDistinctOn([scenarios.personaId], { personaId: scenarios.personaId, content: scenarios.content })
    .from(scenarios)
    .where(and(eq(scenarios.topicId, topicId), ne(scenarios.personaId, personaId)))
    .orderBy(scenarios.personaId, desc(scenarios.version));
  return rows.map((row) => ({ personaId: row.personaId, topicTags: row.content.items.map((item) => item.topic_tag) }));
}

/**
 * Stores a validated scenario as a new draft version of its persona: version 1 for a new
 * persona, otherwise one above the newest. Earlier versions, published or not, are not touched.
 * The topic is created or updated in the same transaction, so a refused import writes nothing.
 */
export async function insertScenarioVersion(db: Database, topic: TopicFile, scenario: Scenario) {
  return db.transaction(async (tx) => {
    await upsertTopic(tx, topic);
    return insertNextVersion(tx, scenario);
  });
}

/**
 * Stores a scenario as the next draft version of its persona, in the caller's transaction. Its
 * topic must exist. Throws `ScenarioImportError` when the persona belongs to another topic.
 */
export async function insertNextVersion(tx: Executor, scenario: Scenario) {
  // Serialises imports of one persona, so two of them cannot pick the same version.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('scenario_import'), hashtext(${scenario.persona_id}))`);
  const [newest] = await tx
    .select({ version: scenarios.version, topicId: scenarios.topicId })
    .from(scenarios)
    .where(eq(scenarios.personaId, scenario.persona_id))
    .orderBy(desc(scenarios.version))
    .limit(1);
  if (newest && newest.topicId !== scenario.topic_id) {
    throw new ScenarioImportError(
      `Persona "${scenario.persona_id}" đã thuộc chủ đề "${newest.topicId}"; không chuyển sang "${scenario.topic_id}" được.`,
    );
  }
  const version = (newest?.version ?? 0) + 1;
  const [row] = await tx
    .insert(scenarios)
    .values({
      personaId: scenario.persona_id,
      topicId: scenario.topic_id,
      version,
      displayName: scenario.persona.display_name,
      avatarKey: scenario.persona.avatar_key ?? null,
      tagline: scenario.persona.tagline,
      language: scenario.language,
      content: { ...scenario, version },
    })
    .returning();
  return row;
}

/** The newest version of every curated persona (custom ones belong to their learner), by topic and persona. */
export async function listCuratedPersonas(db: Executor) {
  return db
    .selectDistinctOn([scenarios.personaId], { scenario: scenarios, topicTitle: topics.title })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(isNull(topics.ownerUserId))
    .orderBy(scenarios.personaId, desc(scenarios.version));
}

/** Every version of a persona, newest first. */
export async function listPersonaVersions(db: Executor, personaId: string) {
  return db.select().from(scenarios).where(eq(scenarios.personaId, personaId)).orderBy(desc(scenarios.version));
}

/** Topics an admin can draft a persona for: the curated ones, in library order. */
export async function listCuratedTopics(db: Executor) {
  return db
    .select({ id: topics.id, title: topics.title, summary: topics.summary })
    .from(topics)
    .where(isNull(topics.ownerUserId))
    .orderBy(asc(topics.displayOrder), asc(topics.id));
}

/** True when the persona is a curated one: its topic has no owner. A learner's custom persona is not. */
export async function isCuratedPersona(db: Executor, personaId: string): Promise<boolean> {
  const rows = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .innerJoin(topics, eq(topics.id, scenarios.topicId))
    .where(and(eq(scenarios.personaId, personaId), isNull(topics.ownerUserId)))
    .limit(1);
  return rows.length > 0;
}
