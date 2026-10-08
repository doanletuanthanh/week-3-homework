import { expect, test, type Locator, type Page } from "@playwright/test";
import { findSealed, readChiThu } from "../helpers/sealed-strings";
import { signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { ask, composer, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { endButton, endDialog, endedHeading, expectSavedNotes, notes, playTurns, postEnd, putNotes, startInterview } from "./helpers/interview";
import { postTurn } from "./helpers/turn-api";

const scenario = readChiThu();
const RESEARCH_GOAL = "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?";
const NOTES_NOT_SAVED = "Ghi chú chưa lưu được, đang thử lại";
const NOT_CONNECTED = "Không kết nối được. Thử lại.";
const NOTES_ROUTE = "**/api/sessions/*/notes";
const TURNS_ROUTE = "**/api/sessions/*/turns";

const isFocused = (locator: Locator) => locator.evaluate((element) => element === document.activeElement);

/** Moves focus with the keyboard alone until it is on `target`. */
async function tabTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab" = "Tab") {
  for (let presses = 0; presses < 40; presses += 1) {
    if (await isFocused(target)) return;
    await page.keyboard.press(key);
  }
  expect(await isFocused(target), "the element was never reached with the keyboard").toBe(true);
}

test.describe("Màn 4: what the interview screen shows", () => {
  test("a new session shows the bar, the opening line alone, an empty notepad and the composer", async ({ page, context }) => {
    await startInterview(page, context, "screen-empty");

    await expect(page).toHaveTitle("Buổi phỏng vấn người dùng với chị Thu · InterviewLab");
    const bar = page.locator(".sbar");
    await expect(bar.getByRole("heading", { level: 1 })).toHaveText("Buổi phỏng vấn người dùng với Chị Thu");
    await expect(bar.getByRole("button", { name: `Câu hỏi nghiên cứu: ${RESEARCH_GOAL}` })).toBeVisible();
    await expect(bar).toContainText("Lượt");
    await expect(bar.locator(".code")).toHaveText("0/30");
    await expect(bar.getByText("Chị Thu đang giữ 11 điều chưa nói")).toBeVisible();
    await expect(endButton(page)).toBeEnabled();

    await expect(page.locator(".bubble-p")).toHaveCount(1);
    await expect(page.locator(".bubble-p")).toContainText("Chào em, chị là Thu.");
    await expect(page.locator(".bubble-me")).toHaveCount(0);
    await expect(composer(page)).toHaveAttribute("placeholder", "Hỏi chị Thu…");
    await expect(notes(page)).toHaveValue("");
    await expect(notes(page)).toHaveAttribute("placeholder", "Ghi điều bạn thấy quan trọng…");
    // The interview fills the screen: no site footer under it.
    await expect(page.locator(".ftr")).toBeHidden();
  });

  test("the turn count follows the turns; the seal counter never changes", async ({ page, context }) => {
    await startInterview(page, context, "screen-count");
    const bar = page.locator(".sbar");

    await ask(page, "Chị làm nghề gì ạ?", 1);
    await expect(bar.locator(".code")).toHaveText("1/30");
    await ask(page, "Chị hay ăn trưa ở đâu ạ?", 2);
    await expect(bar.locator(".code")).toHaveText("2/30");
    await expect(bar.getByText("Chị Thu đang giữ 11 điều chưa nói")).toBeVisible();
    await expect(page.locator(".msg-meta .time")).toHaveText(["lượt 01", "lượt 02"]);

    await page.reload();
    await expect(bar.locator(".code")).toHaveText("2/30");
    await expect(bar.getByText("Chị Thu đang giữ 11 điều chưa nói")).toBeVisible();
  });

  test("shows nothing sealed and nothing about labels, hooks or opened items", async ({ page, context }) => {
    await startInterview(page, context, "screen-sealed");
    await ask(page, "Chị có hay ghi lại chi tiêu không ạ?", 1);
    await notes(page).fill("kế toán, từng thử ghi chép rồi bỏ?");
    await page.reload();
    await expect(page.locator(".bubble-p")).toHaveCount(2);

    expect(findSealed(await page.content(), scenario)).toEqual([]);
    const shown = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["nhãn", "openness", "hook", "dẫn dắt", "mở khóa", "đã mở", "gợi ý"]) expect(shown).not.toContain(word);
    // The seal counter is the only number about the items, and it is the total.
    expect(shown).not.toMatch(/\d+\s*\/\s*11|\d+ trên 11/);
  });

  test("the new reply is read out once through a polite live region, not piece by piece", async ({ page, context }) => {
    await startInterview(page, context, "screen-live");
    const announcer = page.locator("main > p[aria-live=polite]");
    await expect(announcer).toHaveText("");
    await expect(page.locator(".chat-log")).not.toHaveAttribute("aria-live");

    await composer(page).fill("Chị kể từ từ thôi nha [stub:slow]");
    await sendButton(page).click();
    // "Đang gõ" is announced while nothing has arrived; the pieces of the reply are not.
    await expect(announcer).toHaveText("Chị Thu đang gõ…");
    await expect(page.locator(".typing").filter({ hasText: "Chị Thu đang gõ…" })).toBeVisible();
    await expect(page.locator("[data-streaming]")).toBeVisible();
    await expect(announcer).toHaveText("");

    await expect(page.locator("[data-streaming]")).toHaveCount(0);
    await expect(announcer).toHaveText("Chị Thu: Chị trả lời câu thứ 1 (trong khối dữ liệu).");
  });

  test("a session that does not exist and someone else's session get the same page", async ({ page, context, browser }) => {
    const { sessionId } = await startInterview(page, context, "screen-missing");

    const missing = await page.goto("/sessions/00000000-0000-4000-8000-000000000000");
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Không tìm thấy buổi này." })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Buổi của tôi", exact: true })).toHaveAttribute("href", "/my-sessions");

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signInAsNewLearner(otherContext, uniqueEmail("screen-intruder"));
    await other.goto("/data-notice?next=/");
    await other.getByRole("button", { name: "Tôi hiểu" }).click();
    const theirs = await other.goto(`/sessions/${sessionId}`);
    expect(theirs?.status()).toBe(404);
    await expect(other.getByRole("heading", { name: "Không tìm thấy buổi này." })).toBeVisible();
    await expect(other.locator(".sbar, .bubble-p")).toHaveCount(0);
    await otherContext.close();
  });
});

