import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { signIn, signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { startInterview } from "./helpers/interview";
import { PLAIN_QUESTIONS, endedInterview, expectResult, guess } from "./helpers/reveal";
import { APP_URL } from "./helpers/stack";

const TOPIC_ID = "ux-chi-tieu";
const TOPIC_TITLE = "Chi tiêu hằng ngày của người trẻ đi làm";
const OTHER_NOTE = "Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề.";
const EMPTY = "Chưa có chủ đề cho vai trò này.";
const ROLE_COOKIE = "il_role";

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Chọn một chủ đề để luyện" });
const chips = (page: Page) => page.getByRole("group", { name: "Lọc theo vai trò" });
const chip = (page: Page, name: "UX" | "BA" | "PM" | "Khác") => chips(page).getByRole("button", { name, exact: true });
const topicCard = (page: Page) => page.locator(`a.tcard[href="/topics/${TOPIC_ID}"]`);
const shownCount = (page: Page) => page.locator(".lib-bar > span");
const createTile = (page: Page) => page.locator(".lib-create");
const emptyState = (page: Page) => page.locator(".lib-empty");
const ownSection = (page: Page) => page.getByRole("region", { name: "Chủ đề bạn tự tạo" });
const roleCookie = async (context: BrowserContext) => (await context.cookies()).find((cookie) => cookie.name === ROLE_COOKIE);
const filterEvents = () => db.eventsNamed("role_filter_selected");

/** The chosen chips, once the grid has taken the place of its skeleton. */
async function expectPressed(page: Page, names: string[]) {
  await expect(chips(page).getByRole("button")).toHaveCount(4);
  await expect(chips(page).locator('button[aria-pressed="true"]')).toHaveText(names);
}

/** Presses a chip and waits until the page shows it in the state the press leads to. */
async function press(page: Page, name: "UX" | "BA" | "PM" | "Khác", becomes: "true" | "false") {
  await chip(page, name).click();
  await expect(chip(page, name)).toHaveAttribute("aria-pressed", becomes);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

/** Submits a custom topic from Màn 10 and returns the session that stands for it. */
async function requestTopic(page: Page, topic: string) {
  await page.goto("/custom-topic");
  await page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?").fill(topic);
  await page.getByRole("button", { name: "Tạo kịch bản" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
  return page.url().split("/").pop()!;
}

test.describe("Màn 2: a guest reads the library", () => {
  test("answers 200 without sign-in and shows the filter, the way to a topic of one's own, then the topics", async ({ page }) => {
    const response = await page.goto("/library");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL("/library");
    await expect(page).toHaveTitle("Thư viện · InterviewLab");
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    // Four chips, none chosen: every topic.
    await expect(chips(page).getByRole("button")).toHaveText(["UX", "BA", "PM", "Khác"]);
    await expectPressed(page, []);
    await expect(shownCount(page)).toHaveText("1 chủ đề");
    await expect(page.getByText(OTHER_NOTE)).toHaveCount(0);

    // The first tile of the grid leads to Màn 10, under its label.
    const tiles = page.locator(".lib-grid > *");
    await expect(tiles).toHaveCount(2);
    await expect(tiles.first()).toHaveClass(/lib-create/u);
    await expect(createTile(page).getByRole("heading", { level: 2 })).toHaveText("Không thấy chủ đề bạn cần?");
    await expect(createTile(page)).toContainText("Gõ một chủ đề, InterviewLab tạo một nhân vật hư cấu để bạn luyện.");
    await expect(createTile(page).getByText("Kiểm tra nhẹ", { exact: true })).toBeVisible();
    await expect(createTile(page).getByRole("link", { name: "Tạo chủ đề của bạn" })).toHaveAttribute("href", "/custom-topic");

    // The topic card: its role in words, title, one sentence, the persona count, and where it leads.
    const card = topicCard(page);
    await expect(card.locator(".pill")).toHaveText("UX");
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(TOPIC_TITLE);
    await expect(card.locator(".tbody p")).not.toBeEmpty();
    await expect(card.locator(".tfoot")).toHaveText("1 persona");

    // A guest has no progress and no topics of their own.
    await expect(page.getByText("Đã luyện")).toHaveCount(0);
    await expect(page.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);
  });

  test("the way to a topic of one's own asks a guest to sign in and comes back to the form", async ({ page }) => {
    await page.goto("/library");
    await createTile(page).getByRole("link", { name: "Tạo chủ đề của bạn" }).click();
    await expect(page).toHaveURL("/sign-in?next=%2Fcustom-topic");
  });

  test("nothing of any item is sent: neither the page, its data for a client navigation, nor what a chip press brings back", async ({ page }) => {
    const scenario = readChiThu();
    /** The answer is the library, read whole, and holds nothing sealed: an empty body would prove nothing. */
    const expectClean = (body: string) => {
      expect(body).toContain(TOPIC_TITLE);
      expect(findSealed(body, scenario)).toEqual([]);
      // What a card shows of a persona is that it exists.
      expect(body).not.toContain(scenario.research_goal);
    };
    const fetched = async (headers: Record<string, string> = {}) => (await page.request.get("/library", { headers })).text();

    await page.goto("/library");
    await expect(topicCard(page)).toBeVisible();
    expectClean(await page.content());

    for (const name of ["UX", "Khác"] as const) {
      await press(page, name, "true");
      // What the press brought back, as the page now holds it (the browser does not keep that answer's body to read).
      expectClean(await page.content());
      // The page as a document, and as the data a client navigation asks for.
      expectClean(await fetched());
      expectClean(await fetched({ RSC: "1" }));
    }
  });
});

test.describe("Màn 2: the role filter of a guest", () => {
  test("a chip filters, survives a reload in this browser, and pressing it again clears it", async ({ page, context }) => {
    const eventsBefore = (await filterEvents()).length;
    await page.goto("/library");

    await press(page, "UX", "true");
    await expectPressed(page, ["UX"]);
    await expect(topicCard(page)).toBeVisible();
    await expect(shownCount(page)).toHaveText("1 chủ đề");
    await expect(page).toHaveURL("/library");

    // Remembered by the browser alone, out of reach of the page's scripts, for a year.
    const cookie = await roleCookie(context);
    expect(cookie).toMatchObject({ value: "ux", httpOnly: true, sameSite: "Lax", path: "/" });
    const days = (cookie!.expires - Date.now() / 1000) / 86_400;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(366);
    expect(await page.evaluate(() => document.cookie)).not.toContain(ROLE_COOKIE);

    await page.reload();
    await expectPressed(page, ["UX"]);
    await expect(topicCard(page)).toBeVisible();

    await press(page, "UX", "false");
    await expectPressed(page, []);
    expect(await roleCookie(context)).toBeUndefined();
    await page.reload();
    await expectPressed(page, []);
    await expect(topicCard(page)).toBeVisible();

    // A guest's choices leave no row behind.
    expect(await filterEvents()).toHaveLength(eventsBefore);
  });

  test("a role with no topic says so; 'Xem mọi chủ đề' clears the chip and brings the topics back", async ({ page, context }) => {
    await page.goto("/library");

    for (const role of ["BA", "PM"] as const) {
      await press(page, role, "true");
      await expectPressed(page, [role]);
      await expect(emptyState(page).getByRole("heading", { level: 2 })).toHaveText(EMPTY);
      await expect(shownCount(page)).toHaveText("0 chủ đề");
      await expect(topicCard(page)).toHaveCount(0);
      await expect(createTile(page)).toHaveCount(0);
      await expect(emptyState(page).getByRole("link", { name: "Tạo chủ đề của bạn" })).toHaveAttribute("href", "/custom-topic");
    }

    // The empty state stays after a reload: the choice is remembered.
    await page.reload();
    await expect(emptyState(page)).toBeVisible();
    expect((await roleCookie(context))?.value).toBe("pm");

    await emptyState(page).getByRole("button", { name: "Xem mọi chủ đề" }).click();
    await expect(topicCard(page)).toBeVisible();
    await expect(emptyState(page)).toHaveCount(0);
    await expectPressed(page, []);
    expect(await roleCookie(context)).toBeUndefined();
  });

  test("'Khác' shows every topic under its line, and one chip at a time is chosen", async ({ page }) => {
    await page.goto("/library");

    await press(page, "Khác", "true");
    await expect(page.getByText(OTHER_NOTE)).toBeVisible();
    await expect(topicCard(page)).toBeVisible();
    await expect(createTile(page)).toBeVisible();
    await expect(shownCount(page)).toHaveText("1 chủ đề");

    await press(page, "UX", "true");
    await expectPressed(page, ["UX"]);
    await expect(page.getByText(OTHER_NOTE)).toHaveCount(0);
  });

  test("a value that is not one of the four chips clears the filter and stores nothing", async ({ page, context }) => {
    await page.goto("/library");
    await press(page, "BA", "true");

    await chip(page, "PM").evaluate((button: HTMLButtonElement) => (button.value = '<script>alert(1)</script>"; DROP'));
    await chip(page, "PM").click();

    await expect(topicCard(page)).toBeVisible();
    await expectPressed(page, []);
    expect(await roleCookie(context)).toBeUndefined();

    // A cookie written by hand with a value outside the set is no filter either.
    await context.addCookies([{ name: ROLE_COOKIE, value: "admin", url: APP_URL }]);
    await page.reload();
    await expectPressed(page, []);
    await expect(topicCard(page)).toBeVisible();
  });

  test("the chips are reached and pressed with the keyboard alone", async ({ page }) => {
    await page.goto("/library");

    await chip(page, "BA").focus();
    await page.keyboard.press("Enter");
    await expect(chip(page, "BA")).toHaveAttribute("aria-pressed", "true");
    await expect(emptyState(page)).toBeVisible();

    await chip(page, "BA").focus();
    await page.keyboard.press("Space");
    await expect(chip(page, "BA")).toHaveAttribute("aria-pressed", "false");
    await expect(topicCard(page)).toBeVisible();
  });
});

test.describe("Màn 2: before the page's scripts have loaded", () => {
  test("a chip is a form button: it filters, the choice is kept, and 'Xem mọi chủ đề' restores", async ({ page, context }) => {
    // The scripts that make the page interactive never arrive; what the server sent is all there is.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/library");
    await expect(heading(page)).toBeVisible();
    await expect(topicCard(page)).toBeVisible();
    await expect(createTile(page).getByRole("link", { name: "Tạo chủ đề của bạn" })).toHaveAttribute("href", "/custom-topic");

    await chip(page, "BA").click();
    await expect(chip(page, "BA")).toHaveAttribute("aria-pressed", "true");
    await expect(emptyState(page)).toContainText(EMPTY);
    expect((await roleCookie(context))?.value).toBe("ba");

    await page.goto("/library");
    await expect(chip(page, "BA")).toHaveAttribute("aria-pressed", "true");
    await expect(emptyState(page)).toBeVisible();

    await emptyState(page).getByRole("button", { name: "Xem mọi chủ đề" }).click();
    await expect(topicCard(page)).toBeVisible();
    await expectPressed(page, []);
    expect(await roleCookie(context)).toBeUndefined();
  });
});

test.describe("Màn 2: the role filter of a learner", () => {
  test("is stored on the account with one event per press, and follows the learner to another browser", async ({ page, context, browser }) => {
    const { userId, email } = await signInAndAccept(page, context, "lib-filter", "/library");
    await expect(heading(page)).toBeVisible();
    expect((await db.user(userId)).roleFilter).toBeNull();

    await press(page, "PM", "true");
    await expect(emptyState(page)).toBeVisible();
    expect((await db.user(userId)).roleFilter).toBe("pm");
    // The account alone remembers: this browser keeps no copy.
    expect(await roleCookie(context)).toBeUndefined();
    await press(page, "UX", "true");
    expect((await db.user(userId)).roleFilter).toBe("ux");
    await press(page, "UX", "false");
    expect((await db.user(userId)).roleFilter).toBeNull();
    await press(page, "BA", "true");

    const written = (await db.eventsOfUser(userId)).filter((event) => event.name === "role_filter_selected").sort((a, b) => a.at.getTime() - b.at.getTime());
    expect(written.map((event) => [event.sessionId, event.props])).toEqual([
      [null, { role: "pm" }],
      [null, { role: "ux" }],
      [null, { role: null }],
      [null, { role: "ba" }],
    ]);

    // Another browser of the same learner: no cookie there, the account remembers.
    const other = await browser.newContext();
    try {
      await signIn(other, email);
      const otherPage = await other.newPage();
      await otherPage.goto("/library");
      await expectPressed(otherPage, ["BA"]);
      await expect(emptyState(otherPage)).toBeVisible();

      // A cookie in the browser of a learner counts for nothing: the account is the only source.
      await other.addCookies([{ name: ROLE_COOKIE, value: "ux", url: APP_URL }]);
      await otherPage.reload();
      await expectPressed(otherPage, ["BA"]);

      // Cleared in the first browser, it is cleared in the other, whatever cookie that one holds.
      await press(page, "BA", "false");
      await otherPage.reload();
      await expectPressed(otherPage, []);
      await expect(topicCard(otherPage)).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test("a choice made as a guest moves onto the account when the learner signs in and accepts the notice", async ({ page, context }) => {
    await page.goto("/library");
    await press(page, "Khác", "true");
    expect((await roleCookie(context))?.value).toBe("other");

    const { userId } = await signInAndAccept(page, context, "lib-guest-then-learner", "/library");
    await expectPressed(page, ["Khác"]);
    await expect(page.getByText(OTHER_NOTE)).toBeVisible();
    // The account holds it now and the browser no longer does. Carrying it over is not a press: no event.
    expect((await db.user(userId)).roleFilter).toBe("other");
    expect(await roleCookie(context)).toBeUndefined();
    expect((await db.eventsOfUser(userId)).filter((event) => event.name === "role_filter_selected")).toEqual([]);
  });

  test("a cookie with a value outside the four chips is dropped at the notice and changes nothing", async ({ page, context }) => {
    await context.addCookies([{ name: ROLE_COOKIE, value: "admin", url: APP_URL }]);

    const { userId } = await signInAndAccept(page, context, "lib-bad-cookie", "/library");

    await expectPressed(page, []);
    expect((await db.user(userId)).roleFilter).toBeNull();
    expect(await roleCookie(context)).toBeUndefined();
  });

  test("signing out leaves no filter behind in the browser", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("lib-sign-out"));
    await page.goto("/library");
    await press(page, "BA", "true");
    expect((await roleCookie(context))?.value).toBe("ba");

    await page.getByLabel("Tài khoản: mở menu").click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    expect(await roleCookie(context)).toBeUndefined();
    await page.goto("/library");
    await expectPressed(page, []);
    await expect(topicCard(page)).toBeVisible();
  });

  test("a learner who has not accepted the data notice is remembered by the browser only", async ({ page, context }) => {
    const userId = await signInAsNewLearner(context, uniqueEmail("lib-no-notice"));
    await page.goto("/library");
    await expect(heading(page)).toBeVisible();

    await press(page, "BA", "true");
    await expect(emptyState(page)).toBeVisible();

    expect((await roleCookie(context))?.value).toBe("ba");
    expect((await db.user(userId)).roleFilter).toBeNull();
    expect(await db.eventsOfUser(userId)).toEqual([]);
  });
});

test.describe("Màn 2: a learner's progress", () => {
  test("the topic says 'Đã luyện 0/1' until a session is done, then 'Đã luyện 1/1'", async ({ page, context }) => {
    await signInAndAccept(page, context, "lib-progress", "/library");
    await expect(topicCard(page).locator(".tcard-done")).toHaveText("Đã luyện 0/1");
    await expect(topicCard(page).locator(".tfoot")).toHaveText("1 persona");
    await context.clearCookies();

    const { sessionId } = await endedInterview(page, context, "lib-progress-done", PLAIN_QUESTIONS, "");
    // A session that is not finished does not count.
    await page.goto("/library");
    await expect(topicCard(page).locator(".tcard-done")).toHaveText("Đã luyện 0/1");

    await page.goto(`/sessions/${sessionId}`);
    await guess(page, 0);
    await expectResult(page, 0, 0);
    expect((await db.session(sessionId)).status).toBe("done");

    await page.goto("/library");
    await expect(topicCard(page).locator(".tcard-done")).toHaveText("Đã luyện 1/1");
    await expect(topicCard(page).locator(".bar > i")).toHaveAttribute("style", /width:\s*100%/u);
    // A curated session is no topic of the learner's own.
    await expect(page.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);
  });

  test("a withdrawn session does not count, and another learner's sessions are theirs alone", async ({ page, context, browser }) => {
    const { sessionId } = await startInterview(page, context, "lib-withdrawn");
    await db.setSessionStatus(sessionId, "done");
    await page.goto("/library");
    await expect(topicCard(page).locator(".tcard-done")).toHaveText("Đã luyện 1/1");

    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();
    await expect(topicCard(page).locator(".tcard-done")).toHaveText("Đã luyện 0/1");

    await db.setSessionStatus(sessionId, "done");
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await signInAndAccept(otherPage, other, "lib-other-learner", "/library");
      await expect(topicCard(otherPage).locator(".tcard-done")).toHaveText("Đã luyện 0/1");
    } finally {
      await other.close();
    }
  });
});

test.describe("Màn 2: Chủ đề bạn tự tạo", () => {
  test("lists the learner's own topics newest first, each under 'Kiểm tra nhẹ' with its state, and opens the right screen", async ({ page, context, browser }) => {
    test.setTimeout(180_000);
    await signInAndAccept(page, context, "lib-own", "/library");
    await expect(page.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);

    // One that does not pass: typed text is shown as text.
    const failedTopic = "<b>đậm</b> app đặt lịch cắt tóc ở tiệm nhỏ [stub:invalid]";
    const failedId = await requestTopic(page, failedTopic);
    await expect(page.getByRole("heading", { level: 1, name: "Kịch bản này chưa qua kiểm tra nên chúng tôi không cho bạn luyện với nó." })).toBeVisible({ timeout: 60_000 });

    // One that is still being prepared.
    const preparingTopic = "app gọi xe ôm trong ngõ nhỏ [stub:slow-gen]";
    const preparingId = await requestTopic(page, preparingTopic);

    await page.goto("/library");
    const own = ownSection(page);
    await expect(own.getByRole("heading", { level: 2 })).toHaveText("Chủ đề bạn tự tạo");
    await expect(own.locator(".lib-own-head > span")).toHaveText("2 chủ đề");
    const cards = own.locator("a.tcard");
    await expect(cards).toHaveCount(2);

    const preparing = cards.nth(0);
    await expect(preparing).toHaveAttribute("href", `/sessions/${preparingId}`);
    await expect(preparing.getByRole("heading", { level: 3 })).toHaveText(preparingTopic);
    await expect(preparing.locator(".pill")).toHaveText("Kiểm tra nhẹ");
    await expect(preparing.locator(".tfoot")).toHaveText("Đang chuẩn bị");
    await expect(preparing.locator(".tbody .code")).toHaveText(/^tạo \d{2}\/\d{2} · \d{2}:\d{2}$/u);
    await expect(preparing.locator(".tcard-done")).toHaveCount(0);

    const failed = cards.nth(1);
    await expect(failed).toHaveAttribute("href", `/sessions/${failedId}`);
    await expect(failed.getByRole("heading", { level: 3 })).toHaveText(failedTopic);
    await expect(failed.locator("h3 b")).toHaveCount(0);
    await expect(failed.locator(".tfoot")).toHaveText("Chưa qua kiểm tra");
    await expect(failed.getByText("Kiểm tra nhẹ", { exact: true })).toBeVisible();

    // The role filter does not reach this section, and the curated count is the grid's alone.
    await press(page, "BA", "true");
    await expect(emptyState(page)).toBeVisible();
    await expect(shownCount(page)).toHaveText("0 chủ đề");
    await expect(ownSection(page).locator("a.tcard")).toHaveCount(2);
    await emptyState(page).getByRole("button", { name: "Xem mọi chủ đề" }).click();
    await expect(topicCard(page)).toBeVisible();

    // Nobody else sees them.
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto("/library");
      await expect(heading(guestPage)).toBeVisible();
      await expect(guestPage.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);
      expect(await guestPage.content()).not.toContain("gọi xe ôm");
      await signInAndAccept(guestPage, guest, "lib-own-stranger", "/library");
      await expect(heading(guestPage)).toBeVisible();
      await expect(guestPage.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);
    } finally {
      await guest.close();
    }

    // A card of a topic with nothing to play opens Màn 11.
    await ownSection(page).locator(`a[href="/sessions/${failedId}"]`).click();
    await expect(page).toHaveURL(`/sessions/${failedId}`);
    await expect(page).toHaveTitle("Chưa qua kiểm tra · InterviewLab");
    await page.goBack();
    await ownSection(page).locator(`a[href="/sessions/${preparingId}"]`).click();
    await expect(page).toHaveURL(`/sessions/${preparingId}`);

    // Once the scenario passed, the card is a topic like the curated ones and leads to its own page.
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    const [attempt] = await db.attemptsOf((await db.session(preparingId)).userId);
    expect(attempt.sessionId).toBe(preparingId);
    await page.goto("/library");
    const ready = ownSection(page).locator("a.tcard").nth(0);
    await expect(ready).toHaveAttribute("href", `/topics/${attempt.topicId}`);
    await expect(ready.locator(".tfoot")).toHaveText("1 persona");
    await expect(ready.locator(".tcard-done")).toHaveText("Đã luyện 0/1");
    await expect(ready.getByText("Kiểm tra nhẹ", { exact: true })).toBeVisible();

    // Nothing of the generated scenario's items is on the page either.
    const generated = await db.scenarioById(attempt.scenarioId!);
    expect(findSealed(await page.content(), generated.content)).toEqual([]);
  });

  test("a topic that was taken down leaves the library", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signInAndAccept(page, context, "lib-own-taken-down", "/library");
    const sessionId = await requestTopic(page, "app chia tiền nhà trọ với bạn cùng phòng");
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    await page.goto("/library");
    await expect(ownSection(page).locator("a.tcard")).toHaveCount(1);

    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();

    await expect(heading(page)).toBeVisible();
    await expect(page.getByText("Chủ đề bạn tự tạo")).toHaveCount(0);
  });
});

test.describe("Màn 2: the publish gate", () => {
  test.afterEach(() => db.clearConfig());

  test("with the gate on and nothing published, no topic is listed and the way to one's own stays", async ({ page }) => {
    await db.requirePublished();
    await page.goto("/library");

    await expect(heading(page)).toBeVisible();
    await expect(topicCard(page)).toHaveCount(0);
    await expect(shownCount(page)).toHaveText("0 chủ đề");
    // No chip is chosen, so this is not the empty state of a role.
    await expect(emptyState(page)).toHaveCount(0);
    await expect(createTile(page)).toBeVisible();

    await press(page, "UX", "true");
    await expect(emptyState(page)).toContainText(EMPTY);
  });
});

test.describe("Màn 2: loading, errors and the security policy", () => {
  test("a failure on the server shows the standard error, and 'Thử lại' loads the library", async ({ page, context }) => {
    await context.addCookies([{ name: "il_test_fault", value: "page", url: APP_URL }]);
    const response = await page.goto("/library");

    expect(response?.status()).toBe(500);
    await expect(page.getByRole("alert").filter({ hasText: "Không kết nối được." })).toBeVisible();
    await expect(heading(page)).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "InterviewLab, về trang chủ" })).toBeVisible();

    await context.clearCookies({ name: "il_test_fault" });
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(heading(page)).toBeVisible();
    await expect(topicCard(page)).toBeVisible();
  });

  test("the page and its form break nothing of the Content-Security-Policy, and carry the security headers", async ({ page, context }) => {
    const violations: string[] = [];
    await context.exposeBinding("__cspViolation", (_source, violation: string) => void violations.push(violation));
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        void (window as unknown as { __cspViolation: (violation: string) => Promise<void> }).__cspViolation(`${event.violatedDirective} ${event.blockedURI} on ${location.pathname}`);
      });
    });
    const refused: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/u.test(message.text())) refused.push(message.text());
    });

    const response = await page.goto("/library");
    expect(response?.headers()["content-security-policy"]).toContain("form-action 'self'");
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    await press(page, "BA", "true");
    await emptyState(page).getByRole("button", { name: "Xem mọi chủ đề" }).click();
    await expect(topicCard(page)).toBeVisible();
    await press(page, "Khác", "true");
    await page.evaluate(() => document.fonts.ready);

    expect(violations).toEqual([]);
    expect(refused).toEqual([]);
  });
});

