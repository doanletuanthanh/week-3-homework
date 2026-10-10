import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getTopicWithPersonas, getVisibleTopic, listCuratedPersonas, listOwnCustomTopics, listSessionsForPersonas } from "@/db/repo/library";
import { addPlayedPersonas } from "@/db/repo/quota-tombstone";
import { setRoleFilter } from "@/db/repo/users";
import { events, scenarios, sessions, users } from "@/db/schema";
import type { Scenario, TopicFile } from "@/scenario/schema";
import { resolveUser } from "@/server/auth";
import { chooseRoleFilter, filterTopics, listLibraryTopics, personaButton, pickNextPersona, reportTopicOpened, toPersonaCardView, TOPIC_VISIT_MINUTES } from "@/server/library";
import { quotaKeyOf } from "@/server/quota";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { INVALID, attempt, attemptRow } from "../helpers/custom-db";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { PERSONA_ID, createLearner, googleClaims, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
const CHI_TIEU = "ux-chi-tieu";
const OPEN = { requirePublished: false };

const topicFile = (id: string, role: TopicFile["role"], order: number): TopicFile => ({ id, title: `Chủ đề ${id}`, summary: "Một câu mô tả.", role, display_order: order });

/** Imports chị Thu's file as another persona of the given topic, with its own tags. */
async function importPersona(personaId: string, topic: TopicFile | null = null): Promise<void> {
  const scenario: Scenario = readChiThu();
  scenario.persona_id = personaId;
  scenario.persona.display_name = `bạn ${personaId}`;
  scenario.items.forEach((item, index) => (item.topic_tag = `chủ đề riêng của ${personaId} ${index}`));
  const folder = mkdtempSync(join(tmpdir(), "il-library-"));
  const file = join(folder, "scenario.json");
  if (topic) scenario.topic_id = topic.id;
  writeFileSync(
    join(folder, "topic.json"),
    JSON.stringify(topic ?? { id: CHI_TIEU, title: "Chi tiêu hằng ngày của người trẻ đi làm", summary: "Tóm tắt.", role: "ux", display_order: 10 }),
    "utf8",
  );
  writeFileSync(file, JSON.stringify(scenario), "utf8");
  const result = await importScenarioFile(db(), file);
  if (!result.ok) throw new Error(`fixture persona ${personaId} does not pass validate: ${JSON.stringify(result.violations[0])}`);
}

/** A custom topic taken through its attempt, with the topic and session it made. */
async function customTopic(learner: Parameters<typeof attempt>[0], script: Parameters<typeof attempt>[1] = {}, body: Record<string, unknown> = {}) {
  const made = await attempt(learner, script, body);
  const row = await attemptRow(made.attemptId);
  return { topicId: row.topicId!, sessionId: row.sessionId! };
}

const setStatus = (sessionId: string, status: "done" | "withdrawn" | "revealed") => db().update(sessions).set({ status }).where(eq(sessions.id, sessionId));
const pull = (personaId: string) => db().update(scenarios).set({ status: "unpublished" }).where(eq(scenarios.personaId, personaId));

/** Every field a persona card may be built from. A new one has to be added here on purpose. */
const PERSONA_KEYS = ["avatarKey", "displayName", "firstImportedAt", "itemCount", "name", "origin", "personaId", "researchGoal", "tagline", "topicId"];

beforeEach(resetDatabase);

describe("listCuratedPersonas", () => {
  it("sends the public face of a persona and its topic, and nothing of its items but their number", async () => {
    const rows = await listCuratedPersonas(db(), false);

    expect(findSealed(JSON.stringify(rows), readChiThu())).toEqual([]);
    expect(Object.keys(rows[0]).sort()).toEqual([...PERSONA_KEYS, "topicOrder", "topicRole", "topicSummary", "topicTitle"].sort());
  });
});

describe("listLibraryTopics", () => {
  it("lists curated topics in display order with their persona counts, and no done count for a guest", async () => {
    await importPersona("b-one", topicFile("ux-b", "ux", 30));
    await importPersona("a-one", topicFile("ba-a", "ba", 20));
    await importPersona("anh-dung");

    const topics = await listLibraryTopics(db(), { ...OPEN, userId: null });

    expect(topics.map((topic) => [topic.id, topic.role, topic.personaCount, topic.doneCount])).toEqual([
      [CHI_TIEU, "ux", 2, null],
      ["ba-a", "ba", 1, null],
      ["ux-b", "ux", 1, null],
    ]);
  });

  it("counts a learner's finished personas only, and only their own", async () => {
    await importPersona("anh-dung");
    const linh = await createLearner("linh@example.com");
    const an = await createLearner("an@example.com");
    await setStatus((await startSession(linh)).id, "done");
    await startSession(linh, "anh-dung");
    await setStatus((await startSession(an, "anh-dung")).id, "done");

    expect(await listLibraryTopics(db(), { ...OPEN, userId: linh.id })).toMatchObject([{ id: CHI_TIEU, personaCount: 2, doneCount: 1 }]);
  });

  it("leaves out a pulled persona, and a topic with none left", async () => {
    await importPersona("b-one", topicFile("ux-b", "ux", 30));
    await pull("b-one");

    expect((await listLibraryTopics(db(), { ...OPEN, userId: null })).map((topic) => topic.id)).toEqual([CHI_TIEU]);
  });

  it("lists nothing while the publish gate is on and nothing is published", async () => {
    expect(await listLibraryTopics(db(), { requirePublished: true, userId: null })).toEqual([]);
  });

  it("never lists a custom topic", async () => {
    const minh = await createLearner("minh@example.com");
    await attempt(minh);

    expect((await listLibraryTopics(db(), { ...OPEN, userId: minh.id })).map((topic) => topic.id)).toEqual([CHI_TIEU]);
  });
});

describe("filterTopics", () => {
  it("shows a role's topics, and every topic for 'other' or no filter", async () => {
    await importPersona("a-one", topicFile("ba-a", "ba", 20));
    const topics = await listLibraryTopics(db(), { ...OPEN, userId: null });

    expect(filterTopics(topics, "ba").map((topic) => topic.id)).toEqual(["ba-a"]);
    expect(filterTopics(topics, "pm")).toEqual([]);
    expect(filterTopics(topics, "other")).toHaveLength(2);
    expect(filterTopics(topics, null)).toHaveLength(2);
  });
});

describe("getTopicWithPersonas", () => {
  it("returns the public face of each persona and nothing of its items but their number", async () => {
    await importPersona("anh-dung");

    const found = await getTopicWithPersonas(db(), CHI_TIEU, { ...OPEN, viewerId: null });

    expect(found?.topic).toMatchObject({ id: CHI_TIEU, kind: "curated", role: "ux" });
    expect(found?.personas.map((persona) => persona.personaId)).toEqual([PERSONA_ID, "anh-dung"]);
    const chiThu = readChiThu();
    expect(found?.personas[0]).toMatchObject({ name: chiThu.persona.name, researchGoal: chiThu.research_goal, itemCount: chiThu.items.length, origin: "authored" });
    expect(findSealed(JSON.stringify(found), chiThu)).toEqual([]);
    expect(Object.keys(found!.personas[0]).sort()).toEqual(PERSONA_KEYS);
  });

  it("keeps a persona's place when it gets a new version", async () => {
    await importPersona("anh-dung");
    await importPersona(PERSONA_ID);

    const found = await getTopicWithPersonas(db(), CHI_TIEU, { ...OPEN, viewerId: null });

    expect(found?.personas.map((persona) => persona.personaId)).toEqual([PERSONA_ID, "anh-dung"]);
    expect((await listCuratedPersonas(db(), false)).map((persona) => persona.personaId)).toEqual([PERSONA_ID, "anh-dung"]);
  });

  it("does not show a pulled persona", async () => {
    await importPersona("anh-dung");
    await pull("anh-dung");

    expect((await getTopicWithPersonas(db(), CHI_TIEU, { ...OPEN, viewerId: null }))?.personas).toHaveLength(1);
  });

  it("is null for a topic that does not exist, and for another learner's custom topic", async () => {
    const minh = await createLearner("minh@example.com");
    const an = await createLearner("an@example.com");
    const { topicId } = await customTopic(minh);

    expect(await getTopicWithPersonas(db(), "khong-co", { ...OPEN, viewerId: null })).toBeNull();
    expect(await getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: an.id })).toBeNull();
    expect(await getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: null })).toBeNull();
    expect((await getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: minh.id }))?.topic).toMatchObject({ kind: "custom", role: null });
  });
});