test.describe("notes canvas: autosave and restore", () => {
  test("saves without a word, and the notes are there again after a reload", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "notes-save");
    const typed = "kế toán, 8h–6h, ăn trưa với đồng nghiệp\ntừng thử ghi chép rồi bỏ?";

    await notes(page).fill(typed);
    await expectSavedNotes(sessionId, typed);
    // Silent: no "saved" line, no counter, no count against a total.
    await expect(page.locator(".notes-status")).toBeEmpty();
    await expect(page.locator(".notepad-title")).toHaveText("Ghi chú");

    await page.reload();
    await expect(notes(page)).toHaveValue(typed);
    // Nothing ended and nothing froze by taking notes.
    expect(await db.session(sessionId)).toMatchObject({ endedAt: null, canvasFrozenAt: null, canvasTokens: null });
  });

  test("the saved notes come back in another browser: they are on the server, not only in this one", async ({ page, context, browser }) => {
    const { sessionId, email } = await startInterview(page, context, "notes-device");
    await notes(page).fill("ghi ở máy thứ nhất");
    await expectSavedNotes(sessionId, "ghi ở máy thứ nhất");

    const secondContext = await browser.newContext();
    await signIn(secondContext, email);
    const second = await secondContext.newPage();
    await second.goto(`/sessions/${sessionId}`);
    // No question was asked yet, so the session opens on Màn 3 in a browser that has not entered it.
    await second.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
    await expect(notes(second)).toHaveValue("ghi ở máy thứ nhất");
    await secondContext.close();
  });

  test("leaving the page right after typing still saves: the text does not wait for the pause", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "notes-leave");

    await notes(page).fill("gõ xong là đóng tab ngay");
    await page.goto("/");

    await expectSavedNotes(sessionId, "gõ xong là đóng tab ngay");
    await page.goto(`/sessions/${sessionId}`);
    await expect(notes(page)).toHaveValue("gõ xong là đóng tab ngay");
  });

  test("the notes can be written while the persona is typing", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "notes-typing");

    await composer(page).fill("Chị kể từ từ thôi nha [stub:slow]");
    await sendButton(page).click();
    await expect(page.locator("[data-streaming]")).toBeVisible();
    await expect(composer(page)).toBeDisabled();
    await expect(notes(page)).toBeEnabled();
    await notes(page).fill("ghi trong lúc chị Thu đang gõ");
    await expect(page.locator("[data-streaming]")).toBeVisible();

    await expect(page.locator("[data-streaming]")).toHaveCount(0);
    await expect(notes(page)).toHaveValue("ghi trong lúc chị Thu đang gõ");
    await expectSavedNotes(sessionId, "ghi trong lúc chị Thu đang gõ");
    // Focus stayed in the notes: the composer coming back did not take it.
    expect(await isFocused(notes(page))).toBe(true);
  });

  test("two failed saves in a row show a small line; the text stays and is saved when the server is back", async ({ page, context }) => {
    test.setTimeout(60_000);
    const { sessionId } = await startInterview(page, context, "notes-fail");
    let failed = 0;
    await page.route(NOTES_ROUTE, (route) => {
      if (failed < 2) {
        failed += 1;
        return route.abort();
      }
      return route.continue();
    });

    await notes(page).fill("ghi chú không được mất");
    const line = page.locator(".notes-status");
    // One failure is not worth a word.
    await expect.poll(() => failed).toBe(1);
    await expect(line).toBeEmpty();

    await expect(line).toHaveText(NOTES_NOT_SAVED, { timeout: 10_000 });
    await expect(line).toHaveAttribute("role", "status");
    await expect(notes(page)).toHaveValue("ghi chú không được mất");
    expect((await db.session(sessionId)).canvasText).toBe("");

    await expect(line).toBeEmpty({ timeout: 10_000 });
    await expectSavedNotes(sessionId, "ghi chú không được mất");
  });

  test("the notepad holds 5,000 characters, and the server holds the same line itself", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "notes-limit");
    await expect(notes(page)).toHaveAttribute("maxlength", "5000");

    expect(await putNotes(page.request, sessionId, { text: "a".repeat(5000) })).toEqual({ status: 200, json: { saved: true } });
    for (const body of [{ text: "a".repeat(5001) }, { text: 12 }, { text: null }, {}, { notes: "sai tên trường" }]) {
      expect(await putNotes(page.request, sessionId, body), JSON.stringify(body).slice(0, 40)).toEqual({ status: 400, json: { error: "invalid_input" } });
    }
    expect(await putNotes(page.request, sessionId, "{not json")).toMatchObject({ status: 400 });
    expect((await db.session(sessionId)).canvasText).toHaveLength(5000);
  });

  test("learner markup in the notes is kept as text and never runs", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "notes-escape");
    const hostile = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;

    await notes(page).fill(hostile);
    await expectSavedNotes(sessionId, hostile);
    await page.reload();

    await expect(notes(page)).toHaveValue(hostile);
    expect(await page.locator(".iv-notes img, .iv-notes script").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe("notes and end API: who may call them and what they answer", () => {
  test("answer with one field each and nothing about the analysis", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "api-keys");
    await ask(page, "Chị có hay ghi lại chi tiêu không ạ?", 1);

    const saved = await putNotes(page.request, sessionId, { text: "ghi chú" });
    const ended = await postEnd(page.request, sessionId, { canvasText: "ghi chú cuối" });
    const late = await putNotes(page.request, sessionId, { text: "sửa sau khi kết thúc" });
    const again = await postEnd(page.request, sessionId, { canvasText: "kết thúc lần nữa" });

    expect(saved).toEqual({ status: 200, json: { saved: true } });
    expect(ended).toEqual({ status: 200, json: { ended: true } });
    expect(late).toEqual({ status: 409, json: { error: "frozen" } });
    expect(again).toEqual({ status: 200, json: { ended: true } });
    for (const reply of [saved, ended, late, again]) {
      expect(JSON.stringify(reply.json)).not.toMatch(/label|verdict|hook|unlock|openness|topic_tags|analysis|decision|snapshot|item|canvas/i);
    }
    expect((await db.session(sessionId)).canvasText).toBe("ghi chú cuối");
  });

  test("another learner can neither write the notes nor end the session", async ({ page, context, browser }) => {
    const { sessionId } = await startInterview(page, context, "api-owner");
    await putNotes(page.request, sessionId, { text: "của chủ buổi" });

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signInAsNewLearner(otherContext, uniqueEmail("api-intruder"));
    await other.goto("/data-notice?next=/");
    await other.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(other).toHaveURL("/");

    expect(await putNotes(other.request, sessionId, { text: "ghi đè" })).toEqual({ status: 404, json: { error: "not_found" } });
    expect(await postEnd(other.request, sessionId, { canvasText: "phá" })).toEqual({ status: 404, json: { error: "not_found" } });
    expect(await putNotes(other.request, "abc", { text: "x" })).toEqual({ status: 404, json: { error: "not_found" } });
    expect(await postEnd(other.request, "abc", { canvasText: "x" })).toEqual({ status: 404, json: { error: "not_found" } });
    await otherContext.close();

    expect(await db.session(sessionId)).toMatchObject({ canvasText: "của chủ buổi", endedAt: null, canvasFrozenAt: null });
  });

  test("a signed-out request and one without consent are sent to sign in or to the notice", async ({ page, context, browser }) => {
    const { sessionId } = await startInterview(page, context, "api-auth");
    const next = encodeURIComponent(`/sessions/${sessionId}`);

    const guest = await browser.newContext();
    expect(await putNotes(guest.request, sessionId, { text: "x" })).toEqual({ status: 401, json: { error: "unauthorized", redirectTo: `/sign-in?next=${next}` } });
    expect(await postEnd(guest.request, sessionId, { canvasText: "x" })).toMatchObject({ status: 401, json: { error: "unauthorized" } });
    await guest.close();

    const noConsent = await browser.newContext();
    await signInAsNewLearner(noConsent, uniqueEmail("api-no-consent"));
    expect(await putNotes(noConsent.request, sessionId, { text: "x" })).toEqual({ status: 403, json: { error: "notice_required", redirectTo: `/data-notice?next=${next}` } });
    expect(await postEnd(noConsent.request, sessionId, { canvasText: "x" })).toMatchObject({ status: 403, json: { error: "notice_required" } });
    await noConsent.close();

    expect(await db.session(sessionId)).toMatchObject({ canvasText: "", endedAt: null });
  });
});

