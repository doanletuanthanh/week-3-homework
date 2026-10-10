import { expect, test, type Page } from "@playwright/test";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { signInAndAccept } from "./helpers/auth";
import { db } from "./helpers/db";
import { postEnd } from "./helpers/interview";
import { CHI_TIEU, importExtraPersona, removePersonas, type ExtraPersona } from "./helpers/personas";
import { PLAIN_QUESTIONS, PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess, playQuestions } from "./helpers/reveal";

const TOPIC_PATH = "/topics/ux-chi-tieu";
const ALL_PRACTISED = "Bạn đã luyện mọi persona của vai trò này.";
const SESSION_URL = /\/sessions\/[0-9a-f-]{36}$/u;

const DAT_SAN = { id: "ux-dat-san", title: "Ứng dụng đặt sân thể thao theo giờ", summary: "Người chơi và chủ sân giữ chỗ ra sao.", role: "ux", display_order: 20 } as const;
const ANH_DUNG: ExtraPersona = { personaId: "anh-dung", displayName: "anh Dũng", name: "Anh Dũng, 29 tuổi", topic: CHI_TIEU };
const CO_LAN: ExtraPersona = { personaId: "co-lan", displayName: "cô Lan", name: "Cô Lan, 52 tuổi", topic: DAT_SAN };

const banner = (page: Page) => page.getByRole("banner");
const libraryLink = (page: Page) => banner(page).getByRole("link", { name: "Thư viện", exact: true });
const mySessionsLink = (page: Page) => banner(page).getByRole("link", { name: "Buổi của tôi", exact: true });
const hero = (page: Page) => page.locator(".hero");
const homeLibrary = (page: Page) => page.getByRole("region", { name: "Chọn một chủ đề, rồi chọn một persona" });
const closing = (page: Page) => page.getByRole("region", { name: "Không thấy chủ đề bạn cần?" });
const nextStep = (page: Page) => page.getByRole("region", { name: "Bước tiếp theo" });
/** The first card of the next step: the suggestion, or what stands in its place. */
const suggestion = (page: Page) => nextStep(page).locator(".next-card").first();

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

/** Starts a session with a persona from its Màn 3, so the learner has practised it, and comes back. */
async function practise(page: Page, personaId: string, backTo: string) {
  await page.goto(`/prep/${personaId}`);
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
  await page.goto(backTo);
}

