import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { ask, composer, expectReply, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { endedHeading } from "./helpers/interview";
import { postTurn, turnOutcome } from "./helpers/turn-api";

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

const NOT_ANSWERED = "Chị Thu chưa nghe rõ. Gửi lại câu hỏi.";

test.describe("interview", () => {
  test("a question gets a persona reply; the turn, its analysis and both model calls are stored", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "turn");
    await expect(page.getByText("Chào em, chị là Thu.")).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();

    await composer(page).fill("Cuối tháng chị thường xoay xở thế nào ạ?");
    await sendButton(page).click();

    await expectReply(page, 1);
    await expect(page.getByText("Cuối tháng chị thường xoay xở thế nào ạ?")).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    await expect(page.locator("[data-streaming]")).toHaveCount(0);

    const turns = await db.turnsOf(sessionId);
    expect(turns.map((turn) => [turn.index, turn.learnerText, turn.personaText])).toEqual([
      [0, null, expect.stringContaining("chị là Thu")],
      [1, "Cuối tháng chị thường xoay xở thế nào ạ?", "Chị trả lời câu thứ 1 (trong khối dữ liệu)."],
    ]);
    expect(turns[1].learnerTokens).toEqual(["Cuối", "tháng", "chị", "thường", "xoay", "xở", "thế", "nào", "ạ?"]);
    expect(turns[1].analysisJson).toMatchObject({ label: "open", question_type: "other", topic_tags: [] });
    expect(turns[1].decisionJson).toMatchObject({ unlockedItemId: null, opennessBefore: 4, opennessAfter: 4 });
    expect(await db.snapshotsOf(sessionId)).toMatchObject([{ index: 0, openness: 4 }, { index: 1, openness: 4, unlocked: [] }]);

    // Exactly two logical calls for the turn, each costed.
    const calls = await db.llmCallsOf(sessionId);
    expect(calls.map((call) => [call.role, call.turnIndex, call.attempt, call.ok])).toEqual([
      ["ANALYSIS", 1, 1, true],
      ["PERSONA", 1, 1, true],
    ]);
    for (const call of calls) {
      expect(call).toMatchObject({ scope: "session", model: "gpt-6-luna", tokensIn: 420, tokensOut: 18 });
      expect(call.costUsd).toBeCloseTo((420 * 0.1 + 18 * 0.5) / 1_000_000, 12);
    }
    expect((await db.eventsOf(sessionId)).map((event) => event.name)).toEqual(["session_started", "turn"]);
  });

  test("the reply is shown while it is still being written, then becomes the stored turn", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "stream");

    await composer(page).fill("Chị kể từ từ thôi nha [stub:slow]");
    await sendButton(page).click();

    // First the typing line, then a growing reply that is not yet a turn.
    await expect(page.locator(".typing").filter({ hasText: "Chị Thu đang gõ…" })).toBeVisible();
    const streaming = page.locator("[data-streaming] .bubble-p");
    await expect(streaming).toContainText("Chị trả lời");
    const partial = (await streaming.textContent()) ?? "";
    expect(partial.length).toBeLessThan("Chị trả lời câu thứ 1 (trong khối dữ liệu).".length);
    await expect(composer(page)).toBeDisabled();
    expect(await db.turnsOf(sessionId)).toHaveLength(1);

    await expect(page.locator("[data-streaming]")).toHaveCount(0);
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1 (trong khối dữ liệu)." })).toBeVisible();
    await expect(composer(page)).toBeEnabled();
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
  });

  test("Enter sends, Shift+Enter adds a line, and the transcript is sent with later turns", async ({ page, context }) => {
    await startInterview(page, context, "keys");

    await composer(page).fill("Dòng một");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("dòng hai");
    await expect(composer(page)).toHaveValue("Dòng một\ndòng hai");
    await composer(page).press("Enter");
    await expectReply(page, 1);

    await composer(page).fill("Câu thứ hai?");
    await composer(page).press("Enter");
    await expectReply(page, 2);
  });

  test("the conversation is still there after a reload, and continues at the right turn", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "reload");
    await ask(page, "Chị hay ăn trưa ở đâu?", 1);

    await page.reload();

    await expect(page.getByText("Chào em, chị là Thu.")).toBeVisible();
    await expect(page.getByText("Chị hay ăn trưa ở đâu?")).toBeVisible();
    await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 1" })).toBeVisible();

    await ask(page, "Rồi buổi tối thì sao ạ?", 2);
    expect((await db.turnsOf(sessionId)).map((turn) => turn.index)).toEqual([0, 1, 2]);
  });

  test("a failed analysis call shows an error, keeps the question, writes no turn, and records every attempt", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "failure");

    await composer(page).fill("Chị kể thêm đi [stub:fail]");
    await sendButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: NOT_ANSWERED })).toBeVisible();
    await expect(composer(page)).toHaveValue("Chị kể thêm đi [stub:fail]");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    expect(await db.snapshotsOf(sessionId)).toHaveLength(1);
    const calls = await db.llmCallsOf(sessionId);
    expect(calls.map((call) => [call.role, call.attempt, call.ok])).toEqual([
      ["ANALYSIS", 1, false],
      ["ANALYSIS", 2, false],
      ["ANALYSIS", 3, false],
    ]);

    // The same turn index is used once the provider answers again.
    await ask(page, "Chị kể thêm đi", 1);
    await expect(page.getByRole("alert").filter({ hasText: NOT_ANSWERED })).toHaveCount(0);
    expect((await db.turnsOf(sessionId)).map((turn) => turn.index)).toEqual([0, 1]);
  });

  test("a failed persona call writes no turn either; the analysis call that succeeded is still costed", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "persona-failure");

    await composer(page).fill("Chị kể thêm đi [stub:fail-persona]");
    await sendButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: NOT_ANSWERED })).toBeVisible();
    await expect(composer(page)).toHaveValue("Chị kể thêm đi [stub:fail-persona]");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    expect((await db.llmCallsOf(sessionId)).map((call) => [call.role, call.attempt, call.ok])).toEqual([
      ["ANALYSIS", 1, true],
      ["PERSONA", 1, false],
      ["PERSONA", 2, false],
      ["PERSONA", 3, false],
    ]);
    expect((await db.session(sessionId)).turnClaim).toBeNull();
  });

  test("a reply that breaks off midway is removed from the screen and never becomes a turn", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "broken-stream");

    await composer(page).fill("Chị kể đi ạ [stub:break-stream]");
    await sendButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: NOT_ANSWERED })).toBeVisible();
    // The pieces that did arrive ("Chị trả ") are gone, and the question is back in the composer.
    await expect(page.locator("[data-streaming]")).toHaveCount(0);
    await expect(page.locator(".bubble-p")).toHaveCount(1);
    await expect(composer(page)).toHaveValue("Chị kể đi ạ [stub:break-stream]");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    // No retry after text was sent: one persona attempt only.
    expect((await db.llmCallsOf(sessionId)).map((call) => [call.role, call.attempt, call.ok])).toEqual([
      ["ANALYSIS", 1, true],
      ["PERSONA", 1, false],
    ]);

    await ask(page, "Chị kể lại giúp em ạ", 1);
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

    await ask(page, hostile, 1);
    await expect(page.locator(".bubble-me").getByText(hostile)).toBeVisible();
    await page.reload();
    await expect(page.locator(".bubble-me").getByText(hostile)).toBeVisible();

    expect(await page.locator(".chat-log img, .chat-log script").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toBe(0);
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

    const post = await postTurn(other.request, sessionId, { text: "Cho xem với", expectedIndex: 1 });
    expect(post.status).toBe(404);
    expect(post.json).toEqual({ error: "not_found" });
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
    expect(await db.llmCallsOf(sessionId)).toHaveLength(0);
    await otherContext.close();
  });

  test("a session id that is not a uuid is a 404, not a server error", async ({ page, context }) => {
    await startInterview(page, context, "bad-id");

    expect((await page.goto("/sessions/abc"))?.status()).toBe(404);
    const post = await postTurn(page.request, "abc", { text: "Chào", expectedIndex: 1 });
    expect(post.status).toBe(404);
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

test.describe("turn API", () => {
  test("streams the persona text, then the turn count, and nothing else", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "api-shape");

    const reply = await postTurn(page.request, sessionId, { text: "Chị làm nghề gì ạ?", expectedIndex: 1 });

    expect(reply.status).toBe(200);
    expect(reply.contentType).toContain("application/x-ndjson");
    const events = reply.events!;
    const deltas = events.slice(0, -1);
    expect(deltas.length).toBeGreaterThan(3);
    for (const event of deltas) expect(Object.keys(event).sort()).toEqual(["text", "type"]);
    expect(deltas.every((event) => event.type === "delta")).toBe(true);
    expect(deltas.map((event) => (event.type === "delta" ? event.text : "")).join("")).toBe("Chị trả lời câu thứ 1 (trong khối dữ liệu).");
    expect(events.at(-1)).toEqual({ type: "done", personaText: "Chị trả lời câu thứ 1 (trong khối dữ liệu).", turnIndex: 1 });
    // No analysis field of any kind in what the browser received.
    expect(reply.raw).not.toMatch(/label|verdict|hook|unlock|openness|topic_tags|analysis|decision|snapshot/i);
  });

  test("refuses an empty, over-long or malformed request with 400 and no model call", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "limits");
    await expect(composer(page)).toHaveAttribute("maxlength", "500");

    const bad = [
      { text: "", expectedIndex: 1 },
      { text: "   ", expectedIndex: 1 },
      { text: "a".repeat(501), expectedIndex: 1 },
      { text: 12, expectedIndex: 1 },
      { text: "Thiếu số lượt" },
      { text: "Số lượt sai kiểu", expectedIndex: "1" },
      { text: "Số lượt bằng 0", expectedIndex: 0 },
      { text: "Khóa không phải uuid", expectedIndex: 1, turnKey: "abc" },
    ];
    for (const body of bad) {
      const reply = await postTurn(page.request, sessionId, body);
      expect(reply.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(reply.json).toEqual({ error: "invalid_input" });
    }
    const malformed = await postTurn(page.request, sessionId, "{not json");
    expect(malformed.status).toBe(400);

    expect(await db.llmCallsOf(sessionId)).toHaveLength(0);
    expect(await db.turnsOf(sessionId)).toHaveLength(1);
  });

  test("a question of exactly 500 characters is accepted", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "limit-edge");
    const reply = await postTurn(page.request, sessionId, { text: "a".repeat(500), expectedIndex: 1 });
    expect(turnOutcome(reply)).toMatchObject({ turnIndex: 1 });
  });

  test("sending the same question again with its key returns the stored reply and calls no model", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "resend");
    const turnKey = "0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10";

    const first = await postTurn(page.request, sessionId, { text: "Chị làm nghề gì ạ?", expectedIndex: 1, turnKey });
    const again = await postTurn(page.request, sessionId, { text: "Chị làm nghề gì ạ?", expectedIndex: 1, turnKey });

    expect(again.status).toBe(200);
    expect(again.contentType).toContain("application/json");
    expect(again.json).toEqual(turnOutcome(first));
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
    expect(await db.llmCallsOf(sessionId)).toHaveLength(2);
  });

  test("two submits at once play one turn: the second is refused before any model call", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "double");

    const [slow, quick] = await Promise.all([
      postTurn(page.request, sessionId, { text: "Câu thứ nhất [stub:slow]", expectedIndex: 1 }),
      // Sent a moment later, while the first is still being answered.
      new Promise((resolve) => setTimeout(resolve, 400)).then(() => postTurn(page.request, sessionId, { text: "Câu chen vào", expectedIndex: 1 })),
    ]);

    expect(turnOutcome(slow)).toMatchObject({ turnIndex: 1 });
    expect(quick.status).toBe(409);
    expect(quick.json).toEqual({ error: "in_flight" });
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
    expect(await db.llmCallsOf(sessionId)).toHaveLength(2);
  });

  test("a second tab that is one turn behind is told so, and nothing is written", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "stale-tab");
    const stale = await context.newPage();
    await stale.goto(`/sessions/${sessionId}`);
    await expect(stale.getByText("Chào em, chị là Thu.")).toBeVisible();

    await ask(page, "Câu từ tab thứ nhất", 1);

    await composer(stale).fill("Câu từ tab cũ");
    await sendButton(stale).click();

    await expect(stale.getByRole("alert").filter({ hasText: "Lượt này đã được gửi từ một cửa sổ khác" })).toBeVisible();
    await expect(composer(stale)).toHaveValue("Câu từ tab cũ");
    expect(await db.turnsOf(sessionId)).toHaveLength(2);
    expect(await db.llmCallsOf(sessionId)).toHaveLength(2);
  });
});

