import { expect, test, type Page } from "@playwright/test";
import { DELETE_ACCOUNT, PLAYED_BEFORE_DELETION } from "@/strings/product-strings";
import { createAccount, signIn, signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { startInterview } from "./helpers/interview";
import { PLAIN_QUESTIONS, endedInterview, expectResult, guess } from "./helpers/reveal";

const openButton = (page: Page) => page.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" });
const dialog = (page: Page) => page.getByRole("alertdialog", { name: DELETE_ACCOUNT.title });
const word = (page: Page) => dialog(page).getByLabel("Gõ XÓA để xác nhận");
const confirm = (page: Page) => dialog(page).getByRole("button", { name: "Xóa vĩnh viễn" });
const sessionCookies = async (page: Page) => (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("sb-"));

/** A learner with a finished session, signed in with a known Google account, on Buổi của tôi. */
async function learnerWithFinishedSession(page: Page, label: string, googleSubject: string) {
  const started = await endedInterview(page, page.context(), label, PLAIN_QUESTIONS, "làm kế toán, đi xe máy");
  await guess(page, 0);
  await expectResult(page, 0, 0);
  expect((await db.session(started.sessionId)).status).toBe("done");
  await db.addGoogleIdentity(started.userId, started.email, googleSubject);
  await page.goto("/my-sessions");
  return started;
}

test.describe("Màn 9: deleting the account", () => {
  test("the dialog says what goes and what stays, and unlocks only for the word", async ({ page, context }) => {
    await signInAndAccept(page, context, "delete-dialog");

    await openButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(DELETE_ACCOUNT.body);
    await expect(dialog(page)).toContainText(DELETE_ACCOUNT.kept);
    await expect(confirm(page)).toBeDisabled();

    // Close enough is not enough.
    for (const typed of ["XOA", "xóa", "XÓA NGAY", "X"]) {
      await word(page).fill(typed);
      await expect(confirm(page), typed).toBeDisabled();
    }
    // The accent typed as a separate character is the same word.
    await word(page).fill("XÓA");
    await expect(confirm(page)).toBeEnabled();
    await word(page).fill(" XÓA ");
    await expect(confirm(page)).toBeEnabled();

    // "Hủy" and Esc both close it, delete nothing, and forget what was typed.
    await dialog(page).getByRole("button", { name: "Hủy" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(openButton(page)).toBeFocused();
    await openButton(page).click();
    await expect(word(page)).toHaveValue("");
    await expect(confirm(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Buổi của tôi" })).toBeVisible();
  });

  test("deleting removes every row about the learner, the sign-in account and the sign-in", async ({ page }) => {
    const subject = `google-${uniqueEmail("subject")}`;
    const { userId, sessionId, email } = await learnerWithFinishedSession(page, "delete-all", subject);
    await page.request.post("/api/waitlist", { data: { context: "no_more_personas" } });
    expect(await db.user(userId)).toBeDefined();
    expect((await db.turnsOf(sessionId)).length).toBeGreaterThan(1);
    expect((await db.eventsOfUser(userId)).length).toBeGreaterThan(0);
    expect(await db.waitlistOf(userId)).toHaveLength(1);
    expect((await db.llmCallsOf(sessionId)).length).toBeGreaterThan(0);
    const deletionsBefore = (await db.eventsNamed("account_deleted")).length;
    const tombstonesBefore = (await db.tombstones()).length;

    await openButton(page).click();
    await word(page).fill("XÓA");
    await confirm(page).click();

    // Signed out, on the home page.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
    await expect(page.getByLabel("Tài khoản: mở menu")).toHaveCount(0);
    expect(await sessionCookies(page)).toEqual([]);

    // A query per table: nothing is left of the learner.
    expect(await db.user(userId)).toBeUndefined();
    expect(await db.sessionsOf(userId)).toEqual([]);
    expect(await db.session(sessionId)).toBeUndefined();
    expect(await db.turnsOf(sessionId)).toEqual([]);
    expect(await db.snapshotsOf(sessionId)).toEqual([]);
    expect(await db.eventsOf(sessionId)).toEqual([]);
    expect(await db.eventsOfUser(userId)).toEqual([]);
    expect(await db.waitlistOf(userId)).toEqual([]);
    expect(await db.llmCallsOf(sessionId)).toEqual([]);
    expect(await db.authAccounts(userId)).toHaveLength(0);

    // What stays names nobody.
    const deletions = await db.eventsNamed("account_deleted");
    expect(deletions).toHaveLength(deletionsBefore + 1);
    expect(deletions.at(-1)).toMatchObject({ userId: null, sessionId: null, props: { sessions: 1 } });
    const tombstones = await db.tombstones();
    expect(tombstones).toHaveLength(tombstonesBefore + 1);
    const kept = JSON.stringify(tombstones);
    for (const personal of [email, userId, sessionId, subject]) expect(kept).not.toContain(personal);

    // The pages that need a sign-in ask for one again.
    await page.goto("/my-sessions");
    await expect(page).toHaveURL("/sign-in?next=%2Fmy-sessions");
    await page.goto(`/sessions/${sessionId}`);
    await expect(page).toHaveURL(/\/sign-in\?next=/u);
    expect((await page.request.get("/api/sessions")).status()).toBe(401);
  });

  test("signing in again with the same Google account does not give a second session with the persona", async ({ page, context, browser }) => {
    const subject = `google-${uniqueEmail("returning")}`;
    const { email } = await learnerWithFinishedSession(page, "delete-return", subject);
    await openButton(page).click();
    await word(page).fill("XÓA");
    await confirm(page).click();
    await expect(page).toHaveURL("/");

    // The same person signs in again: a new account on the auth server, the same Google account behind it.
    const newId = await createAccount(email);
    await db.addGoogleIdentity(newId, email, subject);
    await signIn(context, email);
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await expect(page.locator("main [role=alert]")).toHaveText(PLAYED_BEFORE_DELETION);
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "Về trang chủ" })).toBeVisible();
    await page.goto("/my-sessions");
    await expect(page.getByRole("heading", { name: "Bạn chưa luyện buổi nào" })).toBeVisible();
    expect(await db.sessionsOf(newId)).toEqual([]);

    // Somebody else, with another Google account, is not held to it.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const started = await startInterview(other, otherContext, "delete-someone-else");
    expect(await db.sessionsOf(started.userId)).toHaveLength(1);
    await otherContext.close();
  });

  test("a second browser still signed in to the deleted account is signed out, and brings nothing back", async ({ page, context, browser }) => {
    const { userId, email } = await signInAndAccept(page, context, "delete-second-browser");
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signIn(otherContext, email);
    await other.goto("/my-sessions");
    await expect(other.getByRole("heading", { level: 1, name: "Buổi của tôi" })).toBeVisible();

    await openButton(page).click();
    await word(page).fill("XÓA");
    await confirm(page).click();
    await expect(page).toHaveURL("/");
    expect(await db.user(userId)).toBeUndefined();

    // The other browser's token has not expired, but the account behind it is gone.
    await other.goto("/my-sessions");
    await expect(other).toHaveURL("/sign-in?next=%2Fmy-sessions");
    expect((await other.request.get("/api/sessions")).status()).toBe(401);
    expect((await other.request.delete("/api/account", { data: { confirm: "XÓA" } })).status()).toBe(401);
    await other.goto("/prep/chi-thu");
    await expect(other.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
    expect(await db.user(userId)).toBeUndefined();
    await otherContext.close();
  });

  test("a failed delete removes nothing, keeps the dialog as it was, and can be tried again", async ({ page, context }) => {
    const { userId, sessionId } = await startInterview(page, context, "delete-fails");
    await page.goto("/my-sessions");
    await openButton(page).click();
    await word(page).fill("XÓA");

    let attempts = 0;
    await page.route("**/api/account", (route) => {
      attempts += 1;
      return route.abort();
    });
    await confirm(page).click();
    const alert = dialog(page).getByRole("alert");
    await expect(alert).toContainText("Không kết nối được.");
    await expect(word(page)).toHaveValue("XÓA");
    expect(await db.user(userId)).toBeDefined();
    expect(await db.session(sessionId)).toBeDefined();
    expect((await sessionCookies(page)).length).toBeGreaterThan(0);

    // Three retries that fail as well: the screen stops offering one.
    for (let retry = 1; retry <= 3; retry += 1) {
      await expect(alert).toContainText("Không kết nối được.");
      await alert.getByRole("button", { name: "Thử lại" }).click();
      await expect.poll(() => attempts).toBe(retry + 1);
    }
    await expect(alert).toContainText("InterviewLab đang gặp sự cố.");
    await expect(alert.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
    await expect(confirm(page)).toBeDisabled();
    expect(await db.user(userId)).toBeDefined();

    // The connection is back: opening the dialog again starts over, and the delete goes through.
    await page.unroute("**/api/account");
    await dialog(page).getByRole("button", { name: "Hủy" }).click();
    await openButton(page).click();
    await word(page).fill("XÓA");
    await confirm(page).click();
    await expect(page).toHaveURL("/");
    expect(await db.user(userId)).toBeUndefined();
    expect(await db.session(sessionId)).toBeUndefined();
  });

  test("one failure, then 'Thử lại' deletes", async ({ page, context }) => {
    const { userId } = await signInAndAccept(page, context, "delete-retry");
    await openButton(page).click();
    await word(page).fill("XÓA");
    await page.route("**/api/account", (route) => route.abort());
    await confirm(page).click();
    await expect(dialog(page).getByRole("alert")).toContainText("Không kết nối được.");

    await page.unroute("**/api/account");
    await dialog(page).getByRole("alert").getByRole("button", { name: "Thử lại" }).click();

    await expect(page).toHaveURL("/");
    expect(await db.user(userId)).toBeUndefined();
  });

  test("the API deletes nothing without the word, whatever else is sent", async ({ page, context }) => {
    // This learner never accepted the data notice.
    const userId = await signInAsNewLearner(context, uniqueEmail("delete-api"));
    await page.goto("/");
    await expect(page.getByLabel("Tài khoản: mở menu")).toBeVisible();

    for (const body of [undefined, {}, { confirm: "xóa" }, { confirm: "XOA" }, { confirm: true }, "XÓA", { confirm: ["XÓA"] }]) {
      const answer = await page.request.delete("/api/account", { data: body as never });
      expect(answer.status(), JSON.stringify(body)).toBe(400);
      expect(await answer.json()).toEqual({ error: "invalid_input" });
    }
    expect(await db.user(userId)).toBeDefined();
    expect(await db.authAccounts(userId)).toHaveLength(1);

    // With the word it deletes, and accepting the data notice first is not required for that.
    const answer = await page.request.delete("/api/account", { data: { confirm: "XÓA" } });
    expect(answer.status()).toBe(200);
    expect(await answer.json()).toEqual({ deleted: true });
    expect(await db.user(userId)).toBeUndefined();
  });

  test("while a scenario is being prepared the button is locked and the API refuses", async ({ page, context }) => {
    const { userId, sessionId } = await startInterview(page, context, "delete-generating");
    await db.setSessionStatus(sessionId, "generating");

    await page.goto("/my-sessions");
    await expect(openButton(page)).toBeDisabled();
    await expect(page.getByText("Đợi kịch bản đang chuẩn bị xong rồi xóa.")).toBeVisible();
    await expect(page.locator(".srows li")).toContainText("Đang chuẩn bị");

    const answer = await page.request.delete("/api/account", { data: { confirm: "XÓA" } });
    expect(answer.status()).toBe(409);
    expect(await answer.json()).toEqual({ error: "generating" });
    expect(await db.user(userId)).toBeDefined();
    expect(await db.session(sessionId)).toBeDefined();

    // Preparation over: the account can go.
    await db.setSessionStatus(sessionId, "interviewing");
    await page.reload();
    await expect(openButton(page)).toBeEnabled();
    await expect(page.getByText("Đợi kịch bản đang chuẩn bị xong rồi xóa.")).toHaveCount(0);
  });
});