test.describe("header: 'Thư viện' (PRD §6.0)", () => {
  test("a visitor on a wide screen: the link is there, marked on the library and inside a topic", async ({ page }) => {
    await page.goto("/");
    await expect(libraryLink(page)).toBeVisible();
    await expect(libraryLink(page)).toHaveAttribute("href", "/library");
    await expect(libraryLink(page)).not.toHaveAttribute("aria-current", "page");
    await expect(libraryLink(page)).not.toHaveClass(/\bon\b/u);
    // A visitor has no sessions to go to.
    await expect(mySessionsLink(page)).toHaveCount(0);
    await expect(banner(page).getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    await libraryLink(page).click();
    await expect(page).toHaveURL("/library");
    await expect(libraryLink(page)).toHaveAttribute("aria-current", "page");
    await expect(libraryLink(page)).toHaveClass(/\bon\b/u);

    // A topic is inside the library: marked, but the current page is the topic.
    await page.goto(TOPIC_PATH);
    await expect(libraryLink(page)).toHaveClass(/\bon\b/u);
    await expect(libraryLink(page)).not.toHaveAttribute("aria-current", "page");

    await page.goto("/prep/chi-thu");
    await expect(libraryLink(page)).not.toHaveClass(/\bon\b/u);
  });

  test("a visitor on a phone: the link stays beside 'Đăng nhập', with no menu to open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(libraryLink(page)).toBeVisible();
    await expect(banner(page).getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
    await expect(banner(page).getByLabel("Menu", { exact: true })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    const box = (await libraryLink(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);

    await libraryLink(page).click();
    await expect(page).toHaveURL("/library");
    await expect(libraryLink(page)).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
  });

  test("a learner on a wide screen: 'Thư viện' then 'Buổi của tôi', each marked on its own page", async ({ page, context }) => {
    await signInAndAccept(page, context, "header-library-wide", "/");

    await expect(banner(page).getByRole("navigation", { name: "Chính" }).getByRole("link")).toHaveText(["Thư viện", "Buổi của tôi"]);
    await libraryLink(page).click();
    await expect(page).toHaveURL("/library");
    await expect(libraryLink(page)).toHaveAttribute("aria-current", "page");
    await expect(mySessionsLink(page)).not.toHaveAttribute("aria-current", "page");

    await mySessionsLink(page).click();
    await expect(page).toHaveURL("/my-sessions");
    await expect(mySessionsLink(page)).toHaveAttribute("aria-current", "page");
    await expect(libraryLink(page)).not.toHaveAttribute("aria-current", "page");
    await expect(libraryLink(page)).not.toHaveClass(/\bon\b/u);
  });

  test("a learner on a phone: both links are in the folded menu, which closes when one is followed", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndAccept(page, context, "header-library-narrow", "/");
    const menu = banner(page).getByLabel("Menu", { exact: true });

    await expect(libraryLink(page)).toBeHidden();
    await menu.click();
    await expect(banner(page).locator(".hdr-narrow .menu a")).toHaveText(["Thư viện", "Buổi của tôi"]);
    await expect(libraryLink(page)).toBeVisible();

    await libraryLink(page).click();
    await expect(page).toHaveURL("/library");
    await expect(libraryLink(page)).toBeHidden();
    await menu.click();
    await expect(libraryLink(page)).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Màn 1: the home page leads into the library", () => {
  test("the hero's buttons, the library's first topics, the steps and the closing band", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // The hero: into the library first, a topic of one's own second.
    await expect(hero(page).getByRole("link")).toHaveText(["Vào thư viện", "Tạo chủ đề của bạn"]);
    await expect(hero(page).getByRole("link", { name: "Vào thư viện" })).toHaveAttribute("href", "/library");
    await expect(hero(page).getByRole("link", { name: "Tạo chủ đề của bạn" })).toHaveAttribute("href", "/custom-topic");
    await expect(page.getByRole("link", { name: "Bắt đầu luyện" })).toHaveCount(0);

    // The library section: its topics as cards, with no one's progress.
    await expect(homeLibrary(page).locator(".eyebrow")).toHaveText("Thư viện");
    await expect(homeLibrary(page).getByRole("link", { name: "Xem cả thư viện" })).toHaveAttribute("href", "/library");
    const cards = homeLibrary(page).locator("a.tcard");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("href", TOPIC_PATH);
    await expect(cards.first().getByRole("heading", { level: 3 })).toHaveText(CHI_TIEU.title);
    await expect(cards.first().locator(".pill")).toHaveText("UX");
    await expect(cards.first().locator(".tfoot")).toHaveText("1 persona");
    await expect(page.getByText("Đã luyện")).toHaveCount(0);

    // Step 1 names the choice the library offers.
    await expect(page.locator(".step h3").first()).toHaveText("Chọn chủ đề và persona");

    // Under the hero: the result of a sample session, said to be one, where the placeholder was.
    const sample = page.getByRole("figure", { name: "Buổi mẫu: kết quả một buổi luyện với chị Thu" });
    await expect(sample.getByText("Chị Thu đã kể: 3 trên 11.")).toBeVisible();
    await expect(sample.locator("mark")).toHaveText("cách riêng để không tiêu quá tay");
    await expect(sample.getByText("Chị ấy vừa nhắc tới một cách xoay xở. Bạn chuyển chủ đề.")).toBeVisible();
    await expect(sample.locator(".sk")).toHaveCount(0);

    // The closing band: both ways on, with no tag on it.
    await expect(closing(page).getByText("Gõ một chủ đề. InterviewLab tạo một nhân vật hư cấu để bạn luyện. Kịch bản tự tạo chỉ qua kiểm tra nhẹ.")).toBeVisible();
    await expect(closing(page).getByText("Kiểm tra nhẹ", { exact: true })).toHaveCount(0);
    await expect(closing(page).getByRole("link")).toHaveText(["Tạo chủ đề của bạn", "Vào thư viện"]);
    await expect(closing(page).getByRole("link", { name: "Vào thư viện" })).toHaveAttribute("href", "/library");

    // One h1, and nothing of any item.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(findSealed(await page.content(), readChiThu())).toEqual([]);
    // No link names a persona: every way in goes through the library or a topic.
    expect(await page.locator('a[href^="/prep/"]').count()).toBe(0);
  });

  test("a visitor walks home → library → topic → prep, and each button of the home page leads where it says", async ({ page }) => {
    await page.goto("/");
    await hero(page).getByRole("link", { name: "Vào thư viện" }).click();
    await expect(page).toHaveURL("/library");
    await page.locator(`a.tcard[href="${TOPIC_PATH}"]`).click();
    await expect(page).toHaveURL(TOPIC_PATH);
    await page.locator("article.pcard .actionbar a").click();
    await expect(page).toHaveURL("/prep/chi-thu");

    await page.goto("/");
    await homeLibrary(page).locator("a.tcard").first().click();
    await expect(page).toHaveURL(TOPIC_PATH);

    await page.goto("/");
    await homeLibrary(page).getByRole("link", { name: "Xem cả thư viện" }).click();
    await expect(page).toHaveURL("/library");

    await page.goto("/");
    await closing(page).getByRole("link", { name: "Vào thư viện" }).click();
    await expect(page).toHaveURL("/library");

    await page.goto("/");
    await closing(page).getByRole("link", { name: "Tạo chủ đề của bạn" }).click();
    await expect(page).toHaveURL("/sign-in?next=%2Fcustom-topic");
  });

  test("shows the first three topics in library order, and the same page to a learner who practised", async ({ page, context }) => {
    const wanted: ExtraPersona[] = [
      { personaId: "p-first", displayName: "anh Một", name: "Anh Một, 30 tuổi", topic: { id: "ux-first", title: "Chủ đề đứng đầu", summary: "Một câu.", role: "ux", display_order: 1 } },
      { personaId: "p-ba", displayName: "chị Hai", name: "Chị Hai, 31 tuổi", topic: { id: "ba-second", title: "Chủ đề BA", summary: "Một câu.", role: "ba", display_order: 5 } },
      { personaId: "p-last", displayName: "anh Bốn", name: "Anh Bốn, 33 tuổi", topic: { id: "pm-last", title: "Chủ đề đứng cuối", summary: "Một câu.", role: "pm", display_order: 99 } },
    ];
    const extra: ExtraPersona[] = [];
    try {
      for (const persona of wanted) extra.push(await importExtraPersona(persona));
      await page.goto("/");
      const cards = homeLibrary(page).locator("a.tcard");
      await expect(cards.getByRole("heading", { level: 3 })).toHaveText(["Chủ đề đứng đầu", "Chủ đề BA", CHI_TIEU.title]);
      await expect(cards.locator(".pill")).toHaveText(["UX", "BA", "UX"]);
      await expect(page.getByText("Chủ đề đứng cuối")).toHaveCount(0);
      const guestCards = await homeLibrary(page).locator(".lib-grid").innerHTML();

      // A learner with a finished session sees the same cards: no "Đã luyện" here.
      const { userId } = await signInAndAccept(page, context, "home-learner", "/prep/chi-thu");
      await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
      await expect(page).toHaveURL(SESSION_URL);
      await db.setSessionStatus(page.url().split("/").pop()!, "done");
      await page.goto("/");
      await expect(homeLibrary(page).locator("a.tcard")).toHaveCount(3);
      await expect(page.getByText("Đã luyện")).toHaveCount(0);
      expect(await homeLibrary(page).locator(".lib-grid").innerHTML()).toBe(guestCards);
      expect(await db.sessionsOf(userId)).toHaveLength(1);
    } finally {
      await removePersonas(extra);
    }
  });

  test("with no topic to play the library section is left out, and the buttons are still there", async ({ page }) => {
    // The publish gate is on and chị Thu is a draft: the library is empty.
    await db.requirePublished();
    try {
      await page.goto("/");
      await expect(hero(page).getByRole("link")).toHaveText(["Vào thư viện", "Tạo chủ đề của bạn"]);
      await expect(page.getByText("Chọn một chủ đề, rồi chọn một persona")).toHaveCount(0);
      await expect(page.locator("a.tcard")).toHaveCount(0);
      await expect(closing(page).getByRole("link")).toHaveText(["Tạo chủ đề của bạn", "Vào thư viện"]);
    } finally {
      await db.clearConfig();
    }
  });

  test("fits a phone: one column, full-width buttons in the band, no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    const card = (await homeLibrary(page).locator("a.tcard").first().boundingBox())!;
    expect(card.width).toBeGreaterThan(340);
    for (const name of ["Tạo chủ đề của bạn", "Vào thư viện"]) {
      const box = (await closing(page).getByRole("link", { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThan(300);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Màn 9: no session yet (FR-43)", () => {
  test("the empty state leads to the library", async ({ page, context }) => {
    await signInAndAccept(page, context, "mine-empty-library");

    await expect(page.getByRole("heading", { level: 2, name: "Bạn chưa luyện buổi nào" })).toBeVisible();
    const enter = page.getByRole("main").getByRole("link", { name: "Vào thư viện" });
    await expect(enter).toHaveAttribute("href", "/library");
    await expect(page.getByRole("link", { name: "Bắt đầu luyện" })).toHaveCount(0);
    await enter.click();
    await expect(page).toHaveURL("/library");
  });
});

test.describe("Màn 3: a persona that cannot be started leads back to its topic", () => {
  test("a pulled persona with no session: the note, and the way back to the topic", async ({ page }) => {
    await db.requirePublished();
    try {
      await page.goto("/prep/chi-thu");
      await expect(page.getByRole("alert").filter({ hasText: "Nhân vật này đang được cập nhật." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Bắt đầu" })).toHaveCount(0);
      const back = page.getByRole("main").getByRole("link", { name: "Về chủ đề" });
      await expect(back).toHaveAttribute("href", TOPIC_PATH);
      await expect(page.getByRole("main").getByRole("link", { name: "Về trang chủ" })).toHaveCount(0);
      await back.click();
      await expect(page).toHaveURL(TOPIC_PATH);
    } finally {
      await db.clearConfig();
    }
  });
});

test.describe("Màn 6 item 7: the persona to practise next (FR-31)", () => {
  test("same topic first, then another topic, then 'practised them all' with the waitlist written once", async ({ page, context }) => {
    test.setTimeout(120_000);
    const extra: ExtraPersona[] = [];
    try {
      for (const persona of [ANH_DUNG, CO_LAN]) extra.push(await importExtraPersona(persona));
      // home → library → topic → prep → … → reveal.
      const { userId } = await signInAndAccept(page, context, "next-persona", "/");
      await hero(page).getByRole("link", { name: "Vào thư viện" }).click();
      await page.locator(`a.tcard[href="${TOPIC_PATH}"]`).click();
      await expect(page.locator("article.pcard")).toHaveCount(2);
      await page.locator("article.pcard", { hasText: "Chị Thu, 26 tuổi" }).getByRole("link", { name: "Bắt đầu" }).click();
      await expect(page).toHaveURL("/prep/chi-thu");
      await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
      await expect(page).toHaveURL(SESSION_URL);
      const sessionId = page.url().split("/").pop()!;
      const revealUrl = `/sessions/${sessionId}`;
      await playQuestions(page.request, sessionId, PLAIN_QUESTIONS);
      expect((await postEnd(page.request, sessionId, { canvasText: "" })).status).toBe(200);
      await page.reload();
      await guess(page, 0);
      await expectResult(page, 0, 0);
      expect((await db.session(sessionId)).status).toBe("done");

      // 1. Another persona of the topic just practised.
      await expect(suggestion(page).locator(".eyebrow")).toHaveText("Cùng chủ đề");
      await expect(suggestion(page).getByRole("heading", { level: 3 })).toHaveText("Anh Dũng, 29 tuổi");
      await expect(suggestion(page).locator(".next-seal")).toHaveText("Đang giữ 11 điều");
      await expect(suggestion(page).locator("svg.avatar text")).toHaveText("D");
      await expect(suggestion(page)).not.toContainText(CHI_TIEU.title);
      const go = suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Dũng" });
      await expect(go).toHaveAttribute("href", "/prep/anh-dung");
      await expect(suggestion(page).getByRole("link", { name: "Về thư viện" })).toHaveAttribute("href", "/library");
      await expect(page.getByText(ALL_PRACTISED)).toHaveCount(0);
      await expect(nextStep(page).getByRole("button", { name: "Báo tôi khi có" })).toBeVisible();
      // Nothing of the offered persona's items came with the suggestion.
      expect(findSealed(await nextStep(page).innerHTML(), readChiThu())).toEqual([]);

      // It leads to that persona's prep screen, where the session starts.
      await go.click();
      await expect(page).toHaveURL("/prep/anh-dung");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anh Dũng, 29 tuổi");
      await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
      await expect(page).toHaveURL(SESSION_URL);
      expect((await db.sessionsOf(userId)).map((session) => session.personaId).sort()).toEqual(["anh-dung", "chi-thu"]);

      // 2. The topic has nobody left: a persona of another topic of the role, with that topic named.
      await page.goto(revealUrl);
      await expect(suggestion(page).locator(".eyebrow")).toHaveText("Một chủ đề khác");
      await expect(suggestion(page).getByRole("heading", { level: 3 })).toHaveText("Cô Lan, 52 tuổi");
      await expect(suggestion(page)).toContainText(DAT_SAN.title);
      await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với cô Lan" })).toHaveAttribute("href", "/prep/co-lan");

      // 3. Everyone practised: the old line, the library, and the waitlist.
      await practise(page, "co-lan", revealUrl);
      await expect(suggestion(page)).toContainText(ALL_PRACTISED);
      await expect(suggestion(page).getByRole("link")).toHaveText(["Vào thư viện"]);
      await expect(suggestion(page).getByRole("link", { name: "Vào thư viện" })).toHaveAttribute("href", "/library");
      await expect(page.getByText("Luyện tiếp với")).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("link", { name: "Về trang chủ" })).toHaveCount(0);

      const join = nextStep(page).getByRole("button", { name: "Báo tôi khi có" });
      await join.click();
      await expect(page.getByRole("status").filter({ hasText: "Đã ghi. Chúng tôi sẽ báo khi có persona mới." })).toBeVisible();
      expect((await page.request.post("/api/waitlist", { data: { context: "no_more_personas" } })).status()).toBe(200);
      await page.reload();
      await expect(join).toHaveCount(0);
      expect(await db.waitlistOf(userId)).toHaveLength(1);

      // A withdrawn session does not count: that persona is offered again.
      const dungSession = (await db.sessionsOf(userId)).find((session) => session.personaId === "anh-dung")!;
      await db.setSessionStatus(dungSession.id, "withdrawn");
      await page.reload();
      await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Dũng" })).toBeVisible();
    } finally {
      await removePersonas(extra);
    }
  });

  test("a persona of another role is never offered, and a pulled one neither", async ({ page, context }) => {
    test.setTimeout(120_000);
    const wanted: ExtraPersona[] = [
      { personaId: "p-ba", displayName: "chị Hai", name: "Chị Hai, 31 tuổi", topic: { id: "ba-first", title: "Chủ đề BA", summary: "Một câu.", role: "ba", display_order: 1 } },
      ANH_DUNG,
    ];
    const extra: ExtraPersona[] = [];
    try {
      for (const persona of wanted) extra.push(await importExtraPersona(persona));
      await endedInterview(page, context, "next-role", PLAIN_QUESTIONS, "");
      await guess(page, 0);
      await expectResult(page, 0, 0);
      await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Dũng" })).toBeVisible();

      // anh Dũng is pulled: the BA persona is still not offered to a learner who practised a UX topic.
      await db.setScenarioStatus("anh-dung", "unpublished");
      await page.reload();
      await expect(suggestion(page)).toContainText(ALL_PRACTISED);
      await expect(page.getByText("Chị Hai")).toHaveCount(0);
      expect(await page.content()).not.toContain("p-ba");
    } finally {
      await removePersonas(extra);
    }
  });

  test("while the replay is still on offer the suggestion is there too, and holds nothing of the item kept back", async ({ page, context }) => {
    const extra = [await importExtraPersona(ANH_DUNG)];
    try {
      const { sessionId } = await endedInterview(page, context, "next-sealed", PRIMARY_QUESTIONS, PRIMARY_NOTES);
      await guess(page, 5);
      await expectResult(page, 5, 2);
      expect((await db.session(sessionId)).status).toBe("revealed");

      await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Dũng" })).toHaveAttribute("href", "/prep/anh-dung");
      // The page still keeps the replay target back: the suggestion is about someone else.
      const paidApp = readChiThu().items.find((item) => item.id === "paid-app")!;
      const html = await page.content();
      for (const sealed of [paidApp.content, paidApp.sample_question, paidApp.hook_line]) expect(html).not.toContain(sealed);
    } finally {
      await removePersonas(extra);
    }
  });

  test("after a topic of the learner's own: the role filter stands in, and a role with no persona is never 'all practised'", async ({ page, context }) => {
    test.setTimeout(180_000);
    const { userId } = await signInAndAccept(page, context, "next-custom", "/library");
    // The learner's role is BA, which has no persona.
    await page.getByRole("group", { name: "Lọc theo vai trò" }).getByRole("button", { name: "BA", exact: true }).click();
    await expect.poll(async () => (await db.user(userId)).roleFilter).toBe("ba");

    await page.goto("/custom-topic");
    await page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?").fill("app nhắc lịch uống nước cho dân văn phòng");
    await page.getByRole("button", { name: "Tạo kịch bản" }).click();
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(page).toHaveURL(SESSION_URL);
    const sessionId = page.url().split("/").pop()!;
    await playQuestions(page.request, sessionId, PLAIN_QUESTIONS);
    expect((await postEnd(page.request, sessionId, { canvasText: "" })).status).toBe(200);
    await page.reload();
    await page.getByRole("slider").focus();
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Xem kết quả" }).click();
    await expect(nextStep(page)).toBeVisible({ timeout: 20_000 });

    // BA has no persona: only the way to the library, and the waitlist.
    await expect(page.getByText(ALL_PRACTISED)).toHaveCount(0);
    await expect(page.getByText("Luyện tiếp với")).toHaveCount(0);
    await expect(suggestion(page).getByRole("link")).toHaveText(["Vào thư viện"]);
    await expect(nextStep(page).getByRole("button", { name: "Báo tôi khi có" })).toBeVisible();

    // With the filter on UX, the curated UX persona is offered, as one of another topic.
    await db.setRoleFilter(userId, "ux");
    await page.reload();
    await expect(suggestion(page).locator(".eyebrow")).toHaveText("Một chủ đề khác");
    await expect(suggestion(page).getByRole("heading", { level: 3 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(suggestion(page)).toContainText(CHI_TIEU.title);
    await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với chị Thu" })).toHaveAttribute("href", "/prep/chi-thu");
    // chị Thu has an illustration.
    await expect(suggestion(page).locator("svg.avatar path").first()).toBeAttached();

    // No filter, or "Khác": every topic counts.
    for (const filter of [null, "other"] as const) {
      await db.setRoleFilter(userId, filter);
      await page.reload();
      await expect(suggestion(page).getByRole("link", { name: "Luyện tiếp với chị Thu" }), String(filter)).toBeVisible();
    }
  });

  test("fits a phone: the suggestion stacks over the waitlist and its button is full width", async ({ page, context }) => {
    const extra = [await importExtraPersona(ANH_DUNG)];
    try {
      await endedInterview(page, context, "next-phone", PLAIN_QUESTIONS, "");
      await guess(page, 0);
      await expectResult(page, 0, 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalScroll(page);
      const cards = nextStep(page).locator(".next-card");
      const first = (await cards.nth(0).boundingBox())!;
      const second = (await cards.nth(1).boundingBox())!;
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      const button = (await suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Dũng" }).boundingBox())!;
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.width).toBeGreaterThan(first.width - 60);
    } finally {
      await removePersonas(extra);
    }
  });
});
