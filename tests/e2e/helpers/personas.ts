import { eq, inArray } from "drizzle-orm";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "@/db/client";
import { scenarios, sessions, topics } from "@/db/schema";
import type { Scenario, TopicFile } from "@/scenario/schema";
import { importScenarioFile } from "../../../cli/commands/import-scenario";
import { readChiThu } from "../../helpers/sealed-strings";

export const CHI_TIEU: TopicFile = {
  id: "ux-chi-tieu",
  title: "Chi tiêu hằng ngày của người trẻ đi làm",
  summary: "Người mới đi làm tiêu, ghi và xoay xở tiền tới cuối tháng ra sao.",
  role: "ux",
  display_order: 10,
};

export type ExtraPersona = { personaId: string; displayName: string; name: string; topic: TopicFile };

/**
 * Imports chị Thu's file as one more persona, the way the operator imports a file: under its own
 * id, name and tags, with no illustration, in the given topic. Returns what `removePersonas` needs.
 */
export async function importExtraPersona(persona: ExtraPersona): Promise<ExtraPersona> {
  const scenario: Scenario = readChiThu();
  scenario.persona_id = persona.personaId;
  scenario.topic_id = persona.topic.id;
  scenario.persona.display_name = persona.displayName;
  scenario.persona.name = persona.name;
  delete scenario.persona.avatar_key;
  scenario.items.forEach((item, index) => (item.topic_tag = `chủ đề riêng của ${persona.personaId} ${index}`));
  const folder = mkdtempSync(join(tmpdir(), "il-e2e-persona-"));
  const file = join(folder, `${persona.personaId}.json`);
  writeFileSync(join(folder, "topic.json"), JSON.stringify(persona.topic), "utf8");
  writeFileSync(file, JSON.stringify(scenario), "utf8");
  const result = await importScenarioFile(getDb(), file);
  if (!result.ok) throw new Error(`fixture persona ${persona.personaId} does not pass validate: ${JSON.stringify(result.violations[0])}`);
  return persona;
}

/**
 * Removes personas a test imported, with the sessions started on them and the topics they alone
 * were in: the other tests share this database and expect chị Thu to be the one persona.
 */
export async function removePersonas(personas: ExtraPersona[]): Promise<void> {
  const db = getDb();
  const personaIds = personas.map((persona) => persona.personaId);
  if (personaIds.length === 0) return;
  await db.delete(sessions).where(inArray(sessions.personaId, personaIds));
  await db.delete(scenarios).where(inArray(scenarios.personaId, personaIds));
  for (const topicId of new Set(personas.map((persona) => persona.topic.id))) {
    if (topicId !== CHI_TIEU.id) await db.delete(topics).where(eq(topics.id, topicId));
  }
  // chị Thu's topic is put back as its file has it, whatever a fixture's copy of the topic file said.
  await db.update(topics).set({ title: CHI_TIEU.title, summary: CHI_TIEU.summary, role: CHI_TIEU.role, displayOrder: CHI_TIEU.display_order }).where(eq(topics.id, CHI_TIEU.id));
}
