import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";

/** A consenting learner inside a fresh session with the persona. */
async function startInterview(page: Page, context: BrowserContext, label: string) {
  const userId = await signInAsNewLearner(context, uniqueEmail(label));
  await page.goto("/data-notice?next=/prep/chi-thu");
  await page.getByRole("button", { name: "Tôi hiểu" }).click();
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionId = page.url().split("/").pop()!;
  return { userId, sessionId };
}

const composer = (page: Page) => page.getByLabel("Câu hỏi của bạn");
const sendButton = (page: Page) => page.getByRole("button", { name: "Gửi" });

test.describe("interview", () => {
  test("a question gets a persona reply; the turn and the model call are stored", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "turn");
    await expect(page.getByText("Chào em, chị là Thu.")).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();

    await composer(page).fill("Cuối tháng chị thường xoay xở thế nào ạ?");
    await sendButton(page).click();

    await expect(page.getByText("Chị trả lời câu thứ 1 (trong khối dữ liệu).")).toBeVisible();
    await expect(page.getByText("Cuối tháng chị thường xoay xở thế nào ạ?")).toBeVisible();
    await expect(composer(page)).toHaveValue("");

    const turns = await db.turnsOf(sessionId);
    expect(turns.map((turn) => [turn.index, turn.learnerText, turn.personaText])).toEqual([
      [0, null, expect.stringContaining("chị là Thu")],
      [1, "Cuối tháng chị thường xoay xở thế nào ạ?", "Chị trả lời câu thứ 1 (trong khối dữ liệu)."],
    ]);
    const calls = await db.llmCallsOf(sessionId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ scope: "session", role: "PERSONA", model: "gpt-6-luna", ok: true, attempt: 1, tokensIn: 420, tokensOut: 18 });
    expect(calls[0].costUsd).toBeCloseTo((420 * 0.1 + 18 * 0.5) / 1_000_000, 12);
  });

  test("the turn API returns only the persona text and the turn index", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "api-shape");

    const response = await page.request.post(`/api/sessions/${sessionId}/turns`, { data: { text: "Chị làm nghề gì ạ?" } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ personaText: "Chị trả lời câu thứ 1 (trong khối dữ liệu).", turnIndex: 1 });
  });

  test("Enter sends, Shift+Enter adds a line, and the transcript is sent with later turns", async ({ page, context }) => {
    await startInterview(page, context, "keys");

    await composer(page).fill("Dòng một");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("dòng hai");
    await expect(composer(page)).toHaveValue("Dòng một\ndòng hai");
    await composer(page).press("Enter");
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();

    await composer(page).fill("Câu thứ hai?");
    await composer(page).press("Enter");
    await expect(page.getByText("Chị trả lời câu thứ 2 (trong khối dữ liệu).")).toBeVisible();
  });

  test("the conversation is still there after a reload", async ({ page, context }) => {
    await startInterview(page, context, "reload");
    await composer(page).fill("Chị hay ăn trưa ở đâu?");
    await sendButton(page).click();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();

    await page.reload();

    await expect(page.getByText("Chào em, chị là Thu.")).toBeVisible();
    await expect(page.getByText("Chị hay ăn trưa ở đâu?")).toBeVisible();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();
  });

  test("a failed model call shows an error, keeps the question, writes no turn, and records every attempt", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "failure");

    await composer(page).fill("Chị kể thêm đi [stub:fail]");
    await sendButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "Chưa nhận được câu trả lời" })).toBeVisible();
    await expect(composer(page)).toHaveValue("Chị kể thêm đi [stub:fail]");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    const calls = await db.llmCallsOf(sessionId);
    expect(calls.map((call) => [call.attempt, call.ok])).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ]);

    // The same turn index is used once the provider answers again.
    await composer(page).fill("Chị kể thêm đi");
    await sendButton(page).click();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Chưa nhận được câu trả lời" })).toHaveCount(0);
    expect((await db.turnsOf(sessionId)).map((turn) => turn.index)).toEqual([0, 1]);
  });

  test("learner markup is shown as text and never runs", async ({ page, context }) => {
    await startInterview(page, context, "escape");
    const hostile = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
    let dialogs = 0;
    page.on("dialog", (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });

    await composer(page).fill(hostile);
    await sendButton(page).click();
    await expect(page.getByText("Chị trả lời câu thứ 1")).toBeVisible();
    await expect(page.getByText(hostile)).toBeVisible();
    await page.reload();
    await expect(page.getByText(hostile)).toBeVisible();

    expect(await page.locator(".chat-log img, .chat-log script").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toBe(0);
  });

  test("an over-long or empty question is refused by the API without a model call", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "limits");
    await expect(composer(page)).toHaveAttribute("maxlength", "500");

    for (const text of ["", "   ", "a".repeat(501)]) {
      const response = await page.request.post(`/api/sessions/${sessionId}/turns`, { data: { text } });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_text" });
    }
    const malformed = await page.request.post(`/api/sessions/${sessionId}/turns`, {
      headers: { "content-type": "application/json" },
      data: "{not json",
    });
    expect(malformed.status()).toBe(400);
    expect(await db.llmCallsOf(sessionId)).toHaveLength(0);
  });

  test("another learner cannot open the session or post a turn to it", async ({ page, context, browser }) => {
    const { sessionId } = await startInterview(page, context, "owner");

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signInAsNewLearner(otherContext, uniqueEmail("intruder"));
    await other.goto("/data-notice?next=/");
    await other.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(other).toHaveURL("/");

    const view = await other.goto(`/sessions/${sessionId}`);
    expect(view?.status()).toBe(404);
    await expect(other.getByText("chị là Thu")).toHaveCount(0);

    const post = await other.request.post(`/api/sessions/${sessionId}/turns`, { data: { text: "Cho xem với" } });
    expect(post.status()).toBe(404);
    expect(await post.json()).toEqual({ error: "not_found" });
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    await otherContext.close();
  });

  test("a session id that is not a uuid is a 404, not a server error", async ({ page, context }) => {
    await startInterview(page, context, "bad-id");

    expect((await page.goto("/sessions/abc"))?.status()).toBe(404);
    const post = await page.request.post("/api/sessions/abc/turns", { data: { text: "Chào" } });
    expect(post.status()).toBe(404);
  });

  test("losing the sign-in mid-interview sends the learner to sign in and back to the session", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "expired");
    const authCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
    await context.clearCookies({ name: new RegExp(authCookies.map((cookie) => cookie.name).join("|")) });

    await composer(page).fill("Chị còn đó không?");
    await sendButton(page).click();

    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(`/sessions/${sessionId}`)}`);
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
  });
});
