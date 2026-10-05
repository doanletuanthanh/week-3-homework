import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getFirstPersonaId, getScenarioByPersona } from "@/db/repo/sessions";
import * as schema from "@/db/schema";
import { scenarios, topics } from "@/db/schema";
import type { Scenario, TopicFile } from "@/scenario/schema";
import { openSession } from "@/server/sessions";
import { importScenarioFile, runImport } from "../../cli/commands/import-scenario";
import { LOCAL_DATABASE_URL } from "../helpers/local-stack";
import { CHI_THU_FILE, readChiThu } from "../helpers/sealed-strings";
import { PERSONA_ID, createLearner, resetDatabase } from "../helpers/test-db";

const TOPIC: TopicFile = {
  id: "ux-chi-tieu",
  title: "Chi tiêu hằng ngày của người trẻ đi làm",
  summary: "Người mới đi làm tiêu, ghi và xoay xở tiền tới cuối tháng ra sao.",
};

/** Writes a scenario and its topic file into a fresh folder, the layout `import` reads. */
function scenarioFolder(scenario: unknown, topic: unknown = TOPIC): string {
  const folder = mkdtempSync(join(tmpdir(), "il-import-"));
  writeFileSync(join(folder, "topic.json"), JSON.stringify(topic), "utf8");
  const file = join(folder, "scenario.json");
  writeFileSync(file, JSON.stringify(scenario), "utf8");
  return file;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

/** A second persona of the same topic: chị Thu's file under another id, with its own tags. */
function anhDung(change: (scenario: Scenario) => void = () => {}): Scenario {
  const scenario = readChiThu();
  scenario.persona_id = "anh-dung";
  scenario.persona.display_name = "anh Dũng";
  scenario.items.forEach((item, index) => (item.topic_tag = `chủ đề riêng của Dũng ${index}`));
  change(scenario);
  return scenario;
}

const versions = () => getDb().select().from(scenarios).orderBy(asc(scenarios.personaId), asc(scenarios.version));

// `resetDatabase` already imports the chị Thu file once: every test starts with version 1.
beforeEach(resetDatabase);

describe("import: the chị Thu file", () => {
  it("is stored as draft version 1 with the columns copied from the file", async () => {
    const [row] = await versions();

    expect(row).toMatchObject({
      personaId: "chi-thu",
      topicId: "ux-chi-tieu",
      version: 1,
      status: "draft",
      origin: "authored",
      interimGate: false,
      displayName: "chị Thu",
      avatarKey: "thu",
      tagline: "Kế toán ở một công ty logistics",
      language: "vi",
    });
    expect(row.content).toEqual(readChiThu());
    expect(await getDb().select().from(topics)).toMatchObject([TOPIC]);
  });

  it("is the persona the home page links to, and a session opens on it with its opening line", async () => {
    expect(await getFirstPersonaId(getDb())).toBe(PERSONA_ID);

    const learner = await createLearner("linh@example.com");
    const session = await openSession(getDb(), learner, PERSONA_ID);

    const [row] = await versions();
    expect(session!.scenarioId).toBe(row.id);
  });
});

describe("import: versions", () => {
  it("importing twice creates version 2 and leaves version 1 untouched", async () => {
    const [before] = await versions();

    const second = await importScenarioFile(getDb(), CHI_THU_FILE);

    expect(second).toMatchObject({ ok: true, personaId: "chi-thu", version: 2 });
    const [first, newest] = await versions();
    expect(first).toEqual(before);
    expect(newest).toMatchObject({ version: 2, status: "draft", personaId: "chi-thu" });
    expect(newest.id).not.toBe(first.id);
    expect(newest.content.version).toBe(2);
  });

  it("stores the database version in the content, whatever the file says", async () => {
    const scenario = readChiThu();
    scenario.version = 40;

    const result = await importScenarioFile(getDb(), scenarioFolder(scenario));

    expect(result).toMatchObject({ ok: true, version: 2 });
    expect((await versions())[1].content.version).toBe(2);
  });

  it("does not change a published version: the import becomes a new draft beside it", async () => {
    await getDb().update(scenarios).set({ status: "published" }).where(eq(scenarios.version, 1));
    const [published] = await versions();
    const changed = readChiThu();
    changed.opening_line = "Chào em, chị là Thu đây.";

    await importScenarioFile(getDb(), scenarioFolder(changed));

    const [first, second] = await versions();
    expect(first).toEqual(published);
    expect(first.content.opening_line).toBe(readChiThu().opening_line);
    expect(second).toMatchObject({ version: 2, status: "draft" });
    expect(second.content.opening_line).toBe("Chào em, chị là Thu đây.");
  });

  it("serves the newest version to new sessions and keeps a running session on its own version", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await openSession(getDb(), learner, PERSONA_ID);

    await importScenarioFile(getDb(), CHI_THU_FILE);

    const [first, second] = await versions();
    expect((await getScenarioByPersona(getDb(), PERSONA_ID))!.scenario.id).toBe(second.id);
    expect((await openSession(getDb(), learner, PERSONA_ID))!.scenarioId).toBe(first.id);
    expect(session!.scenarioId).toBe(first.id);
    const other = await openSession(getDb(), await createLearner("minh@example.com"), PERSONA_ID);
    expect(other!.scenarioId).toBe(second.id);
  });

  it("gives parallel imports of one persona consecutive versions", async () => {
    // One connection each: on a shared connection the transactions would queue and never race.
    const clients = Array.from({ length: 4 }, () => postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} }));
    try {
      const results = await Promise.all(
        clients.map((client) => importScenarioFile(drizzle(client, { schema }), CHI_THU_FILE)),
      );

      expect(results.every((result) => result.ok)).toBe(true);
      expect((await versions()).map((row) => row.version)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  it("keeps the persona id of a version stable and refuses to move the persona to another topic", async () => {
    const moved = readChiThu();
    moved.topic_id = "ux-di-cho";
    const file = scenarioFolder(moved, { ...TOPIC, id: "ux-di-cho" });
    const { io, err } = capture();

    expect(await runImport([file], io, getDb())).toBe(1);
    expect(err[0]).toContain('đã thuộc chủ đề "ux-chi-tieu"');
    expect(await versions()).toHaveLength(1);
    // The refused import left no topic behind either.
    expect((await getDb().select().from(topics)).map((topic) => topic.id)).toEqual(["ux-chi-tieu"]);
  });
});

describe("import: refusals", () => {
  it("writes nothing for a file with violations and prints them", async () => {
    const broken = readChiThu();
    broken.items[1].hook_line = "Chị quên gia hạn hoài.";
    const file = scenarioFolder(broken, { ...TOPIC, title: "Tiêu đề mới" });
    const { io, err } = capture();

    expect(await runImport([file], io, getDb())).toBe(1);
    expect(err[0]).toBe(`LỖI ${file}: 1 vi phạm`);
    expect(err[1]).toContain("[secret_term_leak]");
    expect(await versions()).toHaveLength(1);
    expect((await getDb().select().from(topics))[0].title).toBe(TOPIC.title);
  });

  it("refuses a second persona that reuses a topic tag of the first, and accepts it with its own tags", async () => {
    const clash = scenarioFolder(anhDung((scenario) => (scenario.items[3].topic_tag = "Tiền gửi về nhà")));

    const refused = await importScenarioFile(getDb(), clash);

    expect(refused).toMatchObject({ ok: false, violations: [{ path: "items[3].topic_tag", code: "topic_tag_taken" }] });
    expect(await versions()).toHaveLength(1);

    const accepted = await importScenarioFile(getDb(), scenarioFolder(anhDung()));
    expect(accepted).toMatchObject({ ok: true, personaId: "anh-dung", version: 1 });
  });

  it("checks tags against the newest version of the other persona only", async () => {
    await importScenarioFile(getDb(), scenarioFolder(anhDung((scenario) => (scenario.items[0].topic_tag = "tag sẽ bỏ"))));
    await importScenarioFile(getDb(), scenarioFolder(anhDung()));
    const chiThu = readChiThu();
    chiThu.items[0].topic_tag = "tag sẽ bỏ";

    expect(await importScenarioFile(getDb(), scenarioFolder(chiThu))).toMatchObject({ ok: true, version: 2 });
  });

  it("does not check tags against personas of another topic", async () => {
    const elsewhere = anhDung((scenario) => {
      scenario.topic_id = "ux-di-cho";
      scenario.items[0].topic_tag = "tiền gửi về nhà";
    });

    const result = await importScenarioFile(getDb(), scenarioFolder(elsewhere, { ...TOPIC, id: "ux-di-cho" }));

    expect(result).toMatchObject({ ok: true, version: 1 });
  });

  it("refuses a scenario whose topic is not the topic file beside it", async () => {
    const file = scenarioFolder(readChiThu(), { ...TOPIC, id: "ux-khac" });
    const { io, err } = capture();

    expect(await runImport([file], io, getDb())).toBe(1);
    expect(err[0]).toContain('là chủ đề "ux-khac"');
    expect(await versions()).toHaveLength(1);
    expect(await getDb().select().from(topics)).toHaveLength(1);
  });

  it("refuses when the topic file is missing or incomplete", async () => {
    const folder = mkdtempSync(join(tmpdir(), "il-import-"));
    const lonely = join(folder, "scenario.json");
    writeFileSync(lonely, JSON.stringify(readChiThu()), "utf8");
    const first = capture();
    expect(await runImport([lonely], first.io, getDb())).toBe(1);
    expect(first.err[0]).toContain("Không đọc được file");

    const second = capture();
    expect(await runImport([scenarioFolder(readChiThu(), { id: "ux-chi-tieu" })], second.io, getDb())).toBe(1);
    expect(second.err[0]).toContain("không hợp lệ");
    expect(await versions()).toHaveLength(1);
  });

  it("exits 1 without a file argument or without a database", async () => {
    const noFile = capture();
    expect(await runImport([], noFile.io, getDb())).toBe(1);
    expect(noFile.err[0]).toContain("Thiếu đường dẫn file");

    const noDb = capture();
    expect(await runImport([CHI_THU_FILE], noDb.io, null)).toBe(1);
    expect(noDb.err[0]).toContain("DATABASE_URL_DIRECT");
  });

  it("updates the title and summary of an existing topic", async () => {
    await importScenarioFile(getDb(), scenarioFolder(readChiThu(), { ...TOPIC, title: "Tiêu đề mới" }));

    expect(await getDb().select().from(topics)).toMatchObject([{ id: "ux-chi-tieu", title: "Tiêu đề mới" }]);
  });
});

describe("pnpm il (the real command line)", () => {
  /** Runs the CLI as an operator would, against the local database. */
  function il(...args: string[]): { code: number; output: string } {
    const env = { ...process.env, DATABASE_URL_DIRECT: LOCAL_DATABASE_URL, DATABASE_URL: LOCAL_DATABASE_URL };
    try {
      const command = ["pnpm exec tsx cli/index.ts", ...args.map((arg) => JSON.stringify(arg))].join(" ");
      const output = execSync(command, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, output };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, output: failed.stdout + failed.stderr };
    }
  }

  it("validate exits 0 for the chị Thu file and 1 for a broken one", () => {
    expect(il("validate", CHI_THU_FILE)).toMatchObject({ code: 0, output: expect.stringContaining("OK") });

    const broken = readChiThu();
    broken.surface_facts = broken.surface_facts.slice(0, 3);
    const result = il("validate", scenarioFolder(broken));
    expect(result.code).toBe(1);
    expect(result.output).toContain("[surface_fact_count]");
  }, 60_000);

  it("import adds a version, and an unknown command exits 1 with the command list", async () => {
    const imported = il("import", CHI_THU_FILE);
    expect(imported).toMatchObject({ code: 0, output: expect.stringContaining("phiên bản 2") });
    const [{ count }] = await getDb().execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM scenario`);
    expect(count).toBe(2);

    const unknown = il("publish-everything");
    expect(unknown.code).toBe(1);
    expect(unknown.output).toContain("validate <file>");
    expect(unknown.output).toContain("import <file>");
  }, 60_000);
});