test.describe("ending the session", () => {
  test('"Kết thúc buổi" asks first; "Hỏi tiếp" and Esc go back to the interview with nothing changed', async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "end-cancel");
    await notes(page).fill("ghi chú");

    await endButton(page).click();
    await expect(endDialog(page)).toBeVisible();
    await endDialog(page).getByRole("button", { name: "Hỏi tiếp" }).click();
    await expect(endDialog(page)).toBeHidden();

    await endButton(page).click();
    await expect(endDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(endDialog(page)).toBeHidden();

    expect(await db.session(sessionId)).toMatchObject({ endedAt: null, canvasFrozenAt: null });
    await ask(page, "Em hỏi tiếp ạ?", 1);
  });

  test("confirming ends the session and freezes the notes, including text that was never autosaved", async ({ page, context }) => {
    const { sessionId, userId } = await startInterview(page, context, "end-freeze");
    await ask(page, "Chị làm nghề gì ạ?", 1);
    await notes(page).fill("đã tự lưu");
    await expectSavedNotes(sessionId, "đã tự lưu");
    // From here no autosave gets through: only the end request can carry what is typed next.
    await page.route(NOTES_ROUTE, (route) => route.abort());
    await notes(page).fill("đã tự lưu\nvà phần đang gõ dở");

    await endButton(page).click();
    await endDialog(page).getByRole("button", { name: "Kết thúc buổi" }).click();

    await expect(endedHeading(page)).toBeVisible();
    await expect(page.getByRole("slider", { name: "Số điều chị Thu đã kể" })).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    await expect(notes(page)).toHaveCount(0);
    await expect(page).toHaveURL(`/sessions/${sessionId}`);

    const session = await db.session(sessionId);
    expect(session).toMatchObject({
      status: "interviewing",
      canvasText: "đã tự lưu\nvà phần đang gõ dở",
      canvasTokens: ["đã", "tự", "lưu", "và", "phần", "đang", "gõ", "dở"],
      deviceClass: "desktop",
    });
    expect(session.endedAt).not.toBeNull();
    expect(session.canvasFrozenAt).not.toBeNull();
    const events = await db.eventsOf(sessionId);
    expect(events.map((event) => event.name)).toEqual(["session_started", "turn", "session_ended"]);
    expect(events[2]).toMatchObject({ userId, props: { canvas_empty: false, device_class: "desktop" } });
  });

  test("after the end the URL shows the ended session, the notes cannot change and no question is taken", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "end-after");
    await notes(page).fill("bản cuối");
    await endButton(page).click();
    await endDialog(page).getByRole("button", { name: "Kết thúc buổi" }).click();
    await expect(endedHeading(page)).toBeVisible();

    expect(await putNotes(page.request, sessionId, { text: "sửa lại" })).toEqual({ status: 409, json: { error: "frozen" } });
    const turn = await postTurn(page.request, sessionId, { text: "Còn hỏi được không ạ?", expectedIndex: 1 });
    expect(turn.json).toEqual({ error: "session_ended" });
    expect((await db.session(sessionId)).canvasText).toBe("bản cuối");

    // The state decides the screen, whichever screen was open before.
    await page.goto("/prep/chi-thu");
    await page.getByRole("link", { name: "Tiếp tục buổi luyện" }).click();
    await expect(endedHeading(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL("/prep/chi-thu");
  });

  test("ending with an empty notepad is recorded as an empty canvas", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "end-empty");
    await endButton(page).click();
    await endDialog(page).getByRole("button", { name: "Kết thúc buổi" }).click();
    await expect(endedHeading(page)).toBeVisible();

    expect(await db.session(sessionId)).toMatchObject({ canvasText: "", canvasTokens: [], deviceClass: null });
    expect((await db.eventsOf(sessionId)).at(-1)).toMatchObject({ name: "session_ended", props: { canvas_empty: true, device_class: null } });
  });

  test('"Kết thúc buổi" is locked while a turn is being written, and the server refuses the end too', async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "end-busy");

    await composer(page).fill("Chị kể từ từ thôi nha [stub:slow]");
    await sendButton(page).click();
    await expect(page.locator("[data-streaming]")).toBeVisible();
    await expect(endButton(page)).toBeDisabled();
    expect(await postEnd(page.request, sessionId, { canvasText: "chen ngang" })).toEqual({ status: 409, json: { error: "in_flight" } });

    await expect(page.locator("[data-streaming]")).toHaveCount(0);
    await expect(endButton(page)).toBeEnabled();
    // The turn that was running was written whole, and the session is still open.
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
    expect(await db.session(sessionId)).toMatchObject({ endedAt: null, canvasFrozenAt: null, canvasText: "" });
  });

  test("a failed end request keeps the dialog open with the standard error, and works when tried again", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "end-error");
    await notes(page).fill("vẫn còn nguyên");
    let failed = 0;
    await page.route("**/api/sessions/*/end", (route) => {
      if (failed < 1) {
        failed += 1;
        return route.abort();
      }
      return route.continue();
    });

    await endButton(page).click();
    const confirm = endDialog(page).getByRole("button", { name: "Kết thúc buổi" });
    await confirm.click();

    await expect(endDialog(page).getByRole("alert")).toHaveText(NOT_CONNECTED);
    await expect(endDialog(page)).toBeVisible();
    await expect(notes(page)).toHaveValue("vẫn còn nguyên");
    expect((await db.session(sessionId)).endedAt).toBeNull();

    await confirm.click();
    await expect(endedHeading(page)).toBeVisible();
    expect((await db.session(sessionId)).canvasText).toBe("vẫn còn nguyên");
  });
});

