import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAndAccept } from "./helpers/auth";
import { APP_URL } from "./helpers/stack";

/**
 * The standard error (PRD §6.0) for a page that failed on the server. Nothing a learner does can
 * bring it up, so the app under test lets a cookie fail a render (see src/server/test-faults.ts:
 * off unless the app runs against the LLM stub).
 */

const INCIDENT = "InterviewLab đang gặp sự cố. Tiến độ của bạn đã được lưu; quay lại sau ít phút.";
const fail = (context: BrowserContext, where: "page" | "layout") => context.addCookies([{ name: "il_test_fault", value: where, url: APP_URL }]);
const heal = (context: BrowserContext) => context.clearCookies({ name: "il_test_fault" });
const alert = (page: Page) => page.getByRole("alert").filter({ hasText: /Không kết nối được|đang gặp sự cố/u });
const retry = (page: Page) => page.getByRole("button", { name: "Thử lại" });
const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Buổi của tôi" });

/** Presses "Thử lại" and waits until that retry has come back, failed or not. */
async function pressRetry(page: Page) {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === "/my-sessions");
  await retry(page).click();
  await answered;
}

test.describe("a page that fails on the server", () => {
  test("shows the standard error inside the layout, and 'Thử lại' loads the page once it works", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-page");
    await fail(context, "page");

    const response = await page.goto("/my-sessions");
    expect(response?.status()).toBe(500);
    await expect(alert(page)).toContainText("Không kết nối được.");
    await expect(heading(page)).toHaveCount(0);
    // The layout did not fail: the header is still there.
    await expect(page.getByRole("banner").getByRole("link", { name: "InterviewLab, về trang chủ" })).toBeVisible();

    await heal(context);
    await retry(page).click();

    await expect(heading(page)).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    await expect(page).toHaveURL("/my-sessions");
  });

  test("after three retries that fail as well it stops offering one", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-three");
    await fail(context, "page");
    await page.goto("/my-sessions");

    for (let failed = 1; failed <= 3; failed += 1) {
      await expect(alert(page)).toContainText("Không kết nối được.");
      await pressRetry(page);
    }

    await expect(alert(page)).toHaveText(INCIDENT);
    await expect(retry(page)).toHaveCount(0);
  });

  test("the count starts again once the page has loaded", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-reset");
    await page.goto("/");
    await fail(context, "page");
    // Reached from another page, so nothing below is a full page load: the count is not reset by one.
    await page.getByRole("banner").getByRole("link", { name: "Buổi của tôi" }).click();
    await expect(alert(page)).toContainText("Không kết nối được.");
    await pressRetry(page);
    await pressRetry(page);
    await expect(retry(page)).toBeVisible();

    // The third retry works.
    await heal(context);
    await retry(page).click();
    await expect(heading(page)).toBeVisible();

    // A new failure later is a new one: three retries are on offer again, not one.
    await page.getByRole("banner").getByRole("link", { name: "InterviewLab, về trang chủ" }).click();
    await expect(page).toHaveURL("/");
    await fail(context, "page");
    await page.getByRole("banner").getByRole("link", { name: "Buổi của tôi" }).click();
    await expect(alert(page)).toContainText("Không kết nối được.");
    await pressRetry(page);
    await pressRetry(page);
    await expect(alert(page)).toContainText("Không kết nối được.");
    await expect(retry(page)).toBeVisible();
    await pressRetry(page);
    await expect(alert(page)).toHaveText(INCIDENT);
  });
});

test.describe("a layout that fails on the server", () => {
  test("shows the standard error in a document of its own, and 'Thử lại' brings the app back", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-layout");
    await fail(context, "layout");

    const response = await page.goto("/my-sessions");
    expect(response?.status()).toBe(500);
    await expect(alert(page)).toContainText("Không kết nối được.");
    // The header is part of what failed.
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");

    await heal(context);
    await retry(page).click();

    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("after three retries that fail as well it stops offering one", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-layout-three");
    await fail(context, "layout");
    await page.goto("/my-sessions");

    for (let failed = 1; failed <= 3; failed += 1) {
      await expect(alert(page)).toContainText("Không kết nối được.");
      await pressRetry(page);
    }

    await expect(alert(page)).toHaveText(INCIDENT);
    await expect(retry(page)).toHaveCount(0);
  });
});

test.describe("the switch that lets a test fail a render", () => {
  test("does nothing for a visitor who does not send the cookie, and fails only the place it names", async ({ page, context }) => {
    await signInAndAccept(page, context, "error-switch");
    await context.addCookies([{ name: "il_test_fault", value: "something-else", url: APP_URL }]);

    await page.goto("/my-sessions");

    await expect(heading(page)).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
  });
});
