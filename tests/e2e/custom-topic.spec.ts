import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAndAccept, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { ask } from "./helpers/chat";
import { db } from "./helpers/db";
import { postEnd } from "./helpers/interview";
import { postTurn, turnOutcome } from "./helpers/turn-api";

const TOPIC = "app hẹn hò trong khu dân cư đang sống";
const INFO = [
  "AI sẽ sinh một nhân vật hư cấu cho chủ đề này.",
  "Bạn không thấy và không chọn được điều nhân vật giấu.",
  "Kịch bản chỉ qua kiểm tra nhẹ: chưa ai đọc nó, và nó chưa được chạy thử lần nào.",
  "Đây không phải insight về người dùng thật.",
  "Quản trị viên InterviewLab xem được chủ đề và buổi luyện của bạn.",
  "Đừng nhập tên hay thông tin của người thật hay tổ chức thật.",
];

const topicBox = (page: Page) => page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?");
const focusBox = (page: Page) => page.getByLabel(/^Bạn muốn luyện điều gì trong buổi này\?/u);
const createButton = (page: Page) => page.getByRole("button", { name: "Tạo kịch bản" });
const quotaLine = (page: Page) => page.getByTestId("quota-line");
const strip = (page: Page) => page.locator(".custom-strip");
const stepState = (page: Page, name: string) => page.locator(".gen-steps li").filter({ hasText: name });

const openForm = (page: Page, context: BrowserContext, label: string) => signInAndAccept(page, context, label, "/custom-topic");

async function submitTopic(page: Page, topic: string) {
  await topicBox(page).fill(topic);
  await createButton(page).click();
}

/** Submits a topic and waits for the session that is being prepared. */
async function startAttempt(page: Page, topic: string) {
  await submitTopic(page, topic);
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
  return page.url().split("/").pop()!;
}

/** A learner whose custom topic passed, with the page on the prep screen of the new persona. */
async function playableTopic(page: Page, context: BrowserContext, label: string) {
  const learner = await openForm(page, context, label);
  const sessionId = await startAttempt(page, TOPIC);
  await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
  const personaId = page.url().split("/").pop()!;
  return { ...learner, sessionId, personaId };
}

test.describe("Màn 10: who reaches it", () => {
  test("a visitor signs in first, and a learner who has not agreed sees the data notice before the form", async ({ page, context }) => {
    await page.goto("/custom-topic");
    await expect(page).toHaveURL("/sign-in?next=%2Fcustom-topic");
    const guest = await page.request.post("/api/custom-topics", { data: { topic: TOPIC } });
    expect(guest.status()).toBe(401);
    expect(await guest.json()).toEqual({ error: "unauthorized", redirectTo: "/sign-in?next=%2Fcustom-topic" });

    const userId = await signInAsNewLearner(context, uniqueEmail("ct-notice"));
    await page.goto("/custom-topic");
    await expect(page).toHaveURL("/data-notice?next=%2Fcustom-topic");
    const refused = await page.request.post("/api/custom-topics", { data: { topic: TOPIC } });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual({ error: "notice_required", redirectTo: "/data-notice?next=%2Fcustom-topic" });
    expect(await db.attemptsOf(userId)).toEqual([]);

    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/custom-topic");
    await expect(page.getByRole("heading", { level: 1, name: "Tạo chủ đề của bạn" })).toBeVisible();
  });

  test("is linked from the home page and from Buổi của tôi", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.locator(".hero").getByRole("link", { name: "Tạo chủ đề của bạn" })).toHaveAttribute("href", "/custom-topic");
    await signInAndAccept(page, context, "ct-links");
    await page.getByRole("link", { name: "Tạo chủ đề của bạn" }).click();
    await expect(page).toHaveURL("/custom-topic");
  });
});

