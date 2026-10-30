import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { signInAndAccept } from "./helpers/auth";
import { postEnd } from "./helpers/interview";
import { LEADING_QUESTIONS, PLAIN_QUESTIONS, endedInterview, guess, playQuestions } from "./helpers/reveal";

/** Built on what chị Thu said in turn 1, as the engine accepts a grounded question. */
const GROUNDED = `Lần đó chị ghi bằng gì ạ? [stub:analysis=${JSON.stringify({ label: "confirm_grounded", grounded_turn_id: 1 })}]`;

test.describe("progress and the guide check", () => {
  test("a learner with no finished session sees the way to the library on their progress page", async ({ page, context }) => {
    await signInAndAccept(page, context, "progress-empty", "/progress");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tiến bộ của tôi");
    await expect(page.getByRole("heading", { name: "Chưa có buổi nào có kết quả" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiến bộ" }).first()).toBeVisible();
  });

  test("two sessions with chị Thu: the page compares the last with this one in counts and in the learner's own questions, with no percentage", async ({ page, context }) => {
    // Before: one leading question.
    await endedInterview(page, context, "progress-pair", [LEADING_QUESTIONS[0]], "ghi vội");
    await guess(page, 0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bạn đoán 0.", { timeout: 20_000 });
    // The leading question is offered as a replay; skipping it finishes the session.
    await page.getByRole("button", { name: "Bỏ qua, xem kết quả luôn" }).click();
    await page.getByRole("alertdialog", { name: "Bỏ qua lần luyện lại?" }).getByRole("button", { name: "Xem kết quả luôn" }).click();
    await expect(page.getByText("Đã bỏ qua lần luyện lại", { exact: false })).toBeVisible();

    // After: the same persona from the start, one question built on what she said.
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Luyện lại từ đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
    const secondId = page.url().split("/").pop()!;
    await playQuestions(page.request, secondId, [PLAIN_QUESTIONS[0], GROUNDED]);
    expect((await postEnd(page.request, secondId, { canvasText: "ghi bằng sổ" })).status).toBe(200);
    await page.reload();
    await guess(page, 0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bạn đoán 0.", { timeout: 20_000 });

    await page.goto("/progress");
    const compared = page.getByRole("region", { name: "So với lần trước" });
    await expect(compared.getByRole("listitem")).toHaveCount(3);
    await expect(compared.getByRole("listitem").nth(0)).toContainText(/^Chị Thu kể: \d+ → \d+ điều/u);
    await expect(compared.getByRole("listitem").nth(1)).toHaveText("Câu dẫn dắt: 1 → 0 câu Tốt hơn");
    await expect(compared.getByRole("listitem").nth(2)).toContainText(/^Lời gợi mở bạn chưa hỏi tiếp: \d+ → \d+ lần/u);
    await expect(compared.locator(".pair-instead .q2")).toContainText("Chắc chị ngại ghi lắm đúng không ạ?");
    await expect(compared.locator(".pair-ask .q2")).toContainText("Lần đó chị ghi bằng gì ạ?");
    await expect(page.getByRole("link", { name: "Xem các buổi" })).toHaveAttribute("href", "/my-sessions");
    expect(await page.locator("main").innerText()).not.toContain("%");
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