describe("listSessionsForPersonas and personaButton", () => {
  it("gives each persona the button of PRD §7", async () => {
    await importPersona("anh-dung");
    await importPersona("ban-vy");
    const linh = await createLearner("linh@example.com");
    await setStatus((await startSession(linh)).id, "done");
    await setStatus((await startSession(linh, "anh-dung")).id, "revealed");

    const rows = await listSessionsForPersonas(db(), linh.id, [PERSONA_ID, "anh-dung", "ban-vy"]);
    const button = (personaId: string) => personaButton(rows.find((row) => row.personaId === personaId) ?? null);

    expect([button(PERSONA_ID), button("anh-dung"), button("ban-vy")]).toEqual(["review", "continue", "start"]);
  });

  it("does not count a withdrawn session, nor another learner's", async () => {
    const linh = await createLearner("linh@example.com");
    const an = await createLearner("an@example.com");
    await setStatus((await startSession(linh)).id, "withdrawn");
    await startSession(an);

    expect(await listSessionsForPersonas(db(), linh.id, [PERSONA_ID])).toEqual([]);
    expect(await listSessionsForPersonas(db(), linh.id, [])).toEqual([]);
  });
});

describe("listOwnCustomTopics", () => {
  it("carries the playable session of a topic, or the one of its newest attempt", async () => {
    const minh = await createLearner("minh@example.com");
    const an = await createLearner("an@example.com");
    const failed = await customTopic(minh, INVALID, { topic: "một chủ đề chưa qua kiểm tra" });
    const passed = await customTopic(minh);
    await attempt(an, {}, { topic: "chủ đề của người khác" });

    const own = await listOwnCustomTopics(db(), minh.id);

    expect(own.map((topic) => [topic.topicId, topic.sessionId, topic.status])).toEqual([
      [passed.topicId, passed.sessionId, "interviewing"],
      [failed.topicId, failed.sessionId, "failed_eval"],
    ]);
  });
});

