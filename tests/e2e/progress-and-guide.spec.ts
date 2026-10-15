import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { signInAndAccept } from "./helpers/auth";

test.describe("progress and the guide check", () => {
  test("a learner with no finished session sees the way to the library on their progress page", async ({ page, context }) => {
    await signInAndAccept(page, context, "progress-empty", "/progress");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tiến bộ của tôi");
    await expect(page.getByRole("heading", { name: "Chưa có buổi nào có kết quả" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiến bộ" }).first()).toBeVisible();
  });

  test("a learner checks a guide, sees each question labelled, and the check counts against the day", async ({ page, context }) => {
    const { userId } = await signInAndAccept(page, context, "guide-check", "/guide-check");
    await expect(page.getByText("Còn 5 lượt hôm nay")).toBeVisible();

    await page.getByLabel("Ý tưởng app (không bắt buộc)").fill("app nhắc uống nước cho dân văn phòng");
    await page.getByLabel("Bộ câu hỏi, mỗi câu một dòng").fill("Một ngày làm việc của anh thế nào?\nAnh hay quên uống nước vì bận, đúng không?\n<img src=x onerror=alert(1)> Lần gần nhất anh thấy mệt là khi nào?");
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    const result = page.getByRole("region", { name: "Kết quả kiểm tra" });
    await expect(result.getByRole("status")).toHaveText("1/3 câu dẫn dắt · 1/3 câu nên sửa");
    await expect(result.getByRole("listitem")).toHaveCount(3);
    await expect(result.getByRole("listitem").nth(1)).toContainText("Dẫn dắt");
    // The learner's text is shown as text, not as markup.
    await expect(result.getByRole("listitem").nth(2)).toContainText("<img src=x onerror=alert(1)> Lần gần nhất");
    await expect(page.getByText("Còn 4 lượt hôm nay")).toBeVisible();

    const rows = await getDb().select().from(events).where(and(eq(events.userId, userId), eq(events.name, "guide_checked")));
    expect(rows).toMatchObject([{ props: { idea: true, refused: false, questions: 3, flagged: 1 } }]);
  });

  test("a visitor who is not signed in is sent to sign in", async ({ page }) => {
    await page.goto("/guide-check");
    await expect(page).not.toHaveURL(/\/guide-check$/);
  });
});
