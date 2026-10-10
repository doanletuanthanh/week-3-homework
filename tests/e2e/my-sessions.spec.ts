import { expect, test, type Page } from "@playwright/test";
import { getDb } from "@/db/client";
import type { AppUser } from "@/server/auth";
import { openSession } from "@/server/sessions";
import { ensureAccount, signIn, signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { composer, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { postEnd, startInterview } from "./helpers/interview";
import { PLAIN_QUESTIONS, PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess, guessHeading, playQuestions, transcriptDrawer } from "./helpers/reveal";
import { DEMO_LIST_EMAIL } from "./helpers/stack";

const TOPIC = "Chi tiêu hằng ngày của người trẻ đi làm";
const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Buổi của tôi" });
const rows = (page: Page) => page.locator(".srows li");
const rowOf = (page: Page, sessionId: string) => page.locator(`.srows a[href="/sessions/${sessionId}"]`);
const loadMore = (page: Page) => page.getByRole("button", { name: "Tải thêm" });
const listApi = async (page: Page, query = "") => (await page.request.get(`/api/sessions${query}`)).json();

/** The demo account of the list tests, signed in, with the notice accepted. */
async function signInAsListDemo(page: Page): Promise<AppUser> {
  const id = await ensureAccount(DEMO_LIST_EMAIL);
  await signIn(page.context(), DEMO_LIST_EMAIL);
  await page.goto("/data-notice?next=/my-sessions");
  const agree = page.getByRole("button", { name: "Tôi hiểu" });
  await expect(agree.or(heading(page))).toBeVisible();
  if (await agree.isVisible()) await agree.click();
  await expect(heading(page)).toBeVisible();
  return { id, email: DEMO_LIST_EMAIL, isAdmin: false, isDemo: true, noticeAcked: true, roleFilter: null };
}

/** Gives the demo account sessions until it has at least this many. A demo account has no one-session limit. */
async function ensureDemoSessions(demo: AppUser, atLeast: number) {
  for (let count = (await db.sessionsOf(demo.id)).length; count < atLeast; count += 1) {
    expect((await openSession(getDb(), demo, "chi-thu")).ok).toBe(true);
  }
  return (await db.sessionsOf(demo.id)).length;
}

test.describe("Màn 9: who sees it", () => {
  test("a visitor is sent to sign in and back, and a learner who has not agreed sees the notice first", async ({ page, context }) => {
    await page.goto("/my-sessions");
    await expect(page).toHaveURL("/sign-in?next=%2Fmy-sessions");
    const api = await page.request.get("/api/sessions");
    expect(api.status()).toBe(401);
    expect(await api.json()).toEqual({ error: "unauthorized", redirectTo: "/sign-in?next=%2Fmy-sessions" });
    // Signed out, the header has no link to it.
    await expect(page.getByRole("link", { name: "Buổi của tôi" })).toHaveCount(0);

    await signInAsNewLearner(context, uniqueEmail("mine-notice"));
    await page.goto("/my-sessions");
    await expect(page).toHaveURL("/data-notice?next=%2Fmy-sessions");
    const refused = await page.request.get("/api/sessions");
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual({ error: "notice_required", redirectTo: "/data-notice?next=%2Fmy-sessions" });

    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/my-sessions");
    await expect(heading(page)).toBeVisible();
  });

  test("empty: says so, leads to the persona, and still offers the account", async ({ page, context }) => {
    const { email } = await signInAndAccept(page, context, "mine-empty");

    await expect(page).toHaveTitle("Buổi của tôi · InterviewLab");
    await expect(page.getByRole("heading", { level: 2, name: "Bạn chưa luyện buổi nào" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bắt đầu luyện" })).toHaveAttribute("href", "/prep/chi-thu");
    await expect(page.locator(".slist")).toHaveCount(0);
    await expect(page.getByText(/^\d+ buổi$/u)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Tài khoản" })).toContainText(email);
    await expect(page.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" })).toBeEnabled();
    expect(await listApi(page)).toEqual({ items: [], nextOffset: null });

    await page.getByRole("link", { name: "Bắt đầu luyện" }).click();
    await expect(page).toHaveURL("/prep/chi-thu");
  });
});

test.describe("Màn 9: one session through every state", () => {
  test("the row's label, what it opens, and numbers only once the session is done", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "mine-walk");
    const row = () => rowOf(page, sessionId);
    /** While the session is not done, neither the page nor the list API carries a number. */
    const expectNoNumbers = async () => {
      await page.goto("/my-sessions");
      await expect(rows(page)).toHaveCount(1);
      await expect(row()).toContainText("Chị Thu");
      await expect(row()).toContainText(TOPIC);
      await expect(row().locator(".pill")).toHaveText("Đang làm dở");
      await expect(row().locator(".btn")).toHaveText("Tiếp tục");
      await expect(row().locator(".res")).toHaveCount(0);
      expect(await page.content()).not.toMatch(/Kể \d|Nhận biết/u);
      const sent = await listApi(page);
      expect(sent).toEqual({ items: [{ id: sessionId, personaName: "Chị Thu", topicTitle: TOPIC, date: expect.stringMatching(/^\d{2}\/\d{2}$/u), state: "in_progress", result: null }], nextOffset: null });
    };

    // interviewing, no question yet → Màn 3, whose button leads into Màn 4. This learner comes
    // back in a browser that has not pressed that button.
    await context.clearCookies({ name: "il_entered" });
    await expectNoNumbers();
    await expect(page.getByText("1 buổi", { exact: true })).toBeVisible();
    await row().click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await expect(composer(page)).toBeVisible();

    // interviewing, asked → Màn 4 at the turn it stopped on, in any browser.
    await playQuestions(page.request, sessionId, PRIMARY_QUESTIONS);
    await context.clearCookies({ name: "il_entered" });
    await expectNoNumbers();
    await row().click();
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 6" })).toBeVisible();
    await expect(sendButton(page)).toBeVisible();
    // The browser's back button leaves the session for the screen before it.
    await page.goBack();
    await expect(page).toHaveURL("/my-sessions");
    await expect(heading(page)).toBeVisible();

    // ended, no guess → Màn 5.
    expect((await postEnd(page.request, sessionId, { canvasText: PRIMARY_NOTES })).status).toBe(200);
    await expectNoNumbers();
    await row().click();
    await expect(guessHeading(page)).toBeVisible();

    // revealed, replay on offer → Màn 6 with the offer. The result exists, and the list still holds it back.
    await guess(page, 5);
    await expectResult(page, 5, 2);
    expect((await db.session(sessionId)).revealJson).not.toBeNull();
    await expectNoNumbers();
    await row().click();
    await expectResult(page, 5, 2);
    await expect(page.locator(".replay-offer")).toBeVisible();

    // replaying → Màn 7.
    await page.locator(".replay-offer").getByRole("button", { name: "Quay lại lượt 3" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Luyện lại từ lượt 3" })).toBeVisible();
    await expectNoNumbers();
    await row().click();
    await expect(page.getByRole("heading", { level: 1, name: "Luyện lại từ lượt 3" })).toBeVisible();

    // done → the review, with the numbers of the main interview in the list.
    expect((await page.request.post(`/api/sessions/${sessionId}/replay`, { data: { action: "stop" } })).status()).toBe(200);
    const { counts } = (await db.session(sessionId)).revealJson!;
    expect(counts).toMatchObject({ told: 2, total: 11 });
    await page.goto("/my-sessions");
    await expect(row().locator(".res")).toHaveText(`Kể 2/11 · Nhận biết ${counts.recognizedFull}`);
    await expect(row().locator(".btn")).toHaveText("Xem lại");
    await expect(row().locator(".pill")).toHaveCount(0);
    expect(await listApi(page)).toMatchObject({ items: [{ id: sessionId, state: "done", result: { told: 2, total: 11, recognized: { state: "count", value: counts.recognizedFull } } }] });

    // The review shows the same two numbers, is read-only, and calls no model however it is read.
    const callsBefore = await db.llmCallCount();
    const stored = JSON.stringify(await db.session(sessionId));
    await row().click();
    await expectResult(page, 5, 2);
    await expect(page.locator(".recog")).toHaveText(`Nhận biết: ${counts.recognizedFull} điều quan trọng trong ghi chú của bạn.`);
    await expect(page.locator(".replay-offer")).toHaveCount(0);
    await expect(composer(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tải về" })).toBeEnabled();
    await page.getByRole("button", { name: "Lượt 1", exact: true }).first().click();
    await expect(transcriptDrawer(page).locator("li.turn")).toHaveCount(7);
    await page.keyboard.press("Escape");
    await page.reload();
    await expectResult(page, 5, 2);
    await page.request.get(`/api/sessions/${sessionId}/reveal`);
    await page.request.get(`/api/sessions/${sessionId}/transcript?branch=replay`);
    expect(await db.llmCallCount()).toBe(callsBefore);
    expect(JSON.stringify(await db.session(sessionId))).toBe(stored);
  });

  test("a finished session with empty notes says so in place of the second number", async ({ page, context }) => {
    const { sessionId } = await endedInterview(page, context, "mine-empty-notes", PLAIN_QUESTIONS, "");
    await guess(page, 0);
    await expectResult(page, 0, 0);

    await page.goto("/my-sessions");
    await expect(rowOf(page, sessionId).locator(".res")).toHaveText("Kể 0/11 · Không có ghi chú");
  });

  test("a withdrawn session says it was stopped and opens on its read-only transcript", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "mine-withdrawn");
    await playQuestions(page.request, sessionId, ["Chị kể em nghe về công việc của chị được không ạ?"]);
    await db.setSessionStatus(sessionId, "withdrawn");

    await page.goto("/my-sessions");
    const row = rowOf(page, sessionId);
    await expect(row.locator(".pill")).toHaveText("Đã dừng: nhân vật đã được gỡ");
    await expect(row.locator(".res")).toHaveCount(0);
    await expect(row.locator(".btn")).toHaveCount(0);
    expect(await listApi(page)).toMatchObject({ items: [{ id: sessionId, state: "withdrawn", result: null }] });

    await row.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây.");
    await expect(page.locator(".stopped-text")).toContainText(`Chị Thu · ${TOPIC} · dừng ở lượt 1`);
    await expect(page.locator(".stopped-log .pill")).toHaveText("Chỉ đọc");
    await expect(page.locator(".stopped-log .k")).toHaveText(["Lượt 00", "Lượt 01"]);
    await expect(page.locator(".stopped-log")).toContainText("Chị kể em nghe về công việc của chị được không ạ?");
    await expect(page.locator(".stopped-log")).toContainText("Chị trả lời câu thứ 1 (trong khối dữ liệu).");
    await expect(composer(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kết thúc buổi" })).toHaveCount(0);

    // Both ways back lead to the list.
    await expect(page.getByRole("navigation", { name: "Đường dẫn" }).getByRole("link", { name: "Buổi của tôi" })).toHaveAttribute("href", "/my-sessions");
    await page.locator(".stopped-head").getByRole("link", { name: "Buổi của tôi" }).click();
    await expect(page).toHaveURL("/my-sessions");
  });

  test("text a learner typed is shown as text in the withdrawn transcript", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "mine-escape");
    await playQuestions(page.request, sessionId, ['<img src=x onerror="window.pwned=1"> <b>đậm</b> chị ạ?']);
    await db.setSessionStatus(sessionId, "withdrawn");

    await page.goto(`/sessions/${sessionId}`);
    await expect(page.locator(".stopped-log")).toContainText('<img src=x onerror="window.pwned=1"> <b>đậm</b> chị ạ?');
    await expect(page.locator(".stopped-log img, .stopped-log b")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });
});

test.describe("Màn 9: coming back to the list", () => {
  test("the back button shows the session as it is now, not as it was when the list was left", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "mine-back");
    await playQuestions(page.request, sessionId, ["Chị kể em nghe về công việc của chị được không ạ?"]);
    await page.goto("/my-sessions");
    await expect(rowOf(page, sessionId).locator(".pill")).toHaveText("Đang làm dở");

    await rowOf(page, sessionId).click();
    await expect(composer(page)).toBeVisible();
    // While the learner is on the session, it changes: here the persona is pulled with its sessions.
    await db.setSessionStatus(sessionId, "withdrawn");
    await page.goBack();

    await expect(page).toHaveURL("/my-sessions");
    await expect(rowOf(page, sessionId).locator(".pill")).toHaveText("Đã dừng: nhân vật đã được gỡ");
    await expect(rowOf(page, sessionId).locator(".btn")).toHaveCount(0);
  });
});

test.describe("Màn 9: a long list", () => {
  test("twenty rows first, newest on top; 'Tải thêm' adds the rest and then goes away", async ({ page }) => {
    const demo = await signInAsListDemo(page);
    const total = await ensureDemoSessions(demo, 23);
    const newestFirst = (await db.sessionsOf(demo.id)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || (a.id < b.id ? 1 : -1)).map((session) => session.id);

    await page.goto("/my-sessions");
    await expect(page.getByText(`${total} buổi`, { exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    const shown = async () => rows(page).locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")!.split("/").pop()));
    expect(await shown()).toEqual(newestFirst.slice(0, 20));
    expect(await listApi(page)).toMatchObject({ nextOffset: 20 });

    await loadMore(page).click();
    await expect(rows(page)).toHaveCount(Math.min(total, 40));
    expect(await shown()).toEqual(newestFirst.slice(0, 40));
    if (total <= 40) await expect(loadMore(page)).toHaveCount(0);

    // The API refuses an offset that is not a count.
    for (const offset of ["-1", "abc", "1.5", "99999999999"]) {
      expect((await page.request.get(`/api/sessions?offset=${offset}`)).status(), offset).toBe(400);
    }
    expect(await listApi(page, `?offset=${total}`)).toEqual({ items: [], nextOffset: null });
  });

  test("a load that fails keeps the rows, offers a retry, and after three failed retries stops offering", async ({ page }) => {
    const demo = await signInAsListDemo(page);
    const total = await ensureDemoSessions(demo, 23);
    await page.goto("/my-sessions");
    await expect(rows(page)).toHaveCount(20);

    let attempts = 0;
    await page.route("**/api/sessions?offset=*", (route) => {
      attempts += 1;
      return route.abort();
    });
    await loadMore(page).click();
    const alert = page.locator(".smore").getByRole("alert");
    await expect(alert).toContainText("Không kết nối được.");
    await expect(rows(page)).toHaveCount(20);
    await expect(loadMore(page)).toHaveCount(0);

    for (let retry = 1; retry <= 3; retry += 1) {
      await expect(alert).toContainText("Không kết nối được.");
      await alert.getByRole("button", { name: "Thử lại" }).click();
      await expect.poll(() => attempts).toBe(retry + 1);
    }
    await expect(alert).toHaveText("InterviewLab đang gặp sự cố. Tiến độ của bạn đã được lưu; quay lại sau ít phút.");
    await expect(alert.getByRole("button")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(20);

    // A reload starts over; one failure, then the retry brings the rest.
    await page.unroute("**/api/sessions?offset=*");
    await page.reload();
    let failOnce = true;
    await page.route("**/api/sessions?offset=*", (route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      return route.abort();
    });
    await loadMore(page).click();
    await expect(page.locator(".smore").getByRole("alert")).toContainText("Không kết nối được.");
    await page.locator(".smore").getByRole("button", { name: "Thử lại" }).click();
    await expect(rows(page)).toHaveCount(Math.min(total, 40));
    await expect(page.locator(".smore").getByRole("alert")).toHaveCount(0);
  });

  test("a server error is the same standard error as a lost connection", async ({ page }) => {
    const demo = await signInAsListDemo(page);
    await ensureDemoSessions(demo, 23);
    await page.goto("/my-sessions");
    await page.route("**/api/sessions?offset=*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));

    await loadMore(page).click();

    await expect(page.locator(".smore").getByRole("alert")).toContainText("Không kết nối được.");
    await expect(rows(page)).toHaveCount(20);
  });

  test("when the sign-in has run out, 'Tải thêm' goes to sign in and comes back to this page", async ({ page, context }) => {
    const demo = await signInAsListDemo(page);
    await ensureDemoSessions(demo, 23);
    await page.goto("/my-sessions");
    await expect(rows(page)).toHaveCount(20);

    // The list has finished asking the server for itself: what follows is the press alone.
    await page.waitForLoadState("networkidle");
    await context.clearCookies();
    await loadMore(page).click();

    await expect(page).toHaveURL("/sign-in?next=%2Fmy-sessions");
  });
});

test.describe("Màn 3 for a demo account (FR-45)", () => {
  test("the main button opens the newest session, and 'Bắt đầu buổi mới' starts one more", async ({ page }) => {
    const demo = await signInAsListDemo(page);
    const before = await ensureDemoSessions(demo, 2);
    const newest = (await db.sessionsOf(demo.id)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

    await page.goto("/prep/chi-thu");
    // The newest session has no question yet, so the main button is the press that leads into it.
    const newestId = page.locator("form:has(button:text-is('Tiếp tục buổi luyện')) input[name=sessionId]");
    await expect(newestId).toHaveValue(newest.id);
    await expect(page.getByRole("button", { name: "Bắt đầu", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Bắt đầu buổi mới" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
    const created = page.url().split("/").pop()!;
    expect(created).not.toBe(newest.id);
    expect(await db.sessionsOf(demo.id)).toHaveLength(before + 1);
    expect(await db.session(created)).toMatchObject({ userId: demo.id, isDemo: true, status: "interviewing" });

    // The main button now points at the session just started.
    await page.goto("/prep/chi-thu");
    await expect(newestId).toHaveValue(created);
    await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(page).toHaveURL(`/sessions/${created}`);
    await expect(composer(page)).toBeVisible();
  });

  test("a learner gets no second start: one session per persona", async ({ page, context }) => {
    const { sessionId, userId } = await startInterview(page, context, "mine-one-session");

    await page.goto("/prep/chi-thu");
    await expect(page.locator("form input[name=sessionId]")).toHaveValue(sessionId);
    await expect(page.getByRole("button", { name: "Tiếp tục buổi luyện" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bắt đầu/u })).toHaveCount(0);
    expect(await db.sessionsOf(userId)).toHaveLength(1);
  });
});

test.describe("header (PRD §6.0)", () => {
  test("wide screen: 'Buổi của tôi' is in the header on every page, marked on its own, and the account menu closes itself", async ({ page, context }) => {
    await signInAndAccept(page, context, "header-wide", "/");
    const link = page.getByRole("banner").getByRole("link", { name: "Buổi của tôi" });
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("banner").getByLabel("Menu", { exact: true })).toBeHidden();

    await link.click();
    await expect(page).toHaveURL("/my-sessions");
    await expect(link).toHaveAttribute("aria-current", "page");

    // The account menu: Esc and a press elsewhere close it.
    const menu = page.getByLabel("Tài khoản: mở menu");
    const signOut = page.getByRole("button", { name: "Đăng xuất", exact: true });
    await menu.click();
    await expect(signOut).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(signOut).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await expect(signOut).toBeVisible();
    await heading(page).click();
    await expect(signOut).toBeHidden();

    // It opens with the keyboard alone.
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(signOut).toBeVisible();
  });

  test.describe("narrow screen", () => {
    test.use({ viewport: { width: 390, height: 780 } });

    test("the header folds into one menu with the same destinations, and the list fits", async ({ page, context }) => {
      const { sessionId, email } = await startInterview(page, context, "header-narrow");
      await page.goto("/prep/chi-thu");
      const banner = page.getByRole("banner");
      const button = banner.getByLabel("Menu", { exact: true });
      await expect(button).toBeVisible();
      await expect(banner.getByLabel("Tài khoản: mở menu")).toBeHidden();
      await expect(banner.getByRole("link", { name: "Buổi của tôi" })).toBeHidden();

      await button.click();
      const menu = banner.getByRole("navigation", { name: "Chính" }).last();
      await expect(menu.getByRole("link", { name: "Buổi của tôi" })).toBeVisible();
      await expect(menu.getByRole("button", { name: `Đăng xuất · ${email}` })).toBeVisible();

      // Following the link closes the menu on the page it leads to.
      await menu.getByRole("link", { name: "Buổi của tôi" }).click();
      await expect(page).toHaveURL("/my-sessions");
      await expect(heading(page)).toBeVisible();
      await expect(menu.getByRole("link", { name: "Buổi của tôi" })).toBeHidden();

      // The list, its row and the account card fit the screen.
      await expect(rowOf(page, sessionId)).toBeVisible();
      await expect(rowOf(page, sessionId).locator(".btn")).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const remove = page.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" });
      await remove.scrollIntoViewIfNeeded();
      await expect(remove).toBeInViewport({ ratio: 1 });
      await remove.click();
      await expect(page.getByRole("alertdialog")).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Escape");

      // Signing out from the folded menu.
      await button.click();
      await menu.getByRole("button", { name: `Đăng xuất · ${email}` }).click();
      await expect(banner.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
      await expect(button).toHaveCount(0);
    });

    test("the withdrawn page fits a narrow screen", async ({ page, context }) => {
      const { sessionId } = await startInterview(page, context, "withdrawn-narrow");
      await playQuestions(page.request, sessionId, ["Một câu hỏi đủ dài để kiểm tra việc xuống dòng: " + "a".repeat(140)]);
      await db.setSessionStatus(sessionId, "withdrawn");

      await page.goto(`/sessions/${sessionId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  });
});

test.describe("events written by the server (FR-38)", () => {
  test("'Tải về' and joining the waitlist each write their event, once per act", async ({ page, context }) => {
    const { sessionId, userId } = await endedInterview(page, context, "mine-events", PLAIN_QUESTIONS, "làm kế toán");

    // Before the session is done there is nothing to take away: no event.
    const early = await page.request.post(`/api/sessions/${sessionId}/download`);
    expect(early.status()).toBe(409);
    expect(await early.json()).toEqual({ error: "not_done" });

    await guess(page, 0);
    await expectResult(page, 0, 0);
    await page.evaluate(() => {
      window.print = () => window.dispatchEvent(new Event("afterprint"));
    });
    const named = async (name: string) => (await db.eventsOfUser(userId)).filter((event) => event.name === name);

    await page.getByRole("button", { name: "Tải về" }).click();
    await expect.poll(async () => (await named("takeaway_downloaded")).length).toBe(1);
    await page.getByRole("button", { name: "Tải về" }).click();
    await expect.poll(async () => (await named("takeaway_downloaded")).length).toBe(2);
    expect(await named("takeaway_downloaded")).toMatchObject([{ sessionId, props: {} }, { sessionId, props: {} }]);

    await page.getByRole("button", { name: "Báo tôi khi có" }).click();
    await expect(page.getByText("Đã ghi. Chúng tôi sẽ báo khi có persona mới.")).toBeVisible();
    // Asking again adds neither a row nor an event.
    expect((await page.request.post("/api/waitlist", { data: { context: "no_more_personas" } })).status()).toBe(200);
    expect(await named("waitlist_joined")).toMatchObject([{ sessionId: null, props: { context: "no_more_personas" } }]);
    expect(await db.waitlistOf(userId)).toHaveLength(1);
  });
});
