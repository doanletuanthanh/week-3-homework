import { asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getTopicWithPersonas, listCuratedPersonas } from "@/db/repo/library";
import { listOtherPersonaTags } from "@/db/repo/scenarios";
import { scenarios, topics, turns } from "@/db/schema";
import { filterTopics, listLibraryTopics, pickNextPersona, toPersonaCardView } from "@/server/library";
import { runImport } from "../../cli/commands/import-scenario";
import { runValidate } from "../../cli/commands/validate";
import { curatedPersonas, curatedTopics } from "../helpers/curated-scenarios";
import { findSealed } from "../helpers/sealed-strings";
import { createLearner, importCuratedLibrary, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const OPEN = { requirePublished: false };
const files = curatedPersonas();
const NEW = files.filter((persona) => persona.scenario.persona_id !== "chi-thu");
const APP_TOPICS = ["ux-cong-viec-nhom", "ux-dat-san-the-thao", "ux-ban-hang-online"];

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

// One clean database for the file: the library is imported once, as the operator does it.
beforeAll(async () => {
  await resetDatabase();
  await importCuratedLibrary();
});

describe("import: every file under scenarios/ on a clean database", () => {
  it("stores four topics under UX in library order, as their files have them", async () => {
    const rows = await db().select().from(topics).orderBy(asc(topics.displayOrder));

    expect(rows.map((row) => row.id)).toEqual(["ux-chi-tieu", ...APP_TOPICS]);
    for (const entry of curatedTopics()) {
      expect(rows.find((row) => row.id === entry.topic.id)).toMatchObject({
        title: entry.topic.title,
        summary: entry.topic.summary,
        role: "ux",
        displayOrder: entry.topic.display_order,
        kind: "curated",
        ownerUserId: null,
      });
    }
  });

  it("stores each new persona once, as an authored draft with no illustration", async () => {
    const rows = await db().select().from(scenarios).orderBy(asc(scenarios.personaId));

    expect(rows).toHaveLength(files.length);
    for (const { scenario } of NEW) {
      expect(rows.filter((row) => row.personaId === scenario.persona_id)).toMatchObject([
        {
          topicId: scenario.topic_id,
          version: 1,
          status: "draft",
          origin: "authored",
          interimGate: false,
          displayName: scenario.persona.display_name,
          tagline: scenario.persona.tagline,
          avatarKey: null,
          // The file itself, with the defaults filled in: nothing is rewritten on the way in.
          content: scenario,
        },
      ]);
    }
  });

  it.each(NEW.map((persona) => [persona.file, persona.scenario.items.length] as const))("validate passes %s against the tags its topic sibling holds in the database", async (file, items) => {
    const { io, out, err } = capture();

    expect(await runValidate([file], io, (topicId, personaId) => listOtherPersonaTags(db(), topicId, personaId))).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toMatch(new RegExp(`^OK .+: [a-z-]+, ${items} item, \\d+ fact bề mặt\\.$`, "u"));
  });

  it("gives a second import of a file version 2 of the same persona, not a second persona", async () => {
    const { io, out } = capture();
    const file = NEW[0];

    expect(await runImport([file.file], io, db())).toBe(0);
    expect(out[0]).toMatch(new RegExp(`^Đã nhập ${file.scenario.persona_id} phiên bản 2 \\(bản nháp\\)`, "u"));
    expect(await listCuratedPersonas(db(), false)).toHaveLength(files.length);
    await db().delete(scenarios).where(eq(scenarios.id, (await db().select().from(scenarios).where(eq(scenarios.personaId, file.scenario.persona_id)).orderBy(asc(scenarios.version)))[1].id));
  });
});

describe("the library with the curated content in it", () => {
  it("lists the four topics with 1, 2, 2 and 2 personas, all under the UX chip", async () => {
    const listed = await listLibraryTopics(db(), { ...OPEN, userId: null });

    expect(listed.map((topic) => [topic.id, topic.personaCount, topic.doneCount])).toEqual([
      ["ux-chi-tieu", 1, null],
      ["ux-cong-viec-nhom", 2, null],
      ["ux-dat-san-the-thao", 2, null],
      ["ux-ban-hang-online", 2, null],
    ]);
    expect(filterTopics(listed, "ux")).toHaveLength(4);
    expect(filterTopics(listed, "ba")).toEqual([]);
    expect(filterTopics(listed, "pm")).toEqual([]);
    expect(filterTopics(listed, "other")).toHaveLength(4);
  });

  it("lists nothing of the drafts once the publish gate is on", async () => {
    expect(await listLibraryTopics(db(), { requirePublished: true, userId: null })).toEqual([]);
  });

  it.each(APP_TOPICS)("shows both personas of %s on its topic screen, ready to start", async (topicId) => {
    const found = await getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: null });
    const expected = files.filter((persona) => persona.topic.id === topicId);

    expect(found?.topic).toMatchObject({ id: topicId, kind: "curated", role: "ux" });
    expect(found!.personas.map((persona) => persona.personaId).sort()).toEqual(expected.map((persona) => persona.scenario.persona_id).sort());
    for (const persona of found!.personas) {
      const file = expected.find((entry) => entry.scenario.persona_id === persona.personaId)!;
      expect(toPersonaCardView(persona, null)).toMatchObject({ button: "start", itemCount: file.scenario.items.length, avatarKey: null });
    }
  });

  it("puts no item content, tag, hook, sample question or secret term in what the library and topic screens are built from", async () => {
    const listed = await listLibraryTopics(db(), { ...OPEN, userId: null });
    const topicPayloads = await Promise.all(APP_TOPICS.map((topicId) => getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: null })));
    const payload = JSON.stringify([listed, topicPayloads, await listCuratedPersonas(db(), false)]);

    for (const { file, scenario } of files) expect(findSealed(payload, scenario), file).toEqual([]);
  });
});

describe("a session on each new persona", () => {
  it.each(NEW.map((persona) => [persona.scenario.persona_id, persona] as const))("%s opens with the persona's own first line", async (personaId, { scenario }) => {
    const learner = await createLearner(`first-line-${personaId}@example.com`);
    const session = await startSession(learner, personaId);

    expect(session).toMatchObject({ personaId, status: "interviewing" });
    const [opening] = await db().select().from(turns).where(eq(turns.sessionId, session.id)).orderBy(asc(turns.index));
    expect(opening).toMatchObject({ index: 0, learnerText: null, personaText: scenario.opening_line });
  });

  it("offers the other persona of the topic next, then one of another UX topic", async () => {
    const learner = await createLearner("next-in-library@example.com");
    const input = { userId: learner.id, topicId: "ux-cong-viec-nhom", topicRole: "ux" as const, roleFilter: null, ...OPEN };

    await startSession(learner, "chi-hanh");
    expect(await pickNextPersona(db(), input)).toMatchObject({ kind: "next", persona: { personaId: "anh-khoa", sameTopic: true, topicTitle: "Web app quản lý công việc cho nhóm nhỏ" } });

    await startSession(learner, "anh-khoa");
    // The topic is used up: the first topic of the library with someone left is chị Thu's.
    expect(await pickNextPersona(db(), input)).toMatchObject({ kind: "next", persona: { personaId: "chi-thu", sameTopic: false } });
  });
});