describe("listOwnCustomTopics: a topic that was taken down", () => {
  it("leaves out a topic whose only session is withdrawn, and keeps the others", async () => {
    const minh = await createLearner("minh@example.com");
    // The try that fails comes first: it does not use up the one free scenario.
    const kept = await customTopic(minh, INVALID, { topic: "một chủ đề khác chưa qua kiểm tra" });
    const gone = await customTopic(minh);
    await setStatus(gone.sessionId, "withdrawn");

    expect((await listOwnCustomTopics(db(), minh.id)).map((topic) => topic.topicId)).toEqual([kept.topicId]);
  });
});

describe("listOwnCustomTopics: a topic tried more than once", () => {
  it("speaks for the retry that passed, not the try that failed before it", async () => {
    const minh = await createLearner("minh@example.com");
    const failed = await customTopic(minh, INVALID);
    const passed = await customTopic(minh, {}, { retryOf: failed.sessionId });
    expect(passed.topicId).toBe(failed.topicId);

    expect(await listOwnCustomTopics(db(), minh.id)).toMatchObject([{ topicId: failed.topicId, sessionId: passed.sessionId, status: "interviewing" }]);
  });

  it("speaks for the newest try while none can be played", async () => {
    const minh = await createLearner("minh@example.com");
    const first = await customTopic(minh, INVALID);
    const second = await customTopic(minh, INVALID, { retryOf: first.sessionId });

    expect(await listOwnCustomTopics(db(), minh.id)).toMatchObject([{ topicId: first.topicId, sessionId: second.sessionId, status: "failed_eval" }]);
  });

  it("keeps the session that can be played when a newer one in the topic cannot", async () => {
    const minh = await createLearner("minh@example.com");
    const failed = await customTopic(minh, INVALID);
    const passed = await customTopic(minh, {}, { retryOf: failed.sessionId });
    // The older try is made the newer one: the playable session must still be the one chosen.
    await db().execute(sql`UPDATE generation_attempt SET created_at = now() + interval '1 minute' WHERE session_id = ${failed.sessionId}`);

    expect(await listOwnCustomTopics(db(), minh.id)).toMatchObject([{ sessionId: passed.sessionId, status: "interviewing" }]);
  });
});