test.describe("Màn 10: the form", () => {
  test("shows the information block word for word, the light-check label and today's limits", async ({ page, context }) => {
    await openForm(page, context, "ct-form");

    await expect(page).toHaveTitle("Tạo chủ đề của bạn · InterviewLab");
    const info = page.locator(".ct-info");
    await expect(info.locator("li")).toHaveText(INFO);
    await expect(info.getByText("Kiểm tra nhẹ", { exact: true })).toBeVisible();
    await expect(quotaLine(page)).toHaveText("Còn 1 kịch bản miễn phí · 3 lần thử hôm nay");
    await expect(createButton(page)).toBeEnabled();
    await expect(page.getByText("Tùy chọn")).toBeVisible();
  });

  test("fills the optional answer from a quick chip, counts the characters, and refuses a short topic without sending it", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-validate");

    const chips = page.getByRole("group", { name: "Gợi ý" }).getByRole("button");
    await expect(chips).toHaveText(["Hỏi tiếp chi tiết vừa nghe", "Kéo về một lần cụ thể", "Người dè dặt", "Tránh câu dẫn dắt"]);
    await chips.nth(2).click();
    await expect(focusBox(page)).toHaveValue("Người dè dặt");
    await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "true");
    await chips.nth(2).click();
    await expect(focusBox(page)).toHaveValue("");

    await topicBox(page).fill("app");
    await expect(page.locator(".ct-under")).toContainText("3/300");
    await createButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Chủ đề cần từ 10 đến 300 ký tự." })).toBeVisible();
    await expect(topicBox(page)).toHaveValue("app");
    await expect(page).toHaveURL("/custom-topic");
    expect(await db.attemptsOf(userId)).toEqual([]);

    // The limit is the server's too, whatever a browser sends.
    const long = await page.request.post("/api/custom-topics", { data: { topic: "a".repeat(301) } });
    expect(long.status()).toBe(400);
    expect(await long.json()).toEqual({ error: "invalid_input" });
    expect(await db.attemptsOf(userId)).toEqual([]);
  });

  test("a refused topic creates no session, keeps both fields, and uses no attempt", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-refuse");
    const topic = "phỏng vấn người dùng về trải nghiệm ở một chuỗi cà phê [stub:refuse]";
    await focusBox(page).fill("em hay quên hỏi tiếp");

    await submitTopic(page, topic);

    await expect(page.getByRole("alert").filter({ hasText: "Chủ đề này không tạo được. Thử một chủ đề khác, không nhắc tới người thật hay tổ chức thật." })).toBeVisible();
    await expect(page).toHaveURL("/custom-topic");
    await expect(topicBox(page)).toHaveValue(topic);
    await expect(focusBox(page)).toHaveValue("em hay quên hỏi tiếp");
    await expect(quotaLine(page)).toHaveText("Còn 1 kịch bản miễn phí · 3 lần thử hôm nay");
    await expect(createButton(page)).toBeEnabled();
    expect(await db.sessionsOf(userId)).toEqual([]);
    expect(await db.attemptsOf(userId)).toMatchObject([{ outcome: "refused", sessionId: null, topicId: null }]);

    // The limits are unchanged after a reload, and the reason code never reached the page.
    await page.reload();
    await expect(quotaLine(page)).toHaveText("Còn 1 kịch bản miễn phí · 3 lần thử hôm nay");
    await expect(page.getByText("real_org_or_brand")).toHaveCount(0);
  });

  test("keeps the fields and offers a retry when the moderation call fails", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-modfail");
    await submitTopic(page, `${TOPIC} [stub:fail-moderation]`);

    await expect(page.getByRole("alert").filter({ hasText: "Không kết nối được." })).toBeVisible();
    await expect(topicBox(page)).toHaveValue(`${TOPIC} [stub:fail-moderation]`);
    expect(await db.attemptsOf(userId)).toEqual([]);
    expect(await db.sessionsOf(userId)).toEqual([]);
  });

  test("shows the paused state and takes no topic while the operator has the path turned off", async ({ page, context }) => {
    const { userId } = await signInAndAccept(page, context, "ct-paused");
    await db.pauseCustomPath();
    try {
      await page.goto("/custom-topic");
      await expect(page.getByRole("status").filter({ hasText: "Tạm dừng tạo chủ đề mới để kiểm tra chất lượng." })).toBeVisible();
      await expect(createButton(page)).toBeDisabled();

      const refused = await page.request.post("/api/custom-topics", { data: { topic: TOPIC } });
      expect(refused.status()).toBe(409);
      expect(await refused.json()).toEqual({ error: "blocked", block: "paused", runningSessionId: null });
      expect(await db.attemptsOf(userId)).toEqual([]);
    } finally {
      await db.clearConfig();
    }
    await page.reload();
    await expect(createButton(page)).toBeEnabled();
  });
});

