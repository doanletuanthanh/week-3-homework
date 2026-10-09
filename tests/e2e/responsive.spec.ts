import { expect, test, type Page } from "@playwright/test";
import { signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";

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

  test("the custom-topic form fits the viewport, with the information block under the form", async ({ page, context }) => {
    await signInAndAccept(page, context, "layout-custom", "/custom-topic");
    await expectNoHorizontalScroll(page);
    await page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?").fill("một chủ đề đủ dài không có khoảng trắng " + "b".repeat(200));
    await expectNoHorizontalScroll(page);
    const create = page.getByRole("button", { name: "Tạo kịch bản" });
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport({ ratio: 1 });
    const form = await page.locator(".ct-form").boundingBox();
    const info = await page.locator(".ct-info").boundingBox();
    // Side by side on a wide screen; on a narrow one the information block stacks under the form.
    if (page.viewportSize()!.width < 768) expect(info!.y).toBeGreaterThanOrEqual(form!.y + form!.height);
    else expect(info!.x).toBeGreaterThanOrEqual(form!.x + form!.width);
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
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