describe("pickNextPersona", () => {
  const ask = (userId: string, roleFilter: "ux" | "ba" | "pm" | "other" | null = null, topic: { id: string; role: "ux" | "ba" | "pm" | null } = { id: CHI_TIEU, role: "ux" }) =>
    pickNextPersona(db(), { userId, topicId: topic.id, topicRole: topic.role, roleFilter, ...OPEN });

  it("offers an unpractised persona of the same topic first", async () => {
    await importPersona("b-one", topicFile("ux-a", "ux", 5));
    await importPersona("anh-dung");
    const linh = await createLearner("linh@example.com");
    await startSession(linh);

    expect(await ask(linh.id)).toMatchObject({ kind: "next", persona: { personaId: "anh-dung", displayName: "bạn anh-dung", topicId: CHI_TIEU, sameTopic: true } });
  });

  it("carries what the suggestion's card shows, under these keys only, and nothing sealed", async () => {
    await importPersona("anh-dung");
    const linh = await createLearner("linh@example.com");
    await startSession(linh);

    const step = await ask(linh.id);

    if (step.kind !== "next") throw new Error("expected a suggestion");
    const chiThu = readChiThu();
    expect(step.persona).toMatchObject({ name: chiThu.persona.name, avatarKey: "thu", itemCount: chiThu.items.length, topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm" });
    // A new field has to be added here on purpose: the suggestion is sent to the browser.
    expect(Object.keys(step.persona).sort()).toEqual(["avatarKey", "displayName", "itemCount", "name", "personaId", "sameTopic", "topicId", "topicTitle"]);
    expect(findSealed(JSON.stringify(step), chiThu)).toEqual([]);
  });

  it("then one of another topic of the same role, never of another role", async () => {
    await importPersona("a-one", topicFile("ba-a", "ba", 5));
    await importPersona("b-one", topicFile("ux-b", "ux", 30));
    const linh = await createLearner("linh@example.com");
    await startSession(linh);

    expect(await ask(linh.id)).toMatchObject({ persona: { personaId: "b-one", topicId: "ux-b", topicTitle: "Chủ đề ux-b", sameTopic: false } });

    await startSession(linh, "b-one");
    expect(await ask(linh.id)).toEqual({ kind: "all_practised" });
  });

  it("is null when every persona is practised, whatever state the sessions are in", async () => {
    const linh = await createLearner("linh@example.com");
    await startSession(linh);

    expect(await ask(linh.id)).toEqual({ kind: "all_practised" });
  });

  it("offers a persona again once its session was withdrawn", async () => {
    await importPersona("anh-dung");
    const linh = await createLearner("linh@example.com");
    await startSession(linh);
    await setStatus((await startSession(linh, "anh-dung")).id, "withdrawn");

    expect(await ask(linh.id)).toMatchObject({ persona: { personaId: "anh-dung" } });
  });

  it("leaves out a persona played under an account since deleted", async () => {
    await importPersona("anh-dung");
    const linh = await createLearner("linh@example.com");
    await startSession(linh);
    await addPlayedPersonas(db(), (await quotaKeyOf(db(), linh.id))!, ["anh-dung"]);

    expect(await ask(linh.id)).toEqual({ kind: "all_practised" });
  });

  it("uses the library filter for a custom topic, and every topic when no role is chosen", async () => {
    await importPersona("a-one", topicFile("ba-a", "ba", 5));
    const minh = await createLearner("minh@example.com");
    const custom = { id: "custom-topic", role: null };

    expect(await ask(minh.id, "ux", custom)).toMatchObject({ persona: { personaId: PERSONA_ID, sameTopic: false } });
    expect(await ask(minh.id, "other", custom)).toMatchObject({ persona: { personaId: "a-one" } });
    expect(await ask(minh.id, null, custom)).toMatchObject({ persona: { personaId: "a-one" } });
  });

  it("does not say everything was practised when the role has no persona at all", async () => {
    const minh = await createLearner("minh@example.com");
    const custom = { id: "custom-topic", role: null };

    // No PM topic exists: there was nothing to practise, which is not the same as having practised it.
    expect(await ask(minh.id, "pm", custom)).toEqual({ kind: "none_exist" });

    await startSession(minh);
    expect(await ask(minh.id, "ux", custom)).toEqual({ kind: "all_practised" });
    expect(await ask(minh.id, "pm", custom)).toEqual({ kind: "none_exist" });
  });
});

describe("the role filter on the account", () => {
  it("is stored, read back at sign-in, and cleared", async () => {
    const claims = googleClaims("linh@example.com");
    const lists = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: [] };
    const linh = (await resolveUser(db(), claims, lists))!;
    expect(linh.roleFilter).toBeNull();

    await setRoleFilter(db(), linh.id, "ba");
    expect((await resolveUser(db(), claims, lists))?.roleFilter).toBe("ba");

    await setRoleFilter(db(), linh.id, null);
    expect((await resolveUser(db(), claims, lists))?.roleFilter).toBeNull();
  });
});

describe("chooseRoleFilter (FR-50)", () => {
  const filterEvents = () => db().select().from(events).where(eq(events.name, "role_filter_selected")).orderBy(events.at);
  const storedFilter = async (userId: string) => (await db().select({ roleFilter: users.roleFilter }).from(users).where(eq(users.id, userId)))[0].roleFilter;
  const consenting = async (email: string, lists?: Parameters<typeof createLearner>[1]) => ({ ...(await createLearner(email, lists)), noticeAcked: true });

  it("stores a learner's choice on the account and writes one event for each press", async () => {
    const linh = await consenting("linh@example.com");

    expect(await chooseRoleFilter(db(), linh, "ba")).toBe("ba");
    expect(await storedFilter(linh.id)).toBe("ba");
    expect(await chooseRoleFilter(db(), linh, "other")).toBe("other");
    expect(await storedFilter(linh.id)).toBe("other");

    expect((await filterEvents()).map((event) => [event.userId, event.sessionId, event.props])).toEqual([
      [linh.id, null, { role: "ba" }],
      [linh.id, null, { role: "other" }],
    ]);
  });

  it("clears the filter for the chosen chip's empty value and for anything outside the four chips", async () => {
    const linh = await consenting("linh@example.com");

    for (const value of ["", "admin", "UX", " ux", null, undefined, 3, { role: "ux" }]) {
      await setRoleFilter(db(), linh.id, "ux");
      expect(await chooseRoleFilter(db(), linh, value), String(value)).toBeNull();
      expect(await storedFilter(linh.id), String(value)).toBeNull();
    }
    expect((await filterEvents()).at(-1)?.props).toEqual({ role: null });
  });

  it("writes nothing for a guest: the choice comes back for the browser to remember", async () => {
    const linh = await createLearner("linh@example.com");
    const before = await db().select().from(events);

    expect(await chooseRoleFilter(db(), null, "pm")).toBe("pm");
    expect(await chooseRoleFilter(db(), null, "nothing")).toBeNull();

    expect(await db().select().from(events)).toEqual(before);
    expect(await storedFilter(linh.id)).toBeNull();
  });

  it("writes nothing for a learner who has not accepted the data notice", async () => {
    const linh = await createLearner("linh@example.com");
    expect(linh.noticeAcked).toBe(false);

    expect(await chooseRoleFilter(db(), linh, "pm")).toBe("pm");

    expect(await storedFilter(linh.id)).toBeNull();
    expect(await filterEvents()).toEqual([]);
  });

  it("remembers a demo account's choice and leaves it out of the events", async () => {
    const demo = await consenting("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    expect(demo.isDemo).toBe(true);

    expect(await chooseRoleFilter(db(), demo, "ux")).toBe("ux");

    expect(await storedFilter(demo.id)).toBe("ux");
    expect(await filterEvents()).toEqual([]);
  });

  it("only touches the learner who chose", async () => {
    const linh = await consenting("linh@example.com");
    const minh = await consenting("minh@example.com");
    await chooseRoleFilter(db(), minh, "ba");

    await chooseRoleFilter(db(), linh, "pm");

    expect(await storedFilter(minh.id)).toBe("ba");
    expect(await storedFilter(linh.id)).toBe("pm");
  });
});

describe("reportTopicOpened (FR-38, signed-in learners only)", () => {
  const openedEvents = () => db().select().from(events).where(eq(events.name, "topic_opened")).orderBy(events.at);
  const consenting = async (email: string, lists?: Parameters<typeof createLearner>[1]) => ({ ...(await createLearner(email, lists)), noticeAcked: true });

  /** Moves every event written so far back in time, as if it had been written that long ago. */
  const age = (minutes: number) => db().execute(sql`UPDATE event SET at = at - make_interval(mins => ${minutes}) WHERE name = 'topic_opened'`);

  it("writes one event for a visit, however many times the page is shown during it", async () => {
    const linh = await consenting("linh@example.com");

    for (let shown = 0; shown < 5; shown += 1) await reportTopicOpened(db(), linh, CHI_TIEU);

    expect((await openedEvents()).map((event) => [event.userId, event.sessionId, event.props])).toEqual([[linh.id, null, { topic_id: CHI_TIEU, kind: "curated" }]]);
  });

  it("counts a new visit once the last one is older than the visit window, and not a minute before", async () => {
    const linh = await consenting("linh@example.com");
    await reportTopicOpened(db(), linh, CHI_TIEU);

    await age(TOPIC_VISIT_MINUTES - 1);
    await reportTopicOpened(db(), linh, CHI_TIEU);
    expect(await openedEvents()).toHaveLength(1);

    await age(2);
    await reportTopicOpened(db(), linh, CHI_TIEU);
    await reportTopicOpened(db(), linh, CHI_TIEU);
    expect(await openedEvents()).toHaveLength(2);
  });

  it("counts each learner and each topic on their own", async () => {
    await importPersona("b-one", topicFile("ux-b", "ux", 30));
    const linh = await consenting("linh@example.com");
    const an = await consenting("an@example.com");

    await reportTopicOpened(db(), linh, CHI_TIEU);
    await reportTopicOpened(db(), an, CHI_TIEU);
    await reportTopicOpened(db(), linh, "ux-b");
    await reportTopicOpened(db(), linh, CHI_TIEU);

    expect((await openedEvents()).map((event) => [event.userId, (event.props as { topic_id: string }).topic_id]).sort()).toEqual(
      [
        [linh.id, CHI_TIEU],
        [an.id, CHI_TIEU],
        [linh.id, "ux-b"],
      ].sort(),
    );
  });

  it("names a topic the learner made as custom", async () => {
    const minh = await consenting("minh@example.com");
    const own = await customTopic(minh);
    const before = (await openedEvents()).length;

    await reportTopicOpened(db(), minh, own.topicId);

    expect((await openedEvents()).slice(before).map((event) => [event.userId, event.props])).toEqual([[minh.id, { topic_id: own.topicId, kind: "custom" }]]);
  });

  it("writes nothing for a guest, nor for a learner who has not accepted the data notice", async () => {
    const linh = await createLearner("linh@example.com");
    expect(linh.noticeAcked).toBe(false);

    await reportTopicOpened(db(), null, CHI_TIEU);
    await reportTopicOpened(db(), linh, CHI_TIEU);

    expect(await openedEvents()).toEqual([]);
  });

  it("writes nothing for another learner's own topic, a topic that does not exist, or an id that is not text", async () => {
    const minh = await consenting("minh@example.com");
    const an = await consenting("an@example.com");
    const theirs = await customTopic(minh);
    const before = (await openedEvents()).length;

    for (const id of [theirs.topicId, "khong-co", "", "x".repeat(5000), null, undefined, 7, { id: CHI_TIEU }, [CHI_TIEU]]) await reportTopicOpened(db(), an, id);

    expect(await openedEvents()).toHaveLength(before);
  });

  it("leaves a demo account out of the events", async () => {
    const demo = await consenting("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    expect(demo.isDemo).toBe(true);

    await reportTopicOpened(db(), demo, CHI_TIEU);

    expect(await openedEvents()).toEqual([]);
  });
});

describe("getVisibleTopic", () => {
  it("finds a curated topic for anyone, and a learner's own topic for that learner alone", async () => {
    const minh = await createLearner("minh@example.com");
    const an = await createLearner("an@example.com");
    const own = await customTopic(minh);

    expect(await getVisibleTopic(db(), CHI_TIEU, null)).toMatchObject({ id: CHI_TIEU, kind: "curated", role: "ux" });
    expect(await getVisibleTopic(db(), own.topicId, minh.id)).toMatchObject({ id: own.topicId, kind: "custom", role: null });
    expect(await getVisibleTopic(db(), own.topicId, an.id)).toBeNull();
    expect(await getVisibleTopic(db(), own.topicId, null)).toBeNull();
    expect(await getVisibleTopic(db(), "khong-co", minh.id)).toBeNull();
  });

  it("answers 'no such topic' for a text that is not a topic id, a zero byte included, instead of failing", async () => {
    for (const id of ["", " ", "UX-CHI-TIEU", "ux_chi_tieu", "ux-chi-tieu ", "ux-chi-tieu\u0000", "\u0000", "' OR 1=1--", "../prep/chi-thu", "a".repeat(201)]) {
      expect(await getVisibleTopic(db(), id, null), JSON.stringify(id)).toBeNull();
      expect(await getTopicWithPersonas(db(), id, { ...OPEN, viewerId: null }), JSON.stringify(id)).toBeNull();
    }
  });
});

describe("the cards of a topic's page (Màn 2b)", () => {
  const cardsOf = async (topicId: string, learner: { id: string } | null) => {
    const found = await getTopicWithPersonas(db(), topicId, { ...OPEN, viewerId: learner?.id ?? null });
    const mine = learner ? await listSessionsForPersonas(db(), learner.id, found!.personas.map((persona) => persona.personaId)) : [];
    return found!.personas.map((persona) => toPersonaCardView(persona, mine.find((session) => session.personaId === persona.personaId) ?? null));
  };

  it("give each persona the button of the learner's newest counting session, and a guest 'Bắt đầu' everywhere", async () => {
    await importPersona("anh-dung");
    await importPersona("ban-vy");
    const linh = await createLearner("linh@example.com");
    const done = await startSession(linh, PERSONA_ID);
    await setStatus(done.id, "done");
    const open = await startSession(linh, "anh-dung");

    expect((await cardsOf(CHI_TIEU, linh)).map((card) => [card.personaId, card.button, card.sessionId])).toEqual([
      [PERSONA_ID, "review", done.id],
      ["anh-dung", "continue", open.id],
      ["ban-vy", "start", null],
    ]);
    expect((await cardsOf(CHI_TIEU, null)).map((card) => [card.button, card.sessionId])).toEqual([
      ["start", null],
      ["start", null],
      ["start", null],
    ]);
  });

  it("a withdrawn session does not count: the card says 'Bắt đầu' again", async () => {
    const linh = await createLearner("linh@example.com");
    const stopped = await startSession(linh, PERSONA_ID);
    await setStatus(stopped.id, "withdrawn");

    expect((await cardsOf(CHI_TIEU, linh)).map((card) => [card.button, card.sessionId])).toEqual([["start", null]]);
  });

  it("a demo account's card opens its newest session with the persona", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    const first = await startSession(demo, PERSONA_ID);
    await setStatus(first.id, "done");
    await db().update(sessions).set({ startedAt: sql`now() - interval '1 hour'` }).where(eq(sessions.id, first.id));
    const second = await startSession(demo, PERSONA_ID);

    expect((await cardsOf(CHI_TIEU, demo)).map((card) => [card.button, card.sessionId])).toEqual([["continue", second.id]]);
  });

  it("hold nothing sealed for a learner's own generated persona either", async () => {
    const minh = await createLearner("minh@example.com");
    const own = await customTopic(minh);

    const cards = await cardsOf(own.topicId, minh);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ button: "continue", sessionId: own.sessionId, avatarKey: null });
    const [stored] = await db().select({ content: scenarios.content }).from(scenarios).where(eq(scenarios.topicId, own.topicId));
    expect(findSealed(JSON.stringify(cards), stored.content)).toEqual([]);
  });
});