test.describe("Màn 11 and after: a topic that passes", () => {
  test("prepares the scenario, says so in the tab title, and leads to a prep screen that carries the labels", async ({ page, context }) => {
    // Records every title the document was given: the "ready" title is replaced as soon as the next screen loads.
    await page.addInitScript(() => {
      const titles: string[] = [];
      (window as unknown as { __titles: string[] }).__titles = titles;
      const native = Object.getOwnPropertyDescriptor(Document.prototype, "title")!;
      Object.defineProperty(document, "title", {
        configurable: true,
        get: () => native.get!.call(document),
        set: (value: string) => {
          titles.push(value);
          native.set!.call(document, value);
        },
      });
    });
    const { userId } = await openForm(page, context, "ct-pass");
    await page.getByRole("group", { name: "Gợi ý" }).getByRole("button", { name: "Hỏi tiếp chi tiết vừa nghe" }).click();

    const sessionId = await startAttempt(page, TOPIC);
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    expect(await page.evaluate(() => (window as unknown as { __titles: string[] }).__titles)).toContain("✓ Kịch bản sẵn sàng");

    // Màn 3 of the custom persona.
    await expect(page.getByRole("heading", { level: 1, name: "Chị Mai, 27 tuổi" })).toBeVisible();
    await expect(page.locator(".prep-card").getByText("Kiểm tra nhẹ")).toBeVisible();
    const note = page.getByRole("note");
    await expect(note).toContainText("Đây không phải insight thật.");
    await expect(note).toContainText("Buổi này tập trung vào: Hỏi tiếp chi tiết vừa nghe.");
    await expect(page.getByLabel("Đường dẫn")).toContainText(TOPIC);
    await expect(page.getByText("Đang giữ 11 điều chưa nói")).toBeVisible();

    const [session] = await db.sessionsOf(userId);
    expect(session).toMatchObject({ id: sessionId, status: "interviewing", focus: "follow_up" });
    const [attempt] = await db.attemptsOf(userId);
    expect(attempt).toMatchObject({ outcome: "passed", focus: "follow_up", focusRaw: "Hỏi tiếp chi tiết vừa nghe", topicText: TOPIC });
    expect(await db.scenarioById(session.scenarioId!)).toMatchObject({ origin: "generated", status: "published", personaId: session.personaId });
    expect((await db.user(userId)).freeCustomUsed).toBe(true);

    // Màn 4: the interview of a custom session, with the strip above it.
    await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await expect(strip(page)).toContainText("Kiểm tra nhẹ");
    await expect(strip(page)).toContainText("Đây không phải insight thật.");
    await ask(page, "Chị kể em nghe về một ngày của chị được không ạ?", 1);
    expect(await db.turnsOf(sessionId)).toHaveLength(2);

    // Màn 9: the session under the persona's name and the typed topic.
    await page.goto("/my-sessions");
    const row = page.locator(`.srows a[href="/sessions/${sessionId}"]`);
    await expect(row).toContainText("Chị Mai");
    await expect(row).toContainText(TOPIC);
    await expect(row).toContainText("Đang làm dở");

    // Màn 10 again: the free scenario is used, and the button is the waitlist.
    await page.goto("/custom-topic");
    await expect(page.getByText("Bạn đã dùng kịch bản tự tạo miễn phí.")).toBeVisible();
    await expect(createButton(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Báo tôi khi tạo thêm được" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Chúng tôi sẽ báo khi bạn tạo thêm được." })).toBeVisible();
    expect(await db.waitlistOf(userId)).toMatchObject([{ context: "custom_topics" }]);
  });

  test("shows the two steps while it waits, blocks a second topic, and holds the account deletion", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-running");
    const sessionId = await startAttempt(page, `${TOPIC} [stub:slow-gen]`);

    await expect(page).toHaveTitle("Đang chuẩn bị kịch bản · InterviewLab");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`“${TOPIC} [stub:slow-gen]”`);
    await expect(page.locator(".gen-steps li")).toHaveText(["Đang tạo nhân vật", "Kiểm tra nội dung"]);
    await expect(stepState(page, "Đang tạo nhân vật")).toHaveAttribute("aria-current", "step");
    await expect(stepState(page, "Kiểm tra nội dung")).toHaveAttribute("data-state", "todo");
    await expect(page.getByText("Thường mất khoảng 1 phút. Bạn có thể đóng trang; kịch bản sẽ ở trong Buổi của tôi.")).toBeVisible();
    await expect(page.locator(".gen-card").getByText("Kiểm tra nhẹ")).toBeVisible();
    // Nothing of what is being generated is on the page.
    await expect(page.getByText("Chị Mai")).toHaveCount(0);

    const second = await context.newPage();
    await second.goto("/custom-topic");
    await expect(second.getByRole("status").filter({ hasText: "Bạn đang có một kịch bản đang chuẩn bị" })).toBeVisible();
    await expect(second.getByRole("link", { name: "Xem tiến độ" })).toHaveAttribute("href", `/sessions/${sessionId}`);
    await expect(createButton(second)).toBeDisabled();
    const blocked = await second.request.post("/api/custom-topics", { data: { topic: TOPIC } });
    expect(blocked.status()).toBe(409);
    expect(await blocked.json()).toEqual({ error: "blocked", block: "running", runningSessionId: sessionId });

    await second.goto("/my-sessions");
    const row = second.locator(`.srows a[href="/sessions/${sessionId}"]`);
    await expect(row).toContainText(`${TOPIC} [stub:slow-gen]`);
    await expect(row).toContainText("Đang chuẩn bị");
    await expect(second.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" })).toBeDisabled();
    await expect(second.getByText("Đợi kịch bản đang chuẩn bị xong rồi xóa.")).toBeVisible();
    await second.close();

    // The first page goes on by itself once the scenario is ready.
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    expect(await db.attemptsOf(userId)).toHaveLength(1);
  });

  test("labels every item of the reveal as fiction and takes the learner's report of the scenario", async ({ page, context }) => {
    const { sessionId } = await playableTopic(page, context, "ct-reveal");
    for (const [position, text] of ["Chị kể em nghe về công việc của chị được không ạ?", "Chị đi làm bằng gì ạ?"].entries()) {
      expect(turnOutcome(await postTurn(page.request, sessionId, { text, expectedIndex: position + 1 }))).toMatchObject({ turnIndex: position + 1 });
    }
    expect((await postEnd(page.request, sessionId, { canvasText: "ghi chú của em" })).status).toBe(200);

    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByRole("heading", { name: "Bạn nghĩ chị Mai đã kể cho bạn bao nhiêu trong 11 điều?" })).toBeVisible();
    await expect(strip(page)).toBeVisible();
    await page.getByRole("slider", { name: "Số điều chị Mai đã kể" }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Xem kết quả" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bạn đoán 1.Chị Mai đã kể: 0 trên 11.", { timeout: 30_000 });
    await expect(strip(page)).toContainText("Đây không phải insight thật.");
    const missed = page.locator("section[aria-labelledby='missed-title'] > ul > li");
    await expect(missed).toHaveCount(11);
    await expect(page.locator("section[aria-labelledby='missed-title'] .fict")).toHaveText(Array.from({ length: 11 }, () => "chi tiết hư cấu"));

    // Not reported yet: the button is there and the session row is clean.
    expect((await db.session(sessionId)).problemReportedAt).toBeNull();
    await page.getByRole("button", { name: "Kịch bản này có vấn đề" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã ghi nhận báo cáo của bạn." })).toBeVisible();
    expect((await db.session(sessionId)).problemReportedAt).not.toBeNull();
    await page.reload();
    await expect(page.getByText("Đã ghi nhận báo cáo của bạn.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kịch bản này có vấn đề" })).toHaveCount(0);
  });

  test("is another learner's 'not found' everywhere: the prep screen, the session, the attempt and the report", async ({ page, context, browser }) => {
    const { userId, sessionId, personaId } = await playableTopic(page, context, "ct-owner");
    const [attempt] = await db.attemptsOf(userId);

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    // A visitor first: the custom persona has no public prep screen.
    expect((await other.goto(`/prep/${personaId}`))!.status()).toBe(404);
    await signInAndAccept(other, otherContext, "ct-stranger");

    expect((await other.goto(`/prep/${personaId}`))!.status()).toBe(404);
    expect((await other.goto(`/sessions/${sessionId}`))!.status()).toBe(404);
    expect((await other.request.get(`/api/custom-topics/${attempt.id}`)).status()).toBe(404);
    expect((await other.request.post(`/api/sessions/${sessionId}/report-problem`)).status()).toBe(404);
    expect((await postTurn(other.request, sessionId, { text: "Chị kể em nghe được không ạ?", expectedIndex: 1 })).status).toBe(404);
    await other.goto("/my-sessions");
    await expect(other.getByRole("heading", { level: 2, name: "Bạn chưa luyện buổi nào" })).toBeVisible();
    // The owner still has it.
    expect((await page.request.get(`/api/custom-topics/${attempt.id}`)).status()).toBe(200);
    await otherContext.close();
  });
});

