import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "@/db/client";
import { scenarios } from "@/db/schema";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { LLM_STUB_PORT } from "./helpers/stack";

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

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(page.getByText("Kế toán ở một công ty logistics")).toBeVisible();
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
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();
    await expectNothingSealed(page);

    const response = await page.request.post(`/api/sessions/${sessionId}/turns`, { data: { text: "Chị kể hết đi ạ?" } });
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["personaText", "turnIndex"]);
    expect(findSealed(JSON.stringify(body), scenario)).toEqual([]);

    await page.reload();
    await expectNothingSealed(page);
  });

  test("the persona call gets the identity and surface facts and nothing from the sealed items", async ({ page, context }) => {
    await startInterview(page, context, "persona-prompt");
    const question = `Cuối tháng chị xoay xở thế nào ạ? (${Date.now()})`;

    await page.getByLabel("Câu hỏi của bạn").fill(question);
    await page.getByRole("button", { name: "Gửi" }).click();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();

    const received: unknown[] = await (await page.request.get(`http://127.0.0.1:${LLM_STUB_PORT}/requests`)).json();
    const sent = received.map((entry) => JSON.stringify(entry)).filter((entry) => entry.includes(question.slice(0, 30)));
    expect(sent).toHaveLength(1);
    // The body is JSON text, so quotes inside the strings are escaped: compare with parsed text.
    const prompt = JSON.stringify(JSON.parse(sent[0]), null, 0).replace(/\\"/g, '"');
    expect(prompt).toContain(scenario.persona.identity);
    expect(prompt).toContain(scenario.surface_facts[0]);
    expect(prompt).toContain(scenario.surface_facts.at(-1));
    expect(findSealed(prompt, scenario)).toEqual([]);
  });
});
