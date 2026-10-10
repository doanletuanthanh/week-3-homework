import { expect, test, type Page } from "@playwright/test";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { ensureAccount, signIn, signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { DEMO_EMAIL } from "./helpers/stack";

const TOPIC_ID = "ux-chi-tieu";
const TOPIC_PATH = `/topics/${TOPIC_ID}`;
const TOPIC_TITLE = "Chi tiêu hằng ngày của người trẻ đi làm";
const WARNING =
  "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn.";
const GENERATED_LINE = "Kịch bản do AI sinh, chỉ qua kiểm tra nhẹ. Mọi chi tiết là hư cấu.";
const SESSION_URL = /\/sessions\/[0-9a-f-]{36}$/u;

const heading = (page: Page, title: string = TOPIC_TITLE) => page.getByRole("heading", { level: 1, name: title });
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Đường dẫn" });
const cards = (page: Page) => page.locator("article.pcard");
/** The one card of chị Thu's topic. */
const card = (page: Page) => cards(page).first();
const ribbon = (page: Page) => card(page).locator(".ribbon");
const mainLink = (page: Page) => card(page).locator(".actionbar a");
const practised = (page: Page) => page.locator(".topic-done");
const openedEvents = (userId: string) => db.eventsOfUser(userId).then((rows) => rows.filter((event) => event.name === "topic_opened"));
const allOpenedEvents = () => db.eventsNamed("topic_opened");

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

/** Starts a session with chị Thu from Màn 3, as a learner does, and returns its id. */
async function startFromPrep(page: Page) {
  await page.goto("/prep/chi-thu");
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
  return page.url().split("/").pop()!;
}

/** Asks for a custom topic and waits until its scenario passed: the page is then on its Màn 3. */
async function ownPlayableTopic(page: Page, userId: string, topic: string) {
  await page.goto("/custom-topic");
  await page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?").fill(topic);
  await page.getByRole("button", { name: "Tạo kịch bản" }).click();
  await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
  const [attempt] = await db.attemptsOf(userId);
  return { topicId: attempt.topicId!, sessionId: attempt.sessionId!, personaId: page.url().split("/").pop()! };
}

/** The demo account, signed in, with the notice accepted, on chị Thu's topic. */
async function signInAsDemo(page: Page) {
  const id = await ensureAccount(DEMO_EMAIL);
  await signIn(page.context(), DEMO_EMAIL);
  await page.goto(`/data-notice?next=${TOPIC_PATH}`);
  const agree = page.getByRole("button", { name: "Tôi hiểu" });
  await expect(agree.or(heading(page))).toBeVisible();
  if (await agree.isVisible()) await agree.click();
  await expect(heading(page)).toBeVisible();
  return id;
}

test.describe("Màn 2b: a guest reads a topic", () => {
  test("answers 200 without sign-in and shows the topic, the warning and the persona's card", async ({ page }) => {
    const response = await page.goto(TOPIC_PATH);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(TOPIC_PATH);
    await expect(page).toHaveTitle("Chủ đề · InterviewLab");
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    // Where the learner is: the library, then this topic.
    await expect(crumbs(page).getByRole("link", { name: "Thư viện" })).toHaveAttribute("href", "/library");
    await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText(TOPIC_TITLE);

    // The head: the role in words, how many personas, one sentence.
    await expect(page.locator(".topic-pills .pill")).toHaveText(["UX", "1 persona"]);
    await expect(page.locator(".topic-what p")).not.toBeEmpty();
    await expect(page.getByText(GENERATED_LINE)).toHaveCount(0);
    await expect(page.getByText("Kiểm tra nhẹ")).toHaveCount(0);

    // The overlap warning, word for word.
    await expect(page.getByRole("note")).toHaveText(WARNING);

    // The persona's card.
    await expect(cards(page)).toHaveCount(1);
    await expect(ribbon(page)).toHaveText("Sẵn sàng");
    await expect(card(page).getByRole("heading", { level: 2 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(card(page).locator(".pcard-who p")).toHaveText("Kế toán ở một công ty logistics");
    await expect(card(page).locator(".ctx")).toHaveText("Câu hỏi nghiên cứuVì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?");
    await expect(card(page).locator(".pcard-seal")).toHaveText("Niêm phongĐang giữ 11 điều chưa nói");
    // chị Thu has an illustration: no initial stands in for her.
    await expect(card(page).locator("svg.avatar path").first()).toBeAttached();
    await expect(card(page).locator("svg.avatar text")).toHaveCount(0);

    // One button, a link to Màn 3. A guest has no progress, and cannot start a session from here.
    await expect(mainLink(page)).toHaveText("Bắt đầu");
    await expect(mainLink(page)).toHaveAttribute("href", "/prep/chi-thu");
    await expect(card(page).locator("form")).toHaveCount(0);
    await expect(page.getByText("Bạn đã luyện")).toHaveCount(0);
  });

  test("goes from the library to the topic, to the persona's prep screen, and back along the breadcrumb", async ({ page }) => {
    await page.goto("/library");
    await page.locator(`a.tcard[href="${TOPIC_PATH}"]`).click();
    await expect(page).toHaveURL(TOPIC_PATH);
    await expect(heading(page)).toBeVisible();

    await mainLink(page).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(page.getByText("Đăng nhập Google khi bắt đầu")).toBeVisible();

    // Màn 3: Thư viện › the topic, linked › the persona.
    await expect(crumbs(page).getByRole("link")).toHaveText(["Thư viện", TOPIC_TITLE]);
    await expect(crumbs(page).getByRole("link", { name: "Thư viện" })).toHaveAttribute("href", "/library");
    await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText("Chị Thu");
    await expect(crumbs(page).getByText("Trang chủ")).toHaveCount(0);

    await crumbs(page).getByRole("link", { name: TOPIC_TITLE }).click();
    await expect(page).toHaveURL(TOPIC_PATH);
    await crumbs(page).getByRole("link", { name: "Thư viện" }).click();
    await expect(page).toHaveURL("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Chọn một chủ đề để luyện" })).toBeVisible();
  });

  test("nothing of any item is sent: neither the page nor its data for a client navigation", async ({ page }) => {
    const scenario = readChiThu();
    /** The answer is the topic, read whole, and holds nothing sealed: an empty body would prove nothing. */
    const expectClean = (body: string) => {
      expect(body).toContain("Đang giữ");
      expect(body).toContain("Chị Thu, 26 tuổi");
      expect(findSealed(body, scenario)).toEqual([]);
      for (const key of ["sample_question", "hook_line", "topic_tag", "secret_terms", "do_not_assert", "surface_facts"]) expect(body, key).not.toContain(key);
    };

    await page.goto(TOPIC_PATH);
    await expect(card(page)).toBeVisible();
    expectClean(await page.content());
    expectClean(await (await page.request.get(TOPIC_PATH)).text());
    expectClean(await (await page.request.get(TOPIC_PATH, { headers: { RSC: "1" } })).text());
  });

  test("a guest's visit writes no event", async ({ page }) => {
    const before = (await allOpenedEvents()).length;

    await page.goto("/library");
    await page.locator(`a.tcard[href="${TOPIC_PATH}"]`).click();
    await expect(card(page)).toBeVisible();
    await page.reload();
    await expect(card(page)).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(await allOpenedEvents()).toHaveLength(before);
  });

  test("fits a phone: one column, the button as wide as the card, no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TOPIC_PATH);
    await expect(card(page)).toBeVisible();

    await expectNoHorizontalScroll(page);
    const box = (await card(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(340);
    const button = (await mainLink(page).boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThan(box.width - 60);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Màn 2b: a topic that is not there", () => {
  test("an unknown topic answers 404 with the way back to the library", async ({ page }) => {
    const response = await page.goto("/topics/khong-co");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy chủ đề này." })).toBeVisible();
    await page.getByRole("link", { name: "Về thư viện" }).click();
    await expect(page).toHaveURL("/library");
  });

  test("an id of any shape is not found, without an error page", async ({ page }) => {
    for (const id of ["x".repeat(3000), "%27%20OR%201=1--", "..%2F..%2Fprep%2Fchi-thu", "ux-chi-tieu%00", "UX-CHI-TIEU"]) {
      const response = await page.goto(`/topics/${id}`);
      expect(response?.status(), id).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy chủ đề này." })).toBeVisible();
    }
  });

  test("a topic with no persona a session can start on says so and leads back to the library", async ({ page }) => {
    // The publish gate is on and chị Thu is a draft: her topic has nothing to play.
    await db.requirePublished();
    try {
      const response = await page.goto(TOPIC_PATH);

      expect(response?.status()).toBe(200);
      await expect(heading(page)).toBeVisible();
      await expect(page.locator(".topic-pills .pill")).toHaveText(["UX", "0 persona"]);
      await expect(page.getByRole("heading", { level: 2, name: "Chủ đề này đang được cập nhật." })).toBeVisible();
      await expect(cards(page)).toHaveCount(0);
      await expect(page.getByRole("note")).toHaveCount(0);
      await expect(page.getByText("Chị Thu")).toHaveCount(0);
      await page.locator(".lib-empty").getByRole("link", { name: "Về thư viện" }).click();
      await expect(page).toHaveURL("/library");
    } finally {
      await db.clearConfig();
    }
  });
});

test.describe("Màn 2b: the card follows the learner's session (PRD §7)", () => {
  test("no session, then each state of one: the label, the button and where it leads", async ({ page, context }) => {
    await signInAndAccept(page, context, "topic-states", TOPIC_PATH);

    // No session yet.
    await expect(ribbon(page)).toHaveText("Sẵn sàng");
    await expect(mainLink(page)).toHaveText("Bắt đầu");
    await expect(mainLink(page)).toHaveAttribute("href", "/prep/chi-thu");
    await expect(practised(page)).toHaveText("Bạn đã luyện 0/1");
    await expect(card(page).locator("form")).toHaveCount(0);
    await expect(page.getByText("Bắt đầu buổi mới")).toHaveCount(0);

    // A session exists: in progress, whatever it is in the middle of.
    const sessionId = await startFromPrep(page);
    for (const status of ["interviewing", "revealed", "replaying"] as const) {
      await db.setSessionStatus(sessionId, status);
      await page.goto(TOPIC_PATH);
      await expect(ribbon(page), status).toHaveText("Đang làm dở");
      await expect(mainLink(page), status).toHaveText("Tiếp tục buổi luyện");
      await expect(mainLink(page), status).toHaveAttribute("href", `/sessions/${sessionId}`);
      await expect(practised(page), status).toHaveText("Bạn đã luyện 0/1");
    }

    // The button opens the session on the screen of its state.
    await db.setSessionStatus(sessionId, "interviewing");
    await page.goto(TOPIC_PATH);
    await mainLink(page).click();
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await expect(page.getByLabel("Câu hỏi của bạn")).toBeVisible();

    // Finished: the day it started, and the way to the result.
    await db.setSessionStatus(sessionId, "done");
    const started = (await db.session(sessionId)).startedAt;
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(started);
    await page.goto(TOPIC_PATH);
    await expect(ribbon(page)).toHaveText(`Đã luyện · ${day}`);
    await expect(mainLink(page)).toHaveText("Xem lại kết quả");
    await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${sessionId}`);
    await expect(practised(page)).toHaveText("Bạn đã luyện 1/1");

    // Withdrawn: it does not count, the learner may start again.
    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();
    await expect(ribbon(page)).toHaveText("Sẵn sàng");
    await expect(mainLink(page)).toHaveText("Bắt đầu");
    await expect(mainLink(page)).toHaveAttribute("href", "/prep/chi-thu");
    await expect(practised(page)).toHaveText("Bạn đã luyện 0/1");
  });

  test("a session with no question yet opens on Màn 3 from the card, in a browser that never pressed 'Bắt đầu'", async ({ page, context, browser }) => {
    const { email } = await signInAndAccept(page, context, "topic-not-asked", TOPIC_PATH);
    const sessionId = await startFromPrep(page);

    const other = await browser.newContext();
    try {
      await signIn(other, email);
      const otherPage = await other.newPage();
      await otherPage.goto(TOPIC_PATH);
      await expect(mainLink(otherPage)).toHaveText("Tiếp tục buổi luyện");
      await mainLink(otherPage).click();
      // The session's URL leads to Màn 3 while nothing was asked: its button leads into the interview.
      await expect(otherPage).toHaveURL("/prep/chi-thu");
      await expect(otherPage.getByRole("heading", { level: 1 })).toHaveText("Chị Thu, 26 tuổi");
      await otherPage.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
      await expect(otherPage).toHaveURL(`/sessions/${sessionId}`);
      await expect(otherPage.getByLabel("Câu hỏi của bạn")).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test("the card is up to date when the learner comes back to it with the browser's back button", async ({ page, context }) => {
    await signInAndAccept(page, context, "topic-back", TOPIC_PATH);
    await expect(ribbon(page)).toHaveText("Sẵn sàng");

    await mainLink(page).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await expect(page).toHaveURL(SESSION_URL);
    const sessionId = page.url().split("/").pop()!;

    await page.goto(TOPIC_PATH);
    await expect(ribbon(page)).toHaveText("Đang làm dở");
    await mainLink(page).click();
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await db.setSessionStatus(sessionId, "done");
    await page.goBack();
    await expect(page).toHaveURL(TOPIC_PATH);
    await expect(mainLink(page)).toHaveText("Xem lại kết quả");
    await expect(practised(page)).toHaveText("Bạn đã luyện 1/1");
  });

  test("another learner's session changes nothing on this learner's card", async ({ page, context, browser }) => {
    await signInAndAccept(page, context, "topic-owner", TOPIC_PATH);
    const sessionId = await startFromPrep(page);
    await db.setSessionStatus(sessionId, "done");

    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await signInAndAccept(otherPage, other, "topic-other", TOPIC_PATH);
      await expect(ribbon(otherPage)).toHaveText("Sẵn sàng");
      await expect(mainLink(otherPage)).toHaveAttribute("href", "/prep/chi-thu");
      await expect(practised(otherPage)).toHaveText("Bạn đã luyện 0/1");
      expect(await otherPage.content()).not.toContain(sessionId);
    } finally {
      await other.close();
    }
  });
});

test.describe("Màn 2b: the event of an opened topic (signed-in learners only)", () => {
  test("one event each time the page is shown: arriving from the library, reloading, coming back", async ({ page, context }) => {
    const { userId } = await signInAndAccept(page, context, "topic-opened", "/library");
    const link = page.locator(`a.tcard[href="${TOPIC_PATH}"]`);
    await expect(link).toBeVisible();
    // The link is on screen and hovered: whatever the browser fetches ahead of the click is not a visit.
    await link.hover();
    await page.waitForLoadState("networkidle");
    expect(await openedEvents(userId)).toEqual([]);

    await link.click();
    await expect(card(page)).toBeVisible();
    await expect.poll(async () => (await openedEvents(userId)).length).toBe(1);
    // The page asks the server for itself again once shown: that is not a second visit.
    await page.waitForLoadState("networkidle");
    expect(await openedEvents(userId)).toHaveLength(1);
    expect((await openedEvents(userId))[0]).toMatchObject({ userId, sessionId: null, props: { topic_id: TOPIC_ID, kind: "curated" } });

    await page.reload();
    await expect(card(page)).toBeVisible();
    await expect.poll(async () => (await openedEvents(userId)).length).toBe(2);

    await mainLink(page).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await crumbs(page).getByRole("link", { name: TOPIC_TITLE }).click();
    await expect(card(page)).toBeVisible();
    await expect.poll(async () => (await openedEvents(userId)).length).toBe(3);
    await page.waitForLoadState("networkidle");
    expect(await openedEvents(userId)).toHaveLength(3);

    // And with the browser's back button: shown again, counted once more.
    await mainLink(page).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await page.goBack();
    await expect(page).toHaveURL(TOPIC_PATH);
    await expect(card(page)).toBeVisible();
    await expect.poll(async () => (await openedEvents(userId)).length).toBe(4);
    await page.waitForLoadState("networkidle");
    expect(await openedEvents(userId)).toHaveLength(4);
  });

  test("a learner who has not accepted the data notice writes none, and reads the page all the same", async ({ page, context }) => {
    const userId = await signInAsNewLearner(context, uniqueEmail("topic-no-notice"));

    await page.goto(TOPIC_PATH);
    await expect(card(page)).toBeVisible();
    await expect(mainLink(page)).toHaveText("Bắt đầu");
    await page.waitForLoadState("networkidle");

    expect(await openedEvents(userId)).toEqual([]);
  });

  test("a page that is not found writes none", async ({ page, context }) => {
    const { userId } = await signInAndAccept(page, context, "topic-opened-missing", "/library");

    expect((await page.goto("/topics/khong-co"))?.status()).toBe(404);
    await page.waitForLoadState("networkidle");

    expect(await openedEvents(userId)).toEqual([]);
  });
});

test.describe("Màn 2b: a demo account (FR-45)", () => {
  test("every card also starts one more session, and the main button opens the newest", async ({ page }) => {
    const demoId = await signInAsDemo(page);
    const newest = async () => (await db.sessionsOf(demoId)).filter((session) => session.status !== "withdrawn").sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    const another = card(page).getByRole("button", { name: "Bắt đầu buổi mới" });

    // Whatever the account already has, the extra button is there beside the main one.
    await expect(another).toBeVisible();
    await expect(mainLink(page)).toHaveCount(1);
    const before = await newest();
    if (before) await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${before.id}`);
    else await expect(mainLink(page)).toHaveAttribute("href", "/prep/chi-thu");

    // It starts a session at once and leads into it.
    await another.click();
    await expect(page).toHaveURL(SESSION_URL);
    const firstId = page.url().split("/").pop()!;
    expect(firstId).not.toBe(before?.id);
    expect(await db.session(firstId)).toMatchObject({ userId: demoId, personaId: "chi-thu", status: "interviewing" });

    // The card now speaks for that session, and still offers one more.
    await page.goto(TOPIC_PATH);
    await expect(ribbon(page)).toHaveText("Đang làm dở");
    await expect(mainLink(page)).toHaveText("Tiếp tục buổi luyện");
    await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${firstId}`);
    await expect(another).toBeVisible();

    // Finished: "Xem lại kết quả", and one more can still be started.
    await db.setSessionStatus(firstId, "done");
    await page.reload();
    await expect(mainLink(page)).toHaveText("Xem lại kết quả");
    await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${firstId}`);
    await another.click();
    await expect(page).toHaveURL(SESSION_URL);
    const secondId = page.url().split("/").pop()!;
    expect(secondId).not.toBe(firstId);

    // The newest one is what the main button opens; the finished one is still in the list.
    await page.goto(TOPIC_PATH);
    await expect(mainLink(page)).toHaveText("Tiếp tục buổi luyện");
    await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${secondId}`);
    expect((await newest())!.id).toBe(secondId);
    // Practised all the same, as the library says: a finished session exists.
    await expect(practised(page)).toHaveText("Bạn đã luyện 1/1");
    await page.goto("/library");
    await expect(page.locator(`a.tcard[href="${TOPIC_PATH}"] .tcard-done`)).toHaveText("Đã luyện 1/1");
    await page.goto(TOPIC_PATH);
    await expect(card(page)).toBeVisible();

    // A demo account is left out of every metric.
    await page.waitForLoadState("networkidle");
    expect(await openedEvents(demoId)).toEqual([]);
  });
});

test.describe("Màn 2b: a topic the learner made", () => {
  test("carries the line about a generated scenario, no role, and its one persona under its initial", async ({ page, context }) => {
    test.setTimeout(120_000);
    const topic = "app đặt lịch khám răng cho phòng khám nhỏ";
    const { userId } = await signInAndAccept(page, context, "topic-custom", "/custom-topic");
    const own = await ownPlayableTopic(page, userId, topic);

    // Màn 3 of a generated persona keeps its own way back, and shows the initial.
    await expect(crumbs(page).getByRole("link")).toHaveText(["Buổi của tôi"]);
    await expect(crumbs(page)).toContainText(topic);
    await expect(page.locator(".prep-who svg.avatar text")).toHaveText("M");

    const response = await page.goto(`/topics/${own.topicId}`);
    expect(response?.status()).toBe(200);
    await expect(heading(page, topic)).toBeVisible();
    await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText(topic);
    await expect(page.locator(".topic-pills .pill")).toHaveText(["Kiểm tra nhẹ", "1 persona"]);
    await expect(page.locator(".topic-what").getByText(GENERATED_LINE)).toBeVisible();
    await expect(page.getByRole("note")).toHaveText(WARNING);
    await expect(practised(page)).toHaveText("Bạn đã luyện 0/1");

    // Its persona: no illustration, so the initial of the given name; the session it was made with is in progress.
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page).getByRole("heading", { level: 2 })).toHaveText("Chị Mai, 27 tuổi");
    await expect(card(page).locator("svg.avatar text")).toHaveText("M");
    await expect(card(page).locator("svg.avatar path")).toHaveCount(0);
    await expect(ribbon(page)).toHaveText("Đang làm dở");
    await expect(mainLink(page)).toHaveText("Tiếp tục buổi luyện");
    await expect(mainLink(page)).toHaveAttribute("href", `/sessions/${own.sessionId}`);

    // Nothing of the generated scenario's items is on the page.
    const generated = await db.scenarioOf(own.personaId);
    expect(findSealed(await page.content(), generated.content)).toEqual([]);

    // One event, naming the topic as the learner's own.
    await expect.poll(async () => (await openedEvents(userId)).map((event) => event.props)).toEqual([{ topic_id: own.topicId, kind: "custom" }]);

    // The library's card of this topic leads here.
    await page.goto("/library");
    await page.locator(`a.tcard[href="/topics/${own.topicId}"]`).click();
    await expect(page).toHaveURL(`/topics/${own.topicId}`);
    await expect(heading(page, topic)).toBeVisible();

    // The same portrait stands for the persona in "Buổi của tôi" and above the interview.
    await page.goto("/my-sessions");
    await expect(page.locator(`a[href="/sessions/${own.sessionId}"] svg.avatar text`)).toHaveText("M");
    await mainLinkOfSession(page, own.sessionId).click();
    await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(page.locator(".sbar svg.avatar text")).toHaveText("M");

    // Taken down by an operator: nothing left to play, and the page says so.
    await db.setScenarioStatus(own.personaId, "taken_down");
    await page.goto(`/topics/${own.topicId}`);
    await expect(page.getByRole("heading", { level: 2, name: "Chủ đề này đang được cập nhật." })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test("the typed topic is shown as text", async ({ page, context }) => {
    test.setTimeout(120_000);
    const topic = '<b>đậm</b> app ghi chú <img src=x onerror="alert(1)"> cho sinh viên';
    const { userId } = await signInAndAccept(page, context, "topic-custom-escape", "/custom-topic");
    const own = await ownPlayableTopic(page, userId, topic);

    await page.goto(`/topics/${own.topicId}`);
    await expect(heading(page, topic)).toBeVisible();
    await expect(page.locator("main b, main img")).toHaveCount(0);
  });
});

test.describe("the portrait of a persona with an illustration", () => {
  test("chị Thu keeps her drawing in 'Buổi của tôi' and above the interview", async ({ page, context }) => {
    await signInAndAccept(page, context, "topic-avatar", TOPIC_PATH);
    const sessionId = await startFromPrep(page);

    await expect(page.locator(".sbar svg.avatar path").first()).toBeAttached();
    await expect(page.locator(".sbar svg.avatar text")).toHaveCount(0);
    await page.goto("/my-sessions");
    const row = page.locator(`a[href="/sessions/${sessionId}"]`);
    await expect(row.locator("svg.avatar path").first()).toBeAttached();
    await expect(row.locator("svg.avatar text")).toHaveCount(0);
  });
});

function mainLinkOfSession(page: Page, sessionId: string) {
  return page.locator(`a[href="/sessions/${sessionId}"]`);
}