test.describe("Màn 11: a topic that does not pass", () => {
  test("says why with the fixed sentence, keeps the free scenario, and 'Thử lại' fills the form for a new session in the same topic", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-invalid");
    await focusBox(page).fill("em hay hỏi dẫn dắt");
    const failedId = await startAttempt(page, `${TOPIC} [stub:invalid]`);

    await expect(page.getByRole("heading", { level: 1, name: "Kịch bản này chưa qua kiểm tra nên chúng tôi không cho bạn luyện với nó." })).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(`/sessions/${failedId}`);
    await expect(page).toHaveTitle("Chưa qua kiểm tra · InterviewLab");
    await expect(page.getByText("Kịch bản miễn phí của bạn vẫn còn.")).toBeVisible();
    const facts = page.locator(".failed-facts");
    await expect(facts).toContainText(`${TOPIC} [stub:invalid]`);
    await expect(facts).toContainText("Nhân vật chưa đủ chặt chẽ");
    await expect(page.getByText("Còn 2 lần thử hôm nay")).toBeVisible();
    await expect(page.locator(".failed-card").getByText("Kiểm tra nhẹ")).toBeVisible();
    expect(await db.sessionsOf(userId)).toMatchObject([{ id: failedId, status: "failed_eval", scenarioId: null }]);
    expect((await db.user(userId)).freeCustomUsed).toBe(false);

    await page.goto("/my-sessions");
    const row = page.locator(`.srows a[href="/sessions/${failedId}"]`);
    await expect(row).toContainText(`${TOPIC} [stub:invalid]`);
    await expect(row).toContainText("Chưa qua kiểm tra");
    await row.click();

    await page.getByRole("link", { name: "Thử lại" }).click();
    await expect(page).toHaveURL(`/custom-topic?retry=${failedId}`);
    await expect(topicBox(page)).toHaveValue(`${TOPIC} [stub:invalid]`);
    await expect(focusBox(page)).toHaveValue("em hay hỏi dẫn dắt");
    await expect(quotaLine(page)).toHaveText("Còn 1 kịch bản miễn phí · 2 lần thử hôm nay");

    const secondId = await startAttempt(page, TOPIC);
    expect(secondId).not.toBe(failedId);
    await expect(page).toHaveURL(/\/prep\/custom-/u, { timeout: 60_000 });
    const attempts = await db.attemptsOf(userId);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual(["passed", "failed"]);
    // A new session, in the same custom topic.
    expect(attempts[0].topicId).toBe(attempts[1].topicId);
    expect((await db.sessionsOf(userId)).map((session) => session.status).sort()).toEqual(["failed_eval", "interviewing"]);
  });

  test("names the safety check when the generated persona asserts something about a real company, and shows none of it", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-unsafe");
    await startAttempt(page, `${TOPIC} [stub:unsafe]`);

    await expect(page.locator(".failed-facts")).toContainText("Nội dung sinh ra không qua kiểm tra an toàn", { timeout: 60_000 });
    await expect(page.getByText("Vinamilk")).toHaveCount(0);
    expect(await db.attemptsOf(userId)).toMatchObject([{ outcome: "failed", failureCode: "unsafe_output", scenarioId: null }]);
    expect((await db.user(userId)).customFailedCount).toBe(1);
  });

  test("does not count a system error: the attempts of the day are all still there", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-syserr");
    await startAttempt(page, `${TOPIC} [stub:fail-gen]`);

    await expect(page.locator(".failed-facts")).toContainText("Lỗi hệ thống (lần thử này không bị tính)", { timeout: 60_000 });
    await expect(page.getByText("Còn 3 lần thử hôm nay")).toBeVisible();
    expect(await db.attemptsOf(userId)).toMatchObject([{ outcome: "system_error", failureCode: "system_error" }]);
    expect(await db.user(userId)).toMatchObject({ customFailedCount: 0, freeCustomUsed: false });

    await page.getByRole("link", { name: "Thử lại" }).click();
    await expect(quotaLine(page)).toHaveText("Còn 1 kịch bản miễn phí · 3 lần thử hôm nay");
  });

  test("closes an attempt nobody finished within its ten minutes, and a runner that comes back changes nothing", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-expired");
    const sessionId = await startAttempt(page, `${TOPIC} [stub:slow-gen]`);
    const [attempt] = await db.attemptsOf(userId);
    await expect(stepState(page, "Đang tạo nhân vật")).toHaveAttribute("aria-current", "step");

    // The runner is still waiting for the generator when the attempt's time runs out.
    await db.expireAttempt(attempt.id);
    await expect(page.locator(".failed-facts")).toContainText("Lỗi hệ thống (lần thử này không bị tính)", { timeout: 15_000 });
    expect(await db.attemptsOf(userId)).toMatchObject([{ outcome: "system_error" }]);

    // The generator answers a few seconds later and the runner finishes its work: nothing may come of it.
    await page.waitForTimeout(8_000);
    expect(await db.attemptsOf(userId)).toMatchObject([{ id: attempt.id, outcome: "system_error", scenarioId: null, draft: null }]);
    expect(await db.sessionsOf(userId)).toMatchObject([{ id: sessionId, status: "failed_eval", scenarioId: null }]);
    expect(await db.user(userId)).toMatchObject({ customFailedCount: 0, freeCustomUsed: false });
    await page.reload();
    await expect(page.locator(".failed-facts")).toContainText("Lỗi hệ thống (lần thử này không bị tính)");
  });
});

