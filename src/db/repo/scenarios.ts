import { and, desc, eq, ne, sql } from "drizzle-orm";
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
    // Serialises imports of one persona, so two of them cannot pick the same version.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('scenario_import'), hashtext(${scenario.persona_id}))`);
    await upsertTopic(tx, topic);
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
  });
}
