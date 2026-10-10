import { expect, test, type Page } from "@playwright/test";
import { personaInitial, capitalizeFirst } from "@/scenario/persona-card";
import { curatedPersonas, curatedTopics } from "../helpers/curated-scenarios";
import { findSealed } from "../helpers/sealed-strings";
import { importCuratedLibrary } from "../helpers/test-db";
import { createAccount, signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { ask } from "./helpers/chat";
import { db } from "./helpers/db";
import { postEnd } from "./helpers/interview";
import { removePersonas, type ExtraPersona } from "./helpers/personas";
import { postTurn, turnOutcome } from "./helpers/turn-api";

const TOPICS = curatedTopics();
const ALL = curatedPersonas();
/** The six personas of the app and web app topics; chị Thu is already in every test database. */
const NEW = ALL.filter((persona) => persona.scenario.persona_id !== "chi-thu");
const APP_TOPICS = TOPICS.filter((entry) => entry.folder !== "ux-chi-tieu");
const CONG_VIEC = TOPICS.find((entry) => entry.folder === "ux-cong-viec-nhom")!;
const HANH = NEW.find((persona) => persona.scenario.persona_id === "chi-hanh")!.scenario;
const KHOA = NEW.find((persona) => persona.scenario.persona_id === "anh-khoa")!.scenario;

const EMPTY = "Chưa có chủ đề cho vai trò này.";
const OTHER_NOTE = "Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề.";
const SESSION_URL = /\/sessions\/[0-9a-f-]{36}$/u;

const chips = (page: Page) => page.getByRole("group", { name: "Lọc theo vai trò" });
const chip = (page: Page, name: "UX" | "BA" | "PM" | "Khác") => chips(page).getByRole("button", { name, exact: true });
const topicCards = (page: Page) => page.locator(".lib-grid a.tcard");
const shownCount = (page: Page) => page.locator(".lib-bar > span");
const personaCards = (page: Page) => page.locator("article.pcard");
const personaCard = (page: Page, name: string) => personaCards(page).filter({ hasText: name });
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Đường dẫn" });
const nextStep = (page: Page) => page.getByRole("region", { name: "Bước tiếp theo" });
const suggestion = (page: Page) => nextStep(page).locator(".next-card").first();

async function press(page: Page, name: "UX" | "BA" | "PM" | "Khác", becomes: "true" | "false") {
  await chip(page, name).click();
  await expect(chip(page, name)).toHaveAttribute("aria-pressed", becomes);
}

/** Nothing of any persona's items is in what the server sent for the page. */
async function expectNothingSealed(page: Page) {
  const sent = await page.content();
  const shown = await page.locator("body").innerText();
  for (const { file, scenario } of ALL) {
    expect(findSealed(sent, scenario), file).toEqual([]);
    expect(findSealed(shown, scenario), file).toEqual([]);
  }
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

let imported: ExtraPersona[] = [];

test.describe("the library with the app and web app topics in it", () => {
  // The other specs expect chị Thu to be the one persona: the six come in for this file and go out after it.
  test.beforeAll(async () => {
    // Named before the import: one that stops part-way still leaves `afterAll` the whole list to remove.
    imported = NEW.map(({ scenario, topic }) => ({ personaId: scenario.persona_id, displayName: scenario.persona.display_name, name: scenario.persona.name, topic }));
    await importCuratedLibrary();
  });
  test.afterAll(async () => {
    await removePersonas(imported);
  });

  test("Màn 2 lists the four topics in library order; UX shows four, BA and PM none, 'Khác' all under its line", async ({ page }) => {
    await page.goto("/library");

    await expect(shownCount(page)).toHaveText("4 chủ đề");
    await expect(topicCards(page)).toHaveCount(4);
    for (const [position, entry] of TOPICS.entries()) {
      const card = topicCards(page).nth(position);
      await expect(card).toHaveAttribute("href", `/topics/${entry.topic.id}`);
      await expect(card.locator(".pill")).toHaveText("UX");
      await expect(card.getByRole("heading", { level: 2 })).toHaveText(entry.topic.title);
      await expect(card.locator(".tbody p")).toHaveText(entry.topic.summary);
      await expect(card.locator(".tfoot")).toHaveText(`${entry.personas.length} persona`);
    }
    await expectNothingSealed(page);

    await press(page, "UX", "true");
    await expect(topicCards(page)).toHaveCount(4);
    await expect(shownCount(page)).toHaveText("4 chủ đề");

    for (const role of ["BA", "PM"] as const) {
      await press(page, role, "true");
      await expect(page.locator(".lib-empty")).toContainText(EMPTY);
      await expect(topicCards(page)).toHaveCount(0);
    }

    await press(page, "Khác", "true");
    await expect(page.getByText(OTHER_NOTE)).toBeVisible();
    await expect(topicCards(page)).toHaveCount(4);

    // The choice is still there after a reload.
    await page.reload();
    await expect(chip(page, "Khác")).toHaveAttribute("aria-pressed", "true");
    await expect(topicCards(page)).toHaveCount(4);
  });

  test("Màn 1 previews the first three topics of the library and leads to all four", async ({ page }) => {
    await page.goto("/");
    const preview = page.getByRole("region", { name: "Chọn một chủ đề, rồi chọn một persona" });

    await expect(preview.locator("a.tcard")).toHaveCount(3);
    await expect(preview.locator("a.tcard h3")).toHaveText(TOPICS.slice(0, 3).map((entry) => entry.topic.title));
    await expectNothingSealed(page);

    await preview.getByRole("link", { name: "Xem cả thư viện" }).click();
    await expect(page).toHaveURL("/library");
    await expect(topicCards(page)).toHaveCount(4);
  });

  for (const entry of APP_TOPICS) {
    test(`Màn 2b of ${entry.folder}: a guest sees the topic, the overlap warning and both personas with only their item count`, async ({ page }) => {
      const response = await page.goto(`/topics/${entry.topic.id}`);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.topic.title);
      await expect(crumbs(page).getByRole("link", { name: "Thư viện" })).toHaveAttribute("href", "/library");
      await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText(entry.topic.title);
      await expect(page.locator(".topic-pills .pill")).toHaveText(["UX", "2 persona"]);
      await expect(page.locator(".topic-what p")).toHaveText(entry.topic.summary);
      await expect(page.getByRole("note")).toContainText("Họ là nhân vật hư cấu, không phải người dùng của bạn.");

      await expect(personaCards(page)).toHaveCount(2);
      for (const { scenario } of entry.personas) {
        const card = personaCard(page, scenario.persona.name);
        await expect(card.getByRole("heading", { level: 2 })).toHaveText(scenario.persona.name);
        await expect(card.locator(".pcard-who p")).toHaveText(scenario.persona.tagline);
        await expect(card.locator(".ribbon")).toHaveText("Sẵn sàng");
        await expect(card.locator(".ctx")).toContainText(scenario.research_goal);
        await expect(card.locator(".pcard-seal")).toContainText(`Đang giữ ${scenario.items.length} điều chưa nói`);
        // No illustration was drawn for them: the initial of the given name stands in.
        await expect(card.locator("svg.avatar text")).toHaveText(personaInitial(scenario.persona.display_name));
        await expect(card.locator(".actionbar a")).toHaveText("Bắt đầu");
        await expect(card.locator(".actionbar a")).toHaveAttribute("href", `/prep/${scenario.persona_id}`);
      }
      // An unevaluated draft carries no label for learners.
      await expect(page.getByText("Kiểm tra nhẹ")).toHaveCount(0);
      await expect(page.getByText("Bạn đã luyện")).toHaveCount(0);
      await expectNothingSealed(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalScroll(page);
    });
  }

  for (const { scenario, topic } of NEW) {
    test(`Màn 3 of ${scenario.persona_id}: a guest reads the persona and the research question, and nothing an item holds`, async ({ page }) => {
      const response = await page.goto(`/prep/${scenario.persona_id}`);
      const name = capitalizeFirst(scenario.persona.display_name);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(scenario.persona.name);
      await expect(page.getByText(scenario.persona.tagline)).toBeVisible();
      await expect(page.getByText(scenario.research_goal)).toBeVisible();
      await expect(page.getByText(`Đang giữ ${scenario.items.length} điều chưa nói`)).toBeVisible();
      await expect(page.getByText(`${name} chỉ nói ra những điều đang giữ nếu bạn hỏi đúng cách.`)).toBeVisible();
      await expect(crumbs(page).getByRole("link", { name: "Thư viện" })).toHaveAttribute("href", "/library");
      await expect(crumbs(page).getByRole("link", { name: topic.title })).toHaveAttribute("href", `/topics/${topic.id}`);
      await expect(crumbs(page).locator('[aria-current="page"]')).toHaveText(name);
      await expectNothingSealed(page);
    });
  }

  test("a guest walks home → library → UX → topic → prep and back with no sign-in; 'Bắt đầu' asks for one and then opens the session", async ({ page }) => {
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "google" }));
    await page.goto("/");
    await page.locator(".hero").getByRole("link", { name: "Vào thư viện" }).click();
    await expect(page).toHaveURL("/library");
    await press(page, "UX", "true");
    await page.locator(`a.tcard[href="/topics/${CONG_VIEC.topic.id}"]`).click();
    await expect(page).toHaveURL(`/topics/${CONG_VIEC.topic.id}`);
    await personaCard(page, HANH.persona.name).locator(".actionbar a").click();
    await expect(page).toHaveURL("/prep/chi-hanh");

    // Back up the breadcrumb: the filter chosen on the way in is still the one shown.
    await crumbs(page).getByRole("link", { name: CONG_VIEC.topic.title }).click();
    await expect(page).toHaveURL(`/topics/${CONG_VIEC.topic.id}`);
    await crumbs(page).getByRole("link", { name: "Thư viện" }).click();
    await expect(page).toHaveURL("/library");
    await expect(chip(page, "UX")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    // "Bắt đầu" is where sign-in is asked for (the Google round trip is replaced by the fixture).
    await page.goto("/prep/chi-hanh");
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await page.waitForURL("**/auth/v1/authorize**");
    const email = uniqueEmail("library-guest");
    const userId = await createAccount(email);
    await signIn(page.context(), email);

    // The start the guest asked for is kept: after the notice it opens the session with chị Hạnh.
    await page.goto("/resume");
    await expect(page).toHaveURL("/data-notice?next=%2Fresume");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator(".bubble-p").first()).toHaveText(HANH.opening_line);
    expect((await db.sessionsOf(userId)).map((session) => session.personaId)).toEqual(["chi-hanh"]);
    // The guest's filter moved onto the account at sign-in.
    expect((await db.user(userId)).roleFilter).toBe("ux");
  });

  test("a learner practises chị Hạnh, is offered anh Khoa of the same topic, and the topic then counts 1/2", async ({ page, context }) => {
    test.setTimeout(120_000);
    const userId = await signInAsNewLearner(context, uniqueEmail("library-path"));
    const topicPath = `/topics/${CONG_VIEC.topic.id}`;

    // Library → topic → prep, signing the notice on the way.
    await page.goto(`/data-notice?next=${topicPath}`);
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL(topicPath);
    await expect(page.locator(".topic-done")).toHaveText("Bạn đã luyện 0/2");
    await personaCard(page, HANH.persona.name).locator(".actionbar a").click();
    await expect(page).toHaveURL("/prep/chi-hanh");
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await expect(page).toHaveURL(SESSION_URL);
    const sessionId = page.url().split("/").pop()!;
    const revealUrl = `/sessions/${sessionId}`;

    // Màn 4 opens with her own first line, and holds nothing sealed.
    await expect(page.locator(".bubble-p").first()).toHaveText(HANH.opening_line);
    await expectNothingSealed(page);

    // A short interview: the first question touches the tag of her first surface item, which she then tells.
    await ask(page, `Sau khi giao việc, chị theo dõi bằng cách nào ạ? [stub:analysis=${JSON.stringify({ topic_tags: ["T1"], question_type: "open" })}]`, 1);
    const second = `Chị kể thêm được không ạ? [stub:analysis=${JSON.stringify({ prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: ["I1"], violations: [] } })}]`;
    expect(turnOutcome(await postTurn(page.request, sessionId, { text: second, expectedIndex: 2 }))).toMatchObject({ turnIndex: 2 });

    // While the session is open the topic says "Tiếp tục".
    await page.goto(topicPath);
    await expect(personaCard(page, HANH.persona.name).locator(".actionbar a")).toHaveText("Tiếp tục buổi luyện");
    await expect(page.locator(".topic-done")).toHaveText("Bạn đã luyện 0/2");

    // End → guess → reveal.
    expect((await postEnd(page.request, sessionId, { canvasText: "" })).status).toBe(200);
    await page.goto(revealUrl);
    await expect(page.getByRole("heading", { name: `Bạn nghĩ chị Hạnh đã kể cho bạn bao nhiêu trong ${HANH.items.length} điều?` })).toBeVisible();
    const slider = page.getByRole("slider", { name: "Số điều chị Hạnh đã kể" });
    await slider.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuetext", `1 trên ${HANH.items.length}`);
    await page.getByRole("button", { name: "Xem kết quả" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bạn đoán 1.Chị Hạnh đã kể: 1 trên ${HANH.items.length}.`, { timeout: 20_000 });
    expect((await db.session(sessionId)).status).toBe("done");
    // The reveal opens what she told and keeps the other nine items of this session's persona to their tags.
    await expect(page.getByText(HANH.items[0].content)).toBeVisible();
    expect(findSealed(await nextStep(page).innerHTML(), KHOA)).toEqual([]);

    // The suggestion: the other persona of the topic.
    await expect(suggestion(page).locator(".eyebrow")).toHaveText("Cùng chủ đề");
    await expect(suggestion(page).getByRole("heading", { level: 3 })).toHaveText(KHOA.persona.name);
    await expect(suggestion(page).locator(".next-seal")).toHaveText(`Đang giữ ${KHOA.items.length} điều`);
    await expect(suggestion(page).locator("svg.avatar text")).toHaveText("K");
    const go = suggestion(page).getByRole("link", { name: "Luyện tiếp với anh Khoa" });
    await expect(go).toHaveAttribute("href", "/prep/anh-khoa");
    await go.click();
    await expect(page).toHaveURL("/prep/anh-khoa");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(KHOA.persona.name);
    await expect(page.getByText(KHOA.research_goal)).toBeVisible();

    // Back on the topic: one of two practised, and her card leads to the result.
    await page.goto(topicPath);
    await expect(page.locator(".topic-done")).toHaveText("Bạn đã luyện 1/2");
    await expect(personaCard(page, HANH.persona.name).locator(".actionbar a")).toHaveText("Xem lại kết quả");
    await expect(personaCard(page, HANH.persona.name).locator(".actionbar a")).toHaveAttribute("href", revealUrl);
    await expect(personaCard(page, KHOA.persona.name).locator(".actionbar a")).toHaveText("Bắt đầu");
    await page.goto("/library");
    await expect(page.locator(`a.tcard[href="${topicPath}"] .tcard-done`)).toHaveText("Đã luyện 1/2");

    // The second session starts and opens with his own first line.
    await page.goto("/prep/anh-khoa");
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator(".bubble-p").first()).toHaveText(KHOA.opening_line);
    expect((await db.sessionsOf(userId)).map((session) => session.personaId).sort()).toEqual(["anh-khoa", "chi-hanh"]);

    // The topic is used up: the reveal now offers a persona of another topic, with that topic named.
    await page.goto(revealUrl);
    await expect(suggestion(page).locator(".eyebrow")).toHaveText("Một chủ đề khác");
    await expect(suggestion(page)).toContainText(TOPICS[0].topic.title);
  });

  test("every new persona opens a session with its own first line and answers a question", async ({ page, context }) => {
    test.setTimeout(180_000);
    await signInAsNewLearner(context, uniqueEmail("library-each"));
    await page.goto("/data-notice?next=/library");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/library");

    for (const { scenario } of NEW) {
      await page.goto(`/prep/${scenario.persona_id}`);
      await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
      await expect(page, scenario.persona_id).toHaveURL(SESSION_URL);
      await expect(page.locator(".bubble-p").first(), scenario.persona_id).toHaveText(scenario.opening_line);
      await ask(page, "Mọi chuyện bắt đầu thế nào, kể giúp mình với?", 1);
      await expectNothingSealed(page);
    }
  });
});