test.describe("a function that is cut off: the attempt goes on from what was stored", () => {
  test("the screen that is waiting starts the next run when the first one stopped answering, and the scenario is made once", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-takeover");
    const sessionId = await startAttempt(page, `${TOPIC} [stub:slow-gen]`);
    const [attempt] = await db.attemptsOf(userId);
    await expect(stepState(page, "Đang tạo nhân vật")).toHaveAttribute("aria-current", "step");

    // To the database the first runner looks dead (as when the platform ends its function).
    await db.stopAttemptHeartbeat(attempt.id);

    // The page is only polling: that is enough for a second run to take the attempt over and finish it.
    await expect(page).toHaveURL(/\/prep\/custom-[0-9a-f-]{36}$/u, { timeout: 60_000 });
    const [after] = await db.attemptsOf(userId);
    expect(after).toMatchObject({ id: attempt.id, outcome: "passed", runAttempt: 2, draft: null });
    expect(await db.sessionsOf(userId)).toMatchObject([{ id: sessionId, status: "interviewing", scenarioId: after.scenarioId }]);
    // The first runner, once its generator answered, wrote nothing: one scenario, one opening turn.
    await page.waitForTimeout(5_000);
    expect(await db.generatedScenariosOf(userId)).toHaveLength(1);
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    expect((await db.user(userId)).freeCustomUsed).toBe(true);
  });

  test("a scenario stored by a run that died is only safety-checked by the next one: opening Buổi của tôi is enough", async ({ page, context }) => {
    const { userId } = await openForm(page, context, "ct-resume");
    const sessionId = await startAttempt(page, `${TOPIC} [stub:slow-gen]`);
    const [attempt] = await db.attemptsOf(userId);
    // The learner leaves the waiting screen, so nothing polls the attempt.
    await page.goto("/");
    // Wait for the first run to store its draft, then make it look as if its function died right there.
    await expect.poll(async () => (await db.attemptsOf(userId))[0].outcome, { timeout: 30_000 }).toBe("passed");
    await db.rewindToDraft(attempt.id, sessionId);
    const callsBefore = (await db.generationCallsOf(attempt.id)).length;

    await page.goto("/my-sessions");
    await expect.poll(async () => (await db.attemptsOf(userId))[0].outcome, { timeout: 30_000 }).toBe("passed");

    const calls = (await db.generationCallsOf(attempt.id)).slice(callsBefore).map((call) => call.role);
    expect(calls).toEqual(["SAFETY"]);
    expect((await db.attemptsOf(userId))[0]).toMatchObject({ runAttempt: 2, draft: null });
    await page.reload();
    await expect(page.locator(`.srows a[href="/sessions/${sessionId}"]`)).toContainText("Chị Mai");
  });

});
