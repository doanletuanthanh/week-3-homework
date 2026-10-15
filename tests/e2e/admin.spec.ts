import { expect, test } from "@playwright/test";
import { getDb } from "@/db/client";
import { spendByDay } from "@/db/repo/cost-report";
import { recordLlmCall } from "@/db/repo/llm-calls";
import { ensureAccount, signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";

const ADMIN = "admin-e2e@example.com";

/** Today's spend of every scope, as the overview's first tile prints it. */
async function todayTotal() {
  const rows = await spendByDay(getDb(), { days: 1 });
  return `${rows.reduce((sum, row) => sum + row.usd, 0).toFixed(4)} USD`;
}

test.describe("admin area", () => {
  test("an admin sees today's spend as the cost report reads it, and the page fits a phone", async ({ page, context }) => {
    await ensureAccount(ADMIN);
    await signIn(context, ADMIN);
    await recordLlmCall(getDb(), {
      scope: "eval", role: "QA_PLANNER", model: "gemini-3.8-flash", tokensIn: 1000, tokensOut: 100, tokensCached: 0, tokensReasoning: 0,
      costUsd: 0.0123, latencyMs: 500, attempt: 1, ok: true,
    });
    const expected = await todayTotal();

    const response = await page.goto("/admin");

    expect(response!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    await expect(page.locator(".adm-tile").filter({ hasText: "Chi phí hôm nay" }).locator(".adm-tile-value")).toHaveText(expected);
    await expect(page.locator(".adm-table")).toContainText("QA_PLANNER");
    await expect(page.getByRole("link", { name: "Quản trị" })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("a learner gets the same 404 as for a page that does not exist, and no link to it", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("not-admin"));
    const unknown = await page.goto("/no-such-page");
    const unknownTitle = await page.title();
    const unknownText = await page.locator("body").innerText();

    expect((await page.goto("/admin"))!.status()).toBe(unknown!.status());
    // Nothing of the admin area, not even its title, tells that it exists.
    expect(await page.title()).toBe(unknownTitle);
    expect(await page.locator("body").innerText()).toBe(unknownText);
    expect(await page.content()).not.toContain("Quản trị");
    await page.goto("/library");
    await expect(page.getByRole("link", { name: "Quản trị" })).toHaveCount(0);
  });

  test("a visitor who is not signed in gets 404, not the sign-in page", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response!.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe("/admin");
  });
});