test.describe("turn 30 ends the session by itself", () => {
  test("freezes the notes with what was typed while the last reply was being written", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { sessionId } = await startInterview(page, context, "thirty-notes");
    await playTurns(page.request, sessionId, 1, 29);
    await page.reload();
    await expect(page.locator(".sbar .code")).toHaveText("29/30");
    // No autosave gets through, so the frozen text can only have come with the end request.
    await page.route(NOTES_ROUTE, (route) => route.abort());
    await notes(page).fill("trước lượt 30");

    await composer(page).fill("Câu cuối cùng của em ạ [stub:slow]");
    await sendButton(page).click();
    await expect(page.locator("[data-streaming]")).toBeVisible();
    await notes(page).pressSequentially(", gõ thêm khi chị đang trả lời");

    // No dialog and no button: the session moves on by itself.
    await expect(endedHeading(page)).toBeVisible({ timeout: 15_000 });
    await expect(endDialog(page)).toHaveCount(0);

    const session = await db.session(sessionId);
    expect(session.canvasText).toBe("trước lượt 30, gõ thêm khi chị đang trả lời");
    expect(session.canvasFrozenAt).not.toBeNull();
    expect(session.endedAt).not.toBeNull();
    expect(await db.turnsOf(sessionId)).toHaveLength(31);
    expect((await db.eventsOf(sessionId)).filter((event) => event.name === "session_ended")).toHaveLength(1);
  });

  test("a reload after a failed end request still freezes the notes this browser holds", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { sessionId } = await startInterview(page, context, "thirty-retry");
    await playTurns(page.request, sessionId, 1, 29);
    await page.reload();
    // A bad connection: neither the autosave nor the end request gets through.
    await page.route(NOTES_ROUTE, (route) => route.abort());
    await page.route("**/api/sessions/*/end", (route) => route.abort());
    await notes(page).fill("ghi chú chưa tới được server");

    await composer(page).fill("Câu cuối cùng của em ạ");
    await sendButton(page).click();
    await expect(page.locator(".iv-compose").getByRole("alert")).toContainText("Buổi luyện chưa kết thúc được.");
    await expect(composer(page)).toBeDisabled();
    await expect(notes(page)).toHaveValue("ghi chú chưa tới được server");
    expect((await db.session(sessionId)).canvasFrozenAt).toBeNull();

    // The learner reloads instead of pressing the button; the connection is back.
    await page.unroute(NOTES_ROUTE);
    await page.unroute("**/api/sessions/*/end");
    await page.reload();

    await expect(endedHeading(page)).toBeVisible();
    const session = await db.session(sessionId);
    expect(session.canvasText).toBe("ghi chú chưa tới được server");
    expect(session.canvasFrozenAt).not.toBeNull();
  });

  test("when the browser never sends the final notes, the next visit freezes the last autosaved text", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { sessionId } = await startInterview(page, context, "thirty-abandoned");
    await notes(page).fill("bản tự lưu cuối cùng");
    await expectSavedNotes(sessionId, "bản tự lưu cuối cùng");
    // The tab is gone; the thirtieth turn is answered without a page to follow it up.
    await page.goto("/");
    await playTurns(page.request, sessionId, 1, 30);
    expect(await db.session(sessionId)).toMatchObject({ canvasFrozenAt: null, canvasTokens: null });
    expect((await db.session(sessionId)).endedAt).not.toBeNull();

    await page.goto(`/sessions/${sessionId}`);

    await expect(endedHeading(page)).toBeVisible();
    const session = await db.session(sessionId);
    expect(session).toMatchObject({ canvasText: "bản tự lưu cuối cùng", canvasTokens: ["bản", "tự", "lưu", "cuối", "cùng"] });
    expect(session.canvasFrozenAt).not.toBeNull();
    expect((await db.eventsOf(sessionId)).at(-1)).toMatchObject({ name: "session_ended", props: { canvas_empty: false } });
    expect(await putNotes(page.request, sessionId, { text: "đến muộn" })).toEqual({ status: 409, json: { error: "frozen" } });
  });
});

