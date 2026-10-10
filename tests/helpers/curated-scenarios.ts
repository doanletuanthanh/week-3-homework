import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Scenario, TopicFile } from "@/scenario/schema";

export const SCENARIOS_DIR = "scenarios";

export type CuratedPersona = { file: string; scenario: Scenario };
export type CuratedTopic = { folder: string; topicFile: string; topic: TopicFile; personas: CuratedPersona[] };

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/**
 * Every topic folder under `scenarios/` as its files have it, in library order. Read as written:
 * nothing is validated here, so a test can say what is wrong with a file.
 */
export function curatedTopics(): CuratedTopic[] {
  return readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): CuratedTopic => {
      const dir = join(SCENARIOS_DIR, entry.name);
      const topicFile = join(dir, "topic.json");
      const personas = readdirSync(dir)
        .filter((name) => name.endsWith(".json") && name !== "topic.json")
        .sort()
        .map((name) => ({ file: join(dir, name).replaceAll("\\", "/"), scenario: readJson(join(dir, name)) as Scenario }));
      return { folder: entry.name, topicFile: topicFile.replaceAll("\\", "/"), topic: readJson(topicFile), personas };
    })
    .sort((a, b) => a.topic.display_order - b.topic.display_order);
}

export const curatedPersonas = (): (CuratedPersona & { topic: TopicFile })[] =>
  curatedTopics().flatMap((entry) => entry.personas.map((persona) => ({ ...persona, topic: entry.topic })));