test.describe("Màn 2: layout", () => {
  test("1280px: three columns, the create tile across them, the card not stretched over the row", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/library");
    await expect(topicCard(page)).toBeVisible();
    await expectNoHorizontalScroll(page);

    const grid = (await page.locator(".lib-grid").boundingBox())!;
    const tile = (await createTile(page).boundingBox())!;
    const card = (await topicCard(page).boundingBox())!;
    expect(Math.round(tile.width)).toBe(Math.round(grid.width));
    // One topic takes one of three columns, under the tile, aligned with its left edge.
    expect(card.width).toBeLessThan(grid.width / 3);
    expect(card.width).toBeGreaterThan(grid.width / 4);
    expect(card.y).toBeGreaterThanOrEqual(tile.y + tile.height);
    expect(Math.round(card.x)).toBe(Math.round(grid.x));
    await page.screenshot({ path: testInfo.outputPath("library-1280.png"), fullPage: true });

    await press(page, "BA", "true");
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: testInfo.outputPath("library-1280-empty.png"), fullPage: true });
  });

  test.describe("390px", () => {
    test.use({ viewport: { width: 390, height: 780 } });

    test("one column, chips wrap inside the screen and are large enough to press", async ({ page }, testInfo) => {
      await page.goto("/library");
      await expect(topicCard(page)).toBeVisible();
      await expectNoHorizontalScroll(page);

      const grid = (await page.locator(".lib-grid").boundingBox())!;
      const card = (await topicCard(page).boundingBox())!;
      expect(Math.round(card.width)).toBe(Math.round(grid.width));
      for (const name of ["UX", "BA", "PM", "Khác"] as const) {
        const box = (await chip(page, name).boundingBox())!;
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, name).toBeLessThanOrEqual(390);
      }
      const create = createTile(page).getByRole("link", { name: "Tạo chủ đề của bạn" });
      await expect(create).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath("library-390.png"), fullPage: true });

      await press(page, "Khác", "true");
      await expectNoHorizontalScroll(page);
      await press(page, "PM", "true");
      await expect(emptyState(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath("library-390-empty.png"), fullPage: true });
    });

    test("a long topic of the learner's own wraps inside its card", async ({ page, context }) => {
      test.setTimeout(120_000);
      await signInAndAccept(page, context, "lib-narrow-own", "/library");
      await requestTopic(page, `chủ đề không có khoảng trắng ${"b".repeat(200)} [stub:invalid]`);
      await page.goto("/library");
      await expect(ownSection(page).locator("a.tcard")).toHaveCount(1);
      await expectNoHorizontalScroll(page);
    });
  });
});