test.describe("the end of a session", () => {
  test("a session that has ended takes no more questions", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "ended");
    await db.endSession(sessionId);

    const reply = await postTurn(page.request, sessionId, { text: "Còn hỏi được không ạ?", expectedIndex: 1 });
    expect(reply.status).toBe(409);
    expect(reply.json).toEqual({ error: "session_ended" });
    expect(await db.llmCallsOf(sessionId)).toHaveLength(0);

    await page.reload();
    await expect(endedHeading(page)).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    await expect(sendButton(page)).toHaveCount(0);
  });

  test("turn 30 ends the session; turn 31 is refused and the composer closes", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { sessionId } = await startInterview(page, context, "thirty");

    for (let turn = 1; turn <= 29; turn += 1) {
      expect(turnOutcome(await postTurn(page.request, sessionId, { text: `Câu ${turn}`, expectedIndex: turn }))).toMatchObject({ turnIndex: turn });
    }
    expect((await db.session(sessionId)).endedAt).toBeNull();

    // The thirtieth turn is asked in the page.
    await page.reload();
    await composer(page).fill("Câu cuối cùng của em ạ");
    await sendButton(page).click();
    // The session ends by itself: the page moves on without the learner pressing anything.
    await expect(endedHeading(page)).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    expect((await db.turnsOf(sessionId)).at(-1)).toMatchObject({ index: 30, personaText: "Chị trả lời câu thứ 30 (trong khối dữ liệu)." });

    expect((await db.session(sessionId)).endedAt).not.toBeNull();
    const extra = await postTurn(page.request, sessionId, { text: "Câu 31", expectedIndex: 30 });
    expect(extra.json).toEqual({ error: "session_ended" });
    expect(await db.turnsOf(sessionId)).toHaveLength(31);

    // Two logical calls for each of the 30 turns, then exactly the three reveal calls the end started.
    await expect.poll(async () => (await db.session(sessionId)).revealReadyAt).not.toBeNull();
    const calls = (await db.llmCallsOf(sessionId)).filter((call) => call.attempt === 1);
    expect(calls.filter((call) => call.turnIndex === null).map((call) => call.role)).toEqual(["END_JUDGE", "FEEDBACK", "VERIFIER"]);
    expect(calls).toHaveLength(63);
    for (let turn = 1; turn <= 30; turn += 1) {
      expect(calls.filter((call) => call.turnIndex === turn).map((call) => call.role)).toEqual(["ANALYSIS", "PERSONA"]);
    }
  });
});
