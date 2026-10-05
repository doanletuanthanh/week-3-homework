import { expect, test, type Page } from "@playwright/test";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";

/** No page may be wider than the viewport: the fixed 1280px design container must not leak through. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("layout at this viewport", () => {
  test("home, prep and sign-in fit the viewport", async ({ page }) => {
    for (const path of ["/", "/prep/chi-thu", "/sign-in"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await page.goto("/prep/chi-thu");
    // On a narrow screen the rules card stacks under the persona card, so the button is reached by scrolling.
    const start = page.getByRole("button", { name: "Bắt đầu" });
    await start.scrollIntoViewIfNeeded();
    await expect(start).toBeInViewport({ ratio: 1 });
  });

  test("notice and interview fit the viewport and stay usable", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("layout"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\//);

    await page.getByLabel("Câu hỏi của bạn").fill("Một câu hỏi đủ dài để kiểm tra việc xuống dòng trên màn hình hẹp, không có khoảng trắng: " + "a".repeat(120));
    await page.getByRole("button", { name: "Gửi" }).click();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