test.describe("what is typed survives", () => {
  test("an unsent question is still there after a reload", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "draft-reload");

    await composer(page).fill("Câu em đang gõ dở");
    await page.reload();

    await expect(composer(page)).toHaveValue("Câu em đang gõ dở");
    await expect(sendButton(page)).toBeEnabled();
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
  });

  test("notes the server never got are kept in the browser, shown again and saved without another keystroke", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "draft-notes");
    const draftKey = `il:draft:notes:${sessionId}`;
    const baseKey = `il:draft:notes-base:${sessionId}`;
    await page.route(NOTES_ROUTE, (route) => route.abort());

    await notes(page).fill("ghi chú chưa kịp lưu");
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe("ghi chú chưa kịp lưu");
    expect((await db.session(sessionId)).canvasText).toBe("");

    expect(await page.evaluate((key) => localStorage.getItem(key), baseKey)).toBe("");

    // A later visit finds a draft the server does not have (the page before it could not save).
    await page.unroute(NOTES_ROUTE);
    await page.evaluate((key) => localStorage.setItem(key, "bản nháp còn trong trình duyệt"), draftKey);
    await page.reload();

    await expect(notes(page)).toHaveValue("bản nháp còn trong trình duyệt");
    await expectSavedNotes(sessionId, "bản nháp còn trong trình duyệt");
    // Once the server has the text the browser copy is dropped.
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  });

  test("an expired sign-in returns to the same session with the question and the notes intact", async ({ page, context }) => {
    const { sessionId, email } = await startInterview(page, context, "draft-expired");
    await ask(page, "Chị làm nghề gì ạ?", 1);
    const authCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
    await context.clearCookies({ name: new RegExp(authCookies.map((cookie) => cookie.name).join("|")) });

    await composer(page).fill("Câu hỏi lúc đã hết phiên");
    await notes(page).fill("ghi chú lúc đã hết phiên");
    await sendButton(page).click();
    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(`/sessions/${sessionId}`)}`);
    expect(await db.turnsOf(sessionId)).toHaveLength(2);

    // The learner signs in again (the Google round trip is replaced by the fixture) and lands back.
    await signIn(context, email);
    await page.goto(`/sessions/${sessionId}`);

    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();
    await expect(composer(page)).toHaveValue("Câu hỏi lúc đã hết phiên");
    await expect(notes(page)).toHaveValue("ghi chú lúc đã hết phiên");
    await expectSavedNotes(sessionId, "ghi chú lúc đã hết phiên");
    await sendButton(page).click();
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 2" })).toBeVisible();
    await expect(composer(page)).toHaveValue("");
  });

  test("a draft older than the notes on the server is dropped instead of overwriting them", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "draft-stale");
    await notes(page).fill("gõ trên máy này");
    await expectSavedNotes(sessionId, "gõ trên máy này");
    // This browser kept a draft typed over the empty canvas; since then the notes grew elsewhere.
    await putNotes(page.request, sessionId, { text: "bản mới hơn, viết tiếp trên điện thoại" });
    await page.evaluate((id) => {
      localStorage.setItem(`il:draft:notes:${id}`, "bản nháp cũ");
      localStorage.setItem(`il:draft:notes-base:${id}`, "");
    }, sessionId);

    await page.reload();

    await expect(notes(page)).toHaveValue("bản mới hơn, viết tiếp trên điện thoại");
    await expect.poll(() => page.evaluate((id) => localStorage.getItem(`il:draft:notes:${id}`), sessionId)).toBeNull();
    expect((await db.session(sessionId)).canvasText).toBe("bản mới hơn, viết tiếp trên điện thoại");
    // Typing on this page still works on top of the newer text.
    await notes(page).fill("bản mới hơn, viết tiếp trên điện thoại, rồi máy này");
    await expectSavedNotes(sessionId, "bản mới hơn, viết tiếp trên điện thoại, rồi máy này");
  });

  test("a sent question does not come back after a reload", async ({ page, context }) => {
    await startInterview(page, context, "draft-sent");
    await ask(page, "Câu đã gửi rồi", 1);
    await page.reload();
    await expect(composer(page)).toHaveValue("");
  });

  test("drafts belong to their session: another learner on the same browser does not get them", async ({ page, context }) => {
    await startInterview(page, context, "draft-first");
    await composer(page).fill("Câu của người thứ nhất");
    await expect(composer(page)).toHaveValue("Câu của người thứ nhất");

    await context.clearCookies();
    await startInterview(page, context, "draft-second");
    await expect(composer(page)).toHaveValue("");
    await expect(notes(page)).toHaveValue("");
  });
});

test.describe("errors under the composer", () => {
  test("a request that cannot be made shows the standard error and keeps the question; the third in a row says the fault is ours", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "errors-three");
    await ask(page, "Câu đầu tiên ạ?", 1);
    await page.route(TURNS_ROUTE, (route) => route.abort());
    const alert = page.locator(".iv-compose").getByRole("alert");

    await composer(page).fill("Câu này gửi không được");
    for (const attempt of [1, 2]) {
      await sendButton(page).click();
      await expect(alert, `attempt ${attempt}`).toHaveText(NOT_CONNECTED);
      await expect(composer(page)).toHaveValue("Câu này gửi không được");
      await expect(composer(page)).toBeEnabled();
    }
    await sendButton(page).click();
    await expect(alert).toHaveText("InterviewLab đang gặp sự cố. Buổi của bạn đã được lưu ở lượt 1; quay lại sau.");
    await expect(composer(page)).toHaveValue("Câu này gửi không được");
    // A system line under the composer, never a chat bubble.
    await expect(page.locator(".bubble-p")).toHaveCount(2);
    await expect(page.locator(".chat-log")).not.toContainText("InterviewLab đang gặp sự cố");
    expect(await db.turnsOf(sessionId)).toHaveLength(2);

    // The count starts again after a reply.
    await page.unroute(TURNS_ROUTE);
    await sendButton(page).click();
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 2" })).toBeVisible();
    await expect(alert).toHaveCount(0);
    await page.route(TURNS_ROUTE, (route) => route.abort());
    await composer(page).fill("Lại không gửi được");
    await sendButton(page).click();
    await expect(alert).toHaveText(NOT_CONNECTED);
  });

  test("three failed model calls in a row switch from the persona line to the incident line", async ({ page, context }) => {
    test.setTimeout(90_000);
    const { sessionId } = await startInterview(page, context, "errors-llm");
    const alert = page.locator(".iv-compose").getByRole("alert");

    await composer(page).fill("Chị kể thêm đi [stub:fail]");
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await sendButton(page).click();
      await expect(alert).toHaveText("Chị Thu chưa nghe rõ. Gửi lại câu hỏi.", { timeout: 20_000 });
      await expect(composer(page)).toBeEnabled();
    }
    await sendButton(page).click();
    await expect(alert).toHaveText("InterviewLab đang gặp sự cố. Buổi của bạn đã được lưu ở lượt 0; quay lại sau.", { timeout: 20_000 });
    await expect(composer(page)).toHaveValue("Chị kể thêm đi [stub:fail]");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
  });
});

test.describe("device class", () => {
  test("a desktop-wide browser is stored as desktop with the first question", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "device-desktop");
    expect((await db.session(sessionId)).deviceClass).toBeNull();
    await ask(page, "Chị làm nghề gì ạ?", 1);
    expect((await db.session(sessionId)).deviceClass).toBe("desktop");
  });

  test("a value the app does not know is ignored", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "device-bogus");
    const response = await page.request.post(`/api/sessions/${sessionId}/turns`, {
      data: { text: "Chị ơi?", expectedIndex: 1, turnKey: "0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a11" },
      headers: { "content-type": "application/json", "x-device-class": "tablet'; DROP TABLE session; --" },
    });
    expect(response.status()).toBe(200);
    await response.text();
    expect((await db.session(sessionId)).deviceClass).toBeNull();
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
  });
});

test.describe("keyboard only", () => {
  test("Màn 3 to Màn 4 to the end dialog without a mouse", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("keyboard"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await tabTo(page, page.getByRole("button", { name: "Tôi hiểu" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/prep/chi-thu");

    await tabTo(page, page.getByRole("button", { name: "Bắt đầu" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionId = page.url().split("/").pop()!;

    // Ask a question: Enter sends, and focus is back in the composer when the reply is there.
    await tabTo(page, composer(page));
    await page.keyboard.type("Chị hay ăn trưa ở đâu ạ?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toBeFocused();

    // Notes.
    await tabTo(page, notes(page));
    await page.keyboard.type("ăn trưa với đồng nghiệp");
    await expect(notes(page)).toHaveValue("ăn trưa với đồng nghiệp");

    // The end dialog: opens with focus inside, Esc gives focus back to the button that opened it.
    await tabTo(page, endButton(page), "Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(endDialog(page)).toBeVisible();
    await expect(endDialog(page).getByRole("button", { name: "Hỏi tiếp" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(endDialog(page)).toBeHidden();
    await expect(endButton(page)).toBeFocused();

    await page.keyboard.press("Enter");
    const confirm = endDialog(page).getByRole("button", { name: "Kết thúc buổi" });
    await tabTo(page, confirm);
    // Focus cannot leave the dialog: the page behind it is inert.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest(".sbar, .iv-body, .hdr") ?? null)).toBeNull();
    await tabTo(page, confirm);
    await page.keyboard.press("Enter");

    await expect(endedHeading(page)).toBeVisible();
    expect((await db.session(sessionId)).canvasText).toBe("ăn trưa với đồng nghiệp");
  });
});

test.describe("Màn 3: the button follows the session", () => {
  test("introduces the notes, and offers start, continue or review by the state of the session", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("prep-states"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await expect(page.getByText("Ghi chú trong buổi")).toBeVisible();
    await expect(
      page.getByText("Ghi lại điều bạn thấy quan trọng trong lúc nghe. Cuối buổi, chúng tôi đối chiếu ghi chú với những gì chị Thu đã nói. Ghi chú là tùy chọn."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionId = page.url().split("/").pop()!;

    // Zero learner turns, some turns, ended: all unfinished.
    await page.goto("/prep/chi-thu");
    const resume = page.getByRole("link", { name: "Tiếp tục buổi luyện" });
    // No question yet: the button is the press that leads into the interview.
    await expect(page.getByRole("button", { name: "Tiếp tục buổi luyện" })).toBeVisible();
    await expect(resume).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toHaveCount(0);
    await postEnd(page.request, sessionId, { canvasText: "" });
    await page.reload();
    await expect(resume).toHaveAttribute("href", `/sessions/${sessionId}`);

    await db.setSessionStatus(sessionId, "done");
    await page.reload();
    await expect(page.getByRole("link", { name: "Xem lại kết quả" })).toHaveAttribute("href", `/sessions/${sessionId}`);
    await expect(resume).toHaveCount(0);

    // A withdrawn session does not count: the learner may start again.
    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible();
  });

  test("a failed start shows the standard error and offers the button again", async ({ page }) => {
    await page.goto("/prep/chi-thu?blocked=error");
    await expect(page.locator("main [role=alert]")).toHaveText(NOT_CONNECTED);
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeEnabled();
  });
});
