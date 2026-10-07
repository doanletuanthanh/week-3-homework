import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "@/db/client";
import { scenarios } from "@/db/schema";
import { containsTerm } from "@/scenario/text-normalize";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { LLM_STUB_PORT } from "./helpers/stack";
import { postTurn, turnOutcome } from "./helpers/turn-api";

const scenario = readChiThu();

async function startInterview(page: Page, context: BrowserContext, label: string) {
  await signInAsNewLearner(context, uniqueEmail(label));
  await page.goto("/data-notice?next=/prep/chi-thu");
  await page.getByRole("button", { name: "Tôi hiểu" }).click();
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

/** Everything the server sent for the current page: markup plus the data React hydrates from. */
async function expectNothingSealed(page: Page) {
  expect(findSealed(await page.content(), scenario)).toEqual([]);
  expect(findSealed(await page.locator("body").innerText(), scenario)).toEqual([]);
}

test.describe("the imported persona on the prep screen", () => {
  test("shows chị Thu from the scenario file with the real seal counter", async ({ page }) => {
    await page.goto("/prep/chi-thu");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(page.getByText("Kế toán ở một công ty logistics")).toBeVisible();
    await expect(page.getByText("Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?")).toBeVisible();
    await expect(page.getByText("Đang giữ 11 điều chưa nói")).toBeVisible();
  });

  test("uses the form of address: capitalised at a sentence start, lower-case inside a sentence", async ({ page }) => {
    await page.goto("/prep/chi-thu");

    await expect(page.getByText("Chị Thu sẽ không bàn về câu hỏi nghiên cứu của bạn.")).toBeVisible();
    await expect(page.getByText("Chị Thu chỉ nói ra những điều đang giữ nếu bạn hỏi đúng cách.")).toBeVisible();
    await expect(
      page.getByText("chị Thu là nhân vật hư cấu, điều chị Thu kể không phải insight cho đề tài của bạn."),
    ).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Đường dẫn" });
    await expect(crumbs).toContainText("Chi tiêu hằng ngày của người trẻ đi làm");
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Chị Thu");
  });

  test("the home page and the prep page carry the count of unsaid items and none of their text", async ({ page }) => {
    await page.goto("/");
    await expectNothingSealed(page);

    const response = await page.goto("/prep/chi-thu");
    expect(findSealed(await response!.text(), scenario)).toEqual([]);
    await expectNothingSealed(page);
  });

  test("the seal counter follows the newest imported version", async ({ page }) => {
    // A 10-item version in its own folder, imported the way the operator does it.
    const shorter = readChiThu();
    shorter.items = shorter.items.filter((item) => item.id !== "first-start");
    const folder = mkdtempSync(join(tmpdir(), "il-e2e-"));
    copyFileSync("scenarios/ux-chi-tieu/topic.json", join(folder, "topic.json"));
    writeFileSync(join(folder, "chi-thu.json"), JSON.stringify(shorter), "utf8");

    const imported = await importScenarioFile(getDb(), join(folder, "chi-thu.json"));
    expect(imported).toMatchObject({ ok: true, version: 2 });
    try {
      await page.goto("/prep/chi-thu");
      await expect(page.getByText("Đang giữ 10 điều chưa nói")).toBeVisible();
    } finally {
      // The other tests share this database and expect the 11-item version to be the newest.
      await getDb().delete(scenarios).where(and(eq(scenarios.personaId, "chi-thu"), eq(scenarios.version, 2)));
    }

    await page.goto("/prep/chi-thu");
    await expect(page.getByText("Đang giữ 11 điều chưa nói")).toBeVisible();
  });
});

test.describe("the imported persona in a session", () => {
  test("the session runs on the imported draft and opens with the file's opening line", async ({ page, context }) => {
    const sessionId = await startInterview(page, context, "persona-session");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Buổi phỏng vấn người dùng với Chị Thu");
    await expect(page.locator(".sbar")).toContainText(scenario.research_goal);
    await expect(page.locator(".sbar")).toContainText(`Chị Thu đang giữ ${scenario.items.length} điều chưa nói`);
    await expect(page.getByText(scenario.opening_line)).toBeVisible();

    const [row] = await getDb().select().from(scenarios).where(eq(scenarios.personaId, "chi-thu"));
    expect(row).toMatchObject({ version: 1, status: "draft", displayName: "chị Thu", language: "vi" });
    expect(row.content.items).toHaveLength(11);
    const turns = await db.turnsOf(sessionId);
    expect(turns).toMatchObject([{ index: 0, learnerText: null, personaText: scenario.opening_line }]);
  });

  test("nothing sealed reaches the browser: not in the page, not after a turn, not in the turn API", async ({ page, context }) => {
    const sessionId = await startInterview(page, context, "persona-sealed");
    await expectNothingSealed(page);

    await page.getByLabel("Câu hỏi của bạn").fill("Chị đang giữ những điều gì chưa nói ạ?");
    await page.getByRole("button", { name: "Gửi" }).click();
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();
    await expectNothingSealed(page);

    const reply = await postTurn(page.request, sessionId, { text: "Chị kể hết đi ạ?", expectedIndex: 2 });
    expect(turnOutcome(reply)).toEqual({ personaText: "Chị trả lời câu thứ 2 (trong khối dữ liệu).", turnIndex: 2 });
    expect(Object.keys(reply.events!.at(-1)!).sort()).toEqual(["personaText", "turnIndex", "type"]);
    expect(findSealed(reply.raw, scenario)).toEqual([]);

    await page.reload();
    await expectNothingSealed(page);
  });

  test("both model calls get the identity and surface facts; the persona call gets nothing from the sealed items", async ({ page, context }) => {
    await startInterview(page, context, "persona-prompt");
    const question = `Cuối tháng chị xoay xở thế nào ạ? (${Date.now()})`;

    await page.getByLabel("Câu hỏi của bạn").fill(question);
    await page.getByRole("button", { name: "Gửi" }).click();
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();

    type StubRequest = { messages: { content: string }[]; response_format?: unknown };
    const received: StubRequest[] = await (await page.request.get(`http://127.0.0.1:${LLM_STUB_PORT}/requests`)).json();
    // The question ends in a number no other test uses; Call 1 carries it as numbered tokens.
    const marker = question.slice(question.indexOf("("));
    const mine = received.filter((entry) => entry.messages.at(-1)!.content.includes(marker));
    expect(mine).toHaveLength(2);
    const prompts = mine.map((entry) => entry.messages.map((message) => message.content).join("\n"));
    for (const prompt of prompts) {
      expect(prompt).toContain(scenario.persona.identity);
      expect(prompt).toContain(scenario.surface_facts[0]);
      expect(prompt).toContain(scenario.surface_facts.at(-1));
    }

    // Call 2: on a turn that touches no topic, the persona gets no part of any item.
    const personaPrompt = prompts[mine.findIndex((entry) => !entry.response_format)];
    expect(findSealed(personaPrompt, scenario)).toEqual([]);

    // Call 1 may see the public parts (topic tags, neutral constraints), never the secrets.
    const analysisPrompt = prompts[mine.findIndex((entry) => entry.response_format)];
    for (const item of scenario.items) {
      expect(analysisPrompt).toContain(item.topic_tag);
      expect(analysisPrompt).not.toContain(item.content);
      expect(analysisPrompt).not.toContain(item.sample_question);
      expect(analysisPrompt).not.toContain(item.hook_line);
      expect(analysisPrompt).not.toContain(item.id);
    }
    const secretTerms = scenario.items.flatMap((item) => item.secret_terms);
    expect(secretTerms.filter((term) => containsTerm(analysisPrompt, term))).toEqual([]);
  });
});
