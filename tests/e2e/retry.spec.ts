import { expect, test } from "@playwright/test";
import { db } from "./helpers/db";
import { PLAIN_QUESTIONS, endedInterview, expectResult, guess } from "./helpers/reveal";

const SESSION_URL = /\/sessions\/[0-9a-f-]{36}$/u;

test.describe("playing a persona again from the start", () => {
  test("a finished session: from its result, the topic card and Màn 3 to a new interview at the opening line, the first result kept", async ({ page, context }) => {
    const first = await endedInterview(page, context, "retry", PLAIN_QUESTIONS, "làm kế toán");
    await guess(page, 0);
    await expectResult(page, 0, 0);
    expect((await db.session(first.sessionId)).status).toBe("done");

    // The result offers it.
    const again = page.getByRole("region", { name: "Bước tiếp theo" }).getByRole("link", { name: "Luyện lại với chị Thu từ đầu" });
    await expect(again).toHaveAttribute("href", "/prep/chi-thu");

    // The topic's card: the result one press away, and a new start.
    await page.goto("/topics/ux-chi-tieu");
    const card = page.locator("article.pcard").first();
    await expect(card.locator(".ribbon")).toContainText("Đã luyện");
    await expect(card.locator(".actionbar a")).toHaveText(["Xem lại kết quả", "Luyện lại từ đầu"]);
    await expect(card.getByRole("link", { name: "Xem lại kết quả" })).toHaveAttribute("href", `/sessions/${first.sessionId}`);
    await card.getByRole("link", { name: "Luyện lại từ đầu" }).click();

    // Màn 3: the press starts again, and the last result is still there.
    await expect(page).toHaveURL("/prep/chi-thu");
    await expect(page.getByRole("link", { name: "Xem lại kết quả buổi trước" })).toHaveAttribute("href", `/sessions/${first.sessionId}`);
    await page.getByRole("button", { name: "Luyện lại từ đầu" }).click();
    await expect(page).toHaveURL(SESSION_URL);
    const secondId = page.url().split("/").pop()!;
    expect(secondId).not.toBe(first.sessionId);

    // A new interview: the opening line, nothing asked yet.
    await expect(page.getByLabel("Câu hỏi của bạn")).toBeVisible();
    expect(await db.session(secondId)).toMatchObject({ userId: first.userId, personaId: "chi-thu", status: "interviewing" });
    expect((await db.turnsOf(secondId)).map((turn) => turn.index)).toEqual([0]);
    expect((await db.session(first.sessionId)).status).toBe("done");

    // Unfinished now: the card and Màn 3 lead back into it, and start nothing more.
    await page.goto("/prep/chi-thu");
    await expect(page.getByRole("button", { name: /Bắt đầu|Luyện lại/u })).toHaveCount(0);

    // Both sessions are listed, the first with its result.
    await page.goto("/my-sessions");
    await expect(page.locator(".srows li")).toHaveCount(2);
    await expect(page.locator(`.srows a[href="/sessions/${first.sessionId}"]`)).toBeVisible();
    await expect(page.locator(`.srows a[href="/sessions/${secondId}"]`)).toBeVisible();
  });
});
