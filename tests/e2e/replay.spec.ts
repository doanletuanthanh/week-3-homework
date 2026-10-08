import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { composer, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { notes } from "./helpers/interview";
import { LEADING_QUESTIONS, PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess, transcriptDrawer } from "./helpers/reveal";

// What the scenario file holds about the replay target of PRIMARY_QUESTIONS (paid-app, alias I2/H2).
const TARGET = {
  content: "Chị đang trả phí hằng tháng cho một app quản lý chi tiêu mà chị gần như không mở. Tiền vẫn tự trừ vì chị quên hủy gia hạn.",
  sampleQuestion: "Lần chị định ghi lại đó, chị định ghi kiểu gì ạ?",
  topicTag: "những lần định ghi lại chi tiêu",
};
const TRIED_METHODS = "Chị đã thử ba cách ghi chi tiêu: sổ tay, file Excel tự làm và một app trên điện thoại. Cách nào cũng không qua nổi tháng thứ hai.";

/** Stub markers: Call 1's analysis of the question, and what the replay judge says about the reply to it. */
const analysis = (value: object) => `[stub:analysis=${JSON.stringify(value)}]`;
const judge = (value: object) => `[stub:replay-judge=${JSON.stringify(value)}]`;
const toldVerdict = (...items: string[]) => judge({ prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: items, violations: [] } });

/** The question that picks up the target's hook (dropped at turn 2), with a judge that finds the target told. */
const OPENING_QUESTION = `${TARGET.sampleQuestion} ${analysis({ hook_id: "H2", label: "confirm_grounded", grounded_turn_id: 2 })} ${toldVerdict("I2")}`;
const LEADING_REPLAY = `Chắc tại chị lười nên mới bỏ đúng không ạ? ${analysis({ label: "leading", introduced_span: [1, 3] })}`;

const replayOffer = (page: Page) => page.locator(".replay-offer");
const replayCard = (page: Page) => page.getByRole("region", { name: "Kết quả luyện lại" });
const replayHeading = (page: Page, turn: number) => page.getByRole("heading", { level: 1, name: `Luyện lại từ lượt ${turn}` });
const counter = (page: Page) => page.locator(".rbar-turns .label-md");
const result = (page: Page) => page.locator(".rp-col .rr");
const stopButton = (page: Page) => page.locator(".rbar").getByRole("button", { name: "Dừng" });
const stopDialog = (page: Page) => page.getByRole("alertdialog", { name: "Dừng luyện lại?" });
const skipDialog = (page: Page) => page.getByRole("alertdialog", { name: "Bỏ qua lần luyện lại?" });
const backToResult = (page: Page) => page.getByRole("button", { name: "Về kết quả buổi" });
const replayDrawer = (page: Page) => page.getByRole("dialog", { name: "Các lượt luyện lại" });
const download = (page: Page) => page.getByRole("button", { name: "Tải về" });
const status = async (sessionId: string) => (await db.session(sessionId)).status;
/** The screen's own error line. (Next.js keeps an empty alert region of its own on every page.) */
const errorLine = (within: Page | Locator) => within.locator(".ferr");

/** A learner on Màn 6 with the replay of `paid-app` on offer (the hook was dropped at turn 2). */
async function primaryOffer(page: Page, context: BrowserContext, label: string) {
  const started = await endedInterview(page, context, label, PRIMARY_QUESTIONS, PRIMARY_NOTES);
  await guess(page, 5);
  await expectResult(page, 5, 2);
  return started;
}

/** A learner on Màn 6 whose only fault was a leading question at turn 1: fallback 1. */
async function fallbackOffer(page: Page, context: BrowserContext, label: string) {
  const started = await endedInterview(page, context, label, LEADING_QUESTIONS, "ghi vội");
  await guess(page, 1);
  await expectResult(page, 1, 0);
  return started;
}

async function startReplay(page: Page, returnTurn: number) {
  await replayOffer(page).getByRole("button", { name: `Quay lại lượt ${returnTurn}` }).click();
  await expect(replayHeading(page, returnTurn)).toBeVisible();
}

/**
 * Sends one replay question and waits until it is a finished replay turn. The stubbed persona
 * numbers its reply by the questions it was sent, the ones before the fork included.
 */
async function askReplay(page: Page, text: string, replyNumber: number, replayTurn: number) {
  await composer(page).fill(text);
  await sendButton(page).click();
  await expect(page.locator(".rp-col .bubble-p").filter({ hasText: `Chị trả lời câu thứ ${replyNumber} (trong khối dữ liệu).` })).toBeVisible();
  await expect(page.locator("[data-streaming]")).toHaveCount(0);
  await expect(counter(page)).toHaveText(`Lượt ${replayTurn}/3`);
}

test.describe("Màn 7: a primary replay", () => {
  test("from the offer through the sample question to 'Đã mở khóa', then back to a result with nothing held", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-success");

    await startReplay(page, 3);
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    expect(await status(sessionId)).toBe("replaying");
    expect(await db.replayOf(sessionId)).toMatchObject({ forkAfterTurn: 2, targetItemId: "paid-app", fallbackLevel: "primary", result: null });

    // The bar: where the replay starts, three turns, the seal, the way out.
    await expect(page.locator(".rbar-title")).toHaveText(/^Luyện lại từ lượt 3Chị Thu · \d{2}\/\d{2}$/);
    await expect(counter(page)).toHaveText("Bạn có 3 lượt");
    await expect(page.locator(".rbar .seg i.on")).toHaveCount(0);
    await expect(page.locator(".rbar .pill")).toHaveText("Giữ lại để bạn thử");
    await expect(stopButton(page)).toBeEnabled();

    // The two turns before the fork, ending on what the persona said, then the fork. No notes.
    const before = page.locator(".rp-col .chat-log").first();
    await expect(before.locator(".bubble-me")).toHaveCount(2);
    await expect(before.locator(".bubble-me").first()).toContainText("Chị quản lý tiền nong thế nào ạ?");
    await expect(before.locator(".bubble-me").nth(1)).toContainText("Chị có hay ghi lại chi tiêu không ạ?");
    await expect(before.locator(".time")).toHaveText(["lượt 01", "lượt 02"]);
    await expect(page.locator(".fork .pill")).toHaveText("Hỏi lại từ đây");
    await expect(notes(page)).toHaveCount(0);
    await expect(composer(page)).toHaveAttribute("placeholder", "Hỏi lại chị Thu…");

    // The transcript before the fork, and nothing after it.
    await page.getByRole("button", { name: "Xem toàn bộ transcript trước đó" }).click();
    const earlier = transcriptDrawer(page);
    await expect(earlier.locator("li.turn")).toHaveCount(3);
    await expect(earlier.locator(".k")).toHaveText(["Lượt 00", "Lượt 01", "Lượt 02"]);
    await expect(earlier.getByText("Chị Thu · 2 lượt")).toBeVisible();
    await expect(earlier).not.toContainText("Lần gần nhất chị ghi là khi nào ạ?");
    await page.keyboard.press("Escape");
    await expect(earlier).toBeHidden();

    // Replay turn 1: an ordinary question. Nothing opens, nothing is said about what is held.
    await askReplay(page, "Hồi đó chị ghi vào đâu ạ?", 3, 1);
    await expect(page.locator(".rp-col .chat-log").nth(1).locator(".time")).toHaveText(["lượt 03"]);
    await expect(page.locator(".rbar .seg i.on")).toHaveCount(1);
    await expect(result(page)).toHaveCount(0);
    expect(await status(sessionId)).toBe("replaying");
    const running = await page.content();
    for (const sealed of Object.values(TARGET)) expect(running).not.toContain(sealed);

    // Replay turn 2: the sample question opens the target and the judge finds it told.
    await askReplay(page, OPENING_QUESTION, 4, 2);
    const unlocked = result(page);
    await expect(unlocked).toHaveAttribute("data-result", "success");
    await expect(unlocked.locator(".headline-md")).toHaveText(`Đã mở khóa: ${TARGET.content}`);
    await expect(unlocked.locator(".rr-note")).toHaveText("Đây chính là điều bạn bỏ lỡ.");
    await expect(page.locator(".rbar .pill")).toHaveText("Đã mở khóa");
    // The replay is over: no question box, no stop button, and no navigation by itself.
    await expect(composer(page)).toHaveCount(0);
    await expect(stopButton(page)).toHaveCount(0);
    await expect(replayHeading(page, 3)).toBeVisible();

    expect(await status(sessionId)).toBe("done");
    const branch = await db.replayOf(sessionId);
    expect(branch.result).toBe("success");
    expect((await db.turnsOfBranch(branch.id)).map((turn) => [turn.index, turn.decisionJson?.unlockedItemId, turn.verdictJson?.disclosed_item_ids])).toEqual([
      [3, null, []],
      [4, "paid-app", ["paid-app"]],
    ]);
    // Three logical calls per replay turn.
    const calls = (await db.llmCallsOf(sessionId)).filter((call) => call.branchId === branch.id);
    expect(calls.map((call) => [call.turnIndex, call.role, call.ok])).toEqual([
      [3, "ANALYSIS", true],
      [3, "PERSONA", true],
      [3, "REPLAY_JUDGE", true],
      [4, "ANALYSIS", true],
      [4, "PERSONA", true],
      [4, "REPLAY_JUDGE", true],
    ]);
    const events = (await db.eventsOf(sessionId)).filter((event) => event.name.startsWith("replay_"));
    expect(events.map((event) => [event.name, event.props])).toEqual([
      ["replay_started", { level: "primary" }],
      ["replay_result", { level: "primary", result: "success", turns: 2 }],
    ]);

    // Back on Màn 6, in done mode: the result card stands where the offer stood.
    await backToResult(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bạn đoán 5.Chị Thu đã kể: 2 trên 11.");
    await expect(page).toHaveURL(`/sessions/${sessionId}`);
    await expect(replayOffer(page)).toHaveCount(0);
    const card = replayCard(page);
    await expect(card.locator(".eyebrow").first()).toHaveText("Luyện lại từ lượt 3");
    await expect(card.locator(".headline-md")).toHaveText(`Đã mở khóa: ${TARGET.content}`);
    await expect(card.locator(".rr-sample")).toHaveText(`CÂU HỎI MẪU“${TARGET.sampleQuestion}”`);

    // The numbers of the main interview did not move: the target is in the card, not among what was told.
    await expect(page.getByText("2 Đã kể")).toBeVisible();
    await expect(page.getByText("1 Mở khi luyện lại")).toBeVisible();
    await expect(page.getByText("8 Bỏ lỡ")).toBeVisible();
    await expect(page.locator(".recog")).toHaveText("Nhận biết: 2 điều quan trọng trong ghi chú của bạn.");
    await expect(page.getByRole("region", { name: "Đã kể" }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Đã kể" })).not.toContainText(TARGET.content);
    await expect(page.getByRole("region", { name: "Bỏ lỡ" })).not.toContainText(TARGET.content);

    // The note about the target is marked now, with its fixed sentence and the one the replay adds.
    const noted = page.getByRole("region", { name: "Ghi chú của bạn" }).locator(".cv-line[data-kind]").filter({ hasText: "đang trả phí cho app mà không dùng" });
    await expect(noted.locator(".lab")).toHaveText("Chưa xác nhận");
    await expect(noted.locator(".cv-item")).toHaveText(TARGET.content);
    await expect(noted.locator(".cv-why").first()).toContainText("Bạn đoán đúng, nhưng chị Thu chưa xác nhận");
    await expect(noted.locator(".cv-replay")).toHaveText("Trong buổi chính chị Thu chưa xác nhận; ở lần luyện lại bạn đã mở được nó.");
    await expect(page.locator(".cv-replay")).toHaveCount(1);

    // Nothing is held back any more: the habit card is there and the takeaway can be taken home.
    const takeaway = page.getByRole("region", { name: "Thói quen hỏi của bạn — đọc lại trước buổi thật" });
    // (The sheet that prints carries the card a second time; it is hidden on screen.)
    await expect(takeaway.locator(".habit").first()).toBeVisible();
    await expect(download(page)).toBeEnabled();

    // The replay's own turns, in a drawer of their own.
    await card.getByRole("button", { name: "Xem 2 lượt luyện lại" }).click();
    const drawer = replayDrawer(page);
    await expect(drawer.locator("li.turn")).toHaveCount(2);
    await expect(drawer.locator(".k")).toHaveText(["Lượt 03", "Lượt 04"]);
    await expect(drawer.getByText("Chị Thu · 2 lượt")).toBeVisible();
    await expect(drawer).toContainText("Hồi đó chị ghi vào đâu ạ?");
    await drawer.getByRole("button", { name: "Đóng transcript" }).click();
    await expect(drawer).toBeHidden();
    // The main transcript is still the six turns of the interview.
    await page.getByRole("region", { name: "Đã kể" }).getByRole("button", { name: "Lượt 1" }).click();
    await expect(transcriptDrawer(page).locator("li.turn")).toHaveCount(7);
    await expect(transcriptDrawer(page)).not.toContainText("Hồi đó chị ghi vào đâu ạ?");
    await page.keyboard.press("Escape");

    // Opening the session again shows the same result and calls no model.
    const callsBefore = (await db.llmCallsOf(sessionId)).length;
    await page.reload();
    await expect(replayCard(page).locator(".headline-md")).toHaveText(`Đã mở khóa: ${TARGET.content}`);
    expect((await db.llmCallsOf(sessionId)).length).toBe(callsBefore);
  });

  test("three turns without the target: 'Đang kiểm tra…', a turn the judge could not check, then what was held and a question for it", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-fail");
    await startReplay(page, 3);

    // While the judge reads the reply, the screen says so; then the line goes.
    await composer(page).fill("Hồi đó chị ghi vào đâu ạ? [stub:slow-judge]");
    await sendButton(page).click();
    await expect(page.locator(".rp-checking")).toHaveText("Đang kiểm tra…");
    await expect(page.locator(".sr[aria-live]")).toHaveText("Đang kiểm tra…");
    await expect(page.locator(".rp-checking")).toHaveCount(0);
    await expect(counter(page)).toHaveText("Lượt 1/3");
    await expect(composer(page)).toBeEnabled();

    // The judge fails on turn 2: the turn counts, and a small line says it was not checked.
    await askReplay(page, "Chị có nghĩ một app tốt hơn sẽ giúp chị ghi đều không? [stub:fail-judge]", 4, 2);
    await expect(page.locator(".turn-note")).toHaveText(["Chưa kiểm được lượt này."]);
    const branch = await db.replayOf(sessionId);
    expect((await db.turnsOfBranch(branch.id)).map((turn) => turn.verdictJson === null)).toEqual([false, true]);

    await askReplay(page, "Dạ. Chị hay xem lại chi tiêu vào lúc nào ạ?", 5, 3);
    const held = result(page);
    await expect(held).toHaveAttribute("data-result", "fail");
    await expect(held.locator(".eyebrow")).toHaveText("Điều chị Thu đã giữ lại");
    await expect(held.locator(".headline-md")).toHaveText(TARGET.content);
    await expect(held.locator(".ctx-k")).toHaveText("Một câu đã mở được nó");
    await expect(held.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    await expect(page.locator(".rbar .pill")).toHaveText("Đã mở niêm phong");
    await expect(page.locator(".rbar .seg i.on")).toHaveCount(3);
    await expect(composer(page)).toHaveCount(0);
    expect(await status(sessionId)).toBe("done");
    expect((await db.replayOf(sessionId)).result).toBe("fail");

    // A reload after the end is the result page: the replay screen is not a state any more.
    await page.reload();
    const card = replayCard(page);
    await expect(card.locator(".rr")).toHaveAttribute("data-result", "fail");
    await expect(card.locator(".headline-md")).toHaveText(TARGET.content);
    await expect(card.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    await expect(page.getByText("1 Đã mở niêm phong")).toBeVisible();
    // The target was not opened in the replay: its note keeps the sentence of the main interview alone.
    await expect(page.locator(".cv-replay")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Ghi chú của bạn" }).locator("mark").filter({ hasText: "đang trả phí" })).toHaveCount(1);
    await card.getByRole("button", { name: "Xem 3 lượt luyện lại" }).click();
    await expect(replayDrawer(page).locator(".k")).toHaveText(["Lượt 03", "Lượt 04", "Lượt 05"]);
  });

  test("partial: another item was opened and told, and the target is shown with its question", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-partial");
    await startReplay(page, 3);
    await askReplay(page, `Chị đã thử ghi chi tiêu bằng những cách nào rồi ạ? ${analysis({ topic_tags: ["T1"] })} ${toldVerdict("I1")}`, 3, 1);
    await expect(result(page)).toHaveCount(0);
    await askReplay(page, "Rồi sau đó thì sao ạ?", 4, 2);
    await askReplay(page, "Chị kể thêm cho em nghe được không ạ?", 5, 3);

    const shown = result(page);
    await expect(shown).toHaveAttribute("data-result", "partial");
    await expect(shown.locator(".rr-other")).toHaveText(`Bạn mở được một điều khác: ${TRIED_METHODS}`);
    await expect(shown.locator(".headline-md")).toHaveText(TARGET.content);
    await expect(shown.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    expect((await db.replayOf(sessionId)).result).toBe("partial");
  });

  test("Dừng asks first, then ends the replay and shows what was held", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-stop");
    await startReplay(page, 3);
    await askReplay(page, "Hồi đó chị ghi vào đâu ạ?", 3, 1);

    await stopButton(page).click();
    await expect(stopDialog(page)).toBeVisible();
    await expect(stopDialog(page)).toContainText("Điều bị giữ sẽ được mở ra.");
    // "Hỏi tiếp" changes nothing.
    await stopDialog(page).getByRole("button", { name: "Hỏi tiếp" }).click();
    await expect(stopDialog(page)).toBeHidden();
    expect(await status(sessionId)).toBe("replaying");
    await expect(composer(page)).toBeEnabled();
    expect(await page.content()).not.toContain(TARGET.content);

    await stopButton(page).click();
    await stopDialog(page).getByRole("button", { name: "Dừng" }).click();
    const held = result(page);
    await expect(held).toHaveAttribute("data-result", "stopped");
    await expect(held.locator(".headline-md")).toHaveText(TARGET.content);
    await expect(held.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    await expect(stopDialog(page)).toBeHidden();
    await expect(composer(page)).toHaveCount(0);
    // It does not leave the screen by itself.
    await expect(replayHeading(page, 3)).toBeVisible();
    expect(await status(sessionId)).toBe("done");
    expect(await db.replayOf(sessionId)).toMatchObject({ result: "stopped" });

    await backToResult(page).click();
    await expect(replayCard(page).locator(".rr")).toHaveAttribute("data-result", "stopped");
    await expect(replayCard(page).getByRole("button", { name: "Xem 1 lượt luyện lại" })).toBeVisible();
    await expect(download(page)).toBeEnabled();
  });

  test("leaving and coming back resumes the replay at the turn it stopped at", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-resume");
    await startReplay(page, 3);
    await askReplay(page, "Hồi đó chị ghi vào đâu ạ?", 3, 1);

    // A reload, then the home page and back: leaving is not stopping.
    await page.reload();
    await expect(replayHeading(page, 3)).toBeVisible();
    await expect(counter(page)).toHaveText("Lượt 1/3");
    await expect(page.locator(".rp-col .chat-log").nth(1).locator(".bubble-me")).toHaveText(["Hồi đó chị ghi vào đâu ạ?"]);
    await page.goto("/");
    await page.goto(`/sessions/${sessionId}`);
    await expect(counter(page)).toHaveText("Lượt 1/3");
    expect(await status(sessionId)).toBe("replaying");

    // The next question is replay turn 2, in a second tab as well.
    const tab = await context.newPage();
    await tab.goto(`/sessions/${sessionId}`);
    await expect(counter(tab)).toHaveText("Lượt 1/3");
    await askReplay(tab, "Rồi sau đó thì sao ạ?", 4, 2);
    // The first tab is one turn behind: its question is refused, not answered twice.
    await composer(page).fill("Câu hỏi từ cửa sổ cũ ạ?");
    await sendButton(page).click();
    await expect(errorLine(page)).toHaveText("Lượt này đã được gửi từ một cửa sổ khác. Tải lại trang để xem.");
    expect(await db.turnsOfBranch((await db.replayOf(sessionId)).id)).toHaveLength(2);
    await tab.close();
  });

  test("a failed reply does not count as a turn, and the same question can be sent again", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-error");
    await startReplay(page, 3);

    await composer(page).fill("Chị kể thêm cho em nghe được không ạ? [stub:fail-persona]");
    await sendButton(page).click();
    await expect(errorLine(page)).toHaveText("Chị Thu chưa nghe rõ. Gửi lại câu hỏi.");
    await expect(counter(page)).toHaveText("Bạn có 3 lượt");
    await expect(composer(page)).toHaveValue("Chị kể thêm cho em nghe được không ạ? [stub:fail-persona]");
    expect(await db.turnsOfBranch((await db.replayOf(sessionId)).id)).toHaveLength(0);

    await askReplay(page, "Chị kể thêm cho em nghe được không ạ?", 3, 1);
    await expect(errorLine(page)).toHaveCount(0);
    await expect(composer(page)).toHaveValue("");
  });
});

test.describe("Màn 6: starting and skipping the replay", () => {
  test("'Bỏ qua, cho tôi xem luôn' asks first, then shows everything with no replay played", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-skip");

    await replayOffer(page).getByRole("button", { name: "Bỏ qua, cho tôi xem luôn" }).click();
    await expect(skipDialog(page)).toBeVisible();
    await expect(skipDialog(page)).toContainText("Bạn sẽ không thử lại được khoảnh khắc này.");
    await skipDialog(page).getByRole("button", { name: "Ở lại" }).click();
    await expect(skipDialog(page)).toBeHidden();
    expect(await status(sessionId)).toBe("revealed");
    expect(await page.content()).not.toContain(TARGET.content);

    await replayOffer(page).getByRole("button", { name: "Bỏ qua, cho tôi xem luôn" }).click();
    await skipDialog(page).getByRole("button", { name: "Cho tôi xem luôn" }).click();

    const card = replayCard(page);
    await expect(card.locator(".rr")).toHaveAttribute("data-result", "skipped");
    await expect(card.locator(".rr > .eyebrow")).toHaveText("Đã bỏ qua lần luyện lại từ lượt 3");
    await expect(card.locator(".headline-md")).toHaveText(TARGET.content);
    await expect(card.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    // No turn was played, so there is none to read.
    await expect(card.getByRole("button", { name: /lượt luyện lại/ })).toHaveCount(0);
    await expect(replayOffer(page)).toHaveCount(0);
    await expect(page.getByText("1 Đã mở niêm phong")).toBeVisible();
    await expect(download(page)).toBeEnabled();

    expect(await status(sessionId)).toBe("done");
    const branch = await db.replayOf(sessionId);
    expect(branch).toMatchObject({ result: "skipped", forkAfterTurn: 2 });
    expect(await db.turnsOfBranch(branch.id)).toHaveLength(0);
    expect((await db.llmCallsOf(sessionId)).filter((call) => call.branchId !== null)).toHaveLength(0);
  });

  test("a start or a skip that fails shows the standard error under the offer and changes nothing", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-offer-error");

    await page.route("**/api/sessions/*/replay", (route) => route.abort());
    await replayOffer(page).getByRole("button", { name: "Quay lại lượt 3" }).click();
    await expect(errorLine(replayOffer(page))).toHaveText("Không kết nối được. Thử lại.");
    await expect(replayOffer(page).getByRole("button", { name: "Quay lại lượt 3" })).toBeEnabled();
    expect(await status(sessionId)).toBe("revealed");

    await replayOffer(page).getByRole("button", { name: "Bỏ qua, cho tôi xem luôn" }).click();
    await skipDialog(page).getByRole("button", { name: "Cho tôi xem luôn" }).click();
    await expect(skipDialog(page)).toBeHidden();
    await expect(errorLine(replayOffer(page))).toHaveText("Không kết nối được. Thử lại.");
    expect(await status(sessionId)).toBe("revealed");
    expect(await db.replayOf(sessionId)).toBeUndefined();

    // With the connection back, the same button works.
    await page.unroute("**/api/sessions/*/replay");
    await startReplay(page, 3);
    expect(await status(sessionId)).toBe("replaying");
  });
});

test.describe("Màn 7: the replay of a leading question", () => {
  test("three questions without leading: 'Ba câu không dẫn dắt', and the leading turn is unsealed", async ({ page, context }) => {
    const { sessionId } = await fallbackOffer(page, context, "replay-fallback-ok");
    await startReplay(page, 1);

    // It forks before the first question: only the persona's opening line stands before the fork.
    await expect(page.locator(".rp-col .chat-log").first().locator(".bubble-me")).toHaveCount(0);
    await expect(page.locator(".rp-col .chat-log").first().locator(".bubble-p")).toHaveText(["Chào em, chị là Thu. Em cứ hỏi tự nhiên nha, chị trả lời được gì thì trả lời."]);
    await expect(page.locator(".fork .pill")).toHaveText("Hỏi lại từ đây, lần này không dẫn dắt.");
    // No item is held on this kind of replay.
    await expect(page.locator(".rbar .pill")).toHaveCount(0);
    expect(await db.replayOf(sessionId)).toMatchObject({ forkAfterTurn: 0, targetItemId: null, fallbackLevel: "fallback1" });

    await askReplay(page, "Chị thường ghi chi tiêu thế nào ạ?", 1, 1);
    await askReplay(page, `Chị vừa nói vậy, cụ thể là sao ạ? ${analysis({ label: "confirm_grounded", grounded_turn_id: 1 })}`, 2, 2);
    await expect(result(page)).toHaveCount(0);
    await askReplay(page, "Còn gì nữa không ạ?", 3, 3);

    const shown = result(page);
    await expect(shown).toHaveAttribute("data-result", "success");
    await expect(shown.locator(".headline-sm")).toHaveText("Ba câu không dẫn dắt, có 1 câu bám vào lời chị Thu.");
    await expect(shown.locator(".q")).toHaveCount(0);
    expect(await db.replayOf(sessionId)).toMatchObject({ result: "success" });
    // The judge gave its own label for each question.
    expect((await db.turnsOfBranch((await db.replayOf(sessionId)).id)).map((turn) => turn.judgeLabel)).toEqual(["open", "open", "open"]);

    await backToResult(page).click();
    const card = replayCard(page);
    await expect(card.locator(".headline-sm")).toHaveText("Ba câu không dẫn dắt, có 1 câu bám vào lời chị Thu.");
    await expect(card.locator(".rr > .eyebrow")).toHaveText("Luyện lại từ lượt 1");
    // What was held for this replay is shown now: the leading turn's comment, and its mark in the transcript.
    const takeaway = page.getByRole("region", { name: "Thói quen hỏi của bạn — đọc lại trước buổi thật" });
    await expect(takeaway.locator('.cmt[data-type="leading"]')).toContainText("Bạn tự thêm “chị ngại ghi”");
    await card.getByRole("button", { name: "Lượt 1" }).click();
    await expect(transcriptDrawer(page).locator('li[data-turn="1"] .lab')).toHaveText("Dẫn dắt");
    await page.keyboard.press("Escape");
    await expect(download(page)).toBeEnabled();
  });

  test("a question that is still leading is quoted, only when the replay judge found it leading too", async ({ page, context }) => {
    await fallbackOffer(page, context, "replay-fallback-leading");
    await startReplay(page, 1);
    // Call 1 finds both leading; the judge agrees about the second one only.
    await askReplay(page, `${LEADING_REPLAY} ${judge({ label: "open" })}`, 1, 1);
    await askReplay(page, `${LEADING_REPLAY} ${judge({ label: "leading", introduced_span: [1, 3] })}`, 2, 2);
    await askReplay(page, "Còn gì nữa không ạ?", 3, 3);

    const shown = result(page);
    await expect(shown).toHaveAttribute("data-result", "fail");
    await expect(shown.locator(".headline-sm")).toHaveText("Lượt 2 vẫn thêm ý của bạn: “tại chị lười”.");
    await expect(shown.locator(".ctx-k")).toHaveText("Câu hỏi mẫu");
    await expect(shown.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
  });

  test("a leading label the judge does not confirm is not held against the learner, and Dừng says how many questions were grounded", async ({ page, context }) => {
    const { sessionId } = await fallbackOffer(page, context, "replay-fallback-unconfirmed");
    await startReplay(page, 1);
    // Call 1 finds the first question leading; the judge finds it open. The second rests on the persona's words.
    await askReplay(page, `${LEADING_REPLAY} ${judge({ label: "open" })}`, 1, 1);
    await askReplay(page, `Chị vừa nói vậy, cụ thể là sao ạ? ${analysis({ label: "confirm_grounded", grounded_turn_id: 1 })}`, 2, 2);

    await stopButton(page).click();
    await stopDialog(page).getByRole("button", { name: "Dừng" }).click();
    const shown = result(page);
    await expect(shown).toHaveAttribute("data-result", "stopped");
    await expect(shown.locator(".headline-sm")).toHaveText("Có 1 câu bám vào lời chị Thu trước khi bạn dừng.");
    await expect(shown.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
    expect(await db.replayOf(sessionId)).toMatchObject({ result: "stopped" });
  });

  test("three questions, one leading by Call 1 alone and one grounded: the replay is a success", async ({ page, context }) => {
    const { sessionId } = await fallbackOffer(page, context, "replay-fallback-benefit");
    await startReplay(page, 1);
    await askReplay(page, `${LEADING_REPLAY} ${judge({ label: "open" })}`, 1, 1);
    await askReplay(page, `Chị vừa nói vậy, cụ thể là sao ạ? ${analysis({ label: "confirm_grounded", grounded_turn_id: 1 })}`, 2, 2);
    await askReplay(page, "Còn gì nữa không ạ?", 3, 3);
    await expect(result(page).locator(".headline-sm")).toHaveText("Ba câu không dẫn dắt, có 1 câu bám vào lời chị Thu.");
    expect(await db.replayOf(sessionId)).toMatchObject({ result: "success" });
  });

  test("three questions that rest on nothing the persona said: the plain line, with a sample question", async ({ page, context }) => {
    await fallbackOffer(page, context, "replay-fallback-none");
    await startReplay(page, 1);
    // A leading label the judge cannot point at words for is not confirmed.
    await askReplay(page, `${LEADING_REPLAY} ${judge({ label: "leading", introduced_span: [40, 44] })}`, 1, 1);
    await askReplay(page, "Chị kể thêm ạ?", 2, 2);
    await askReplay(page, "Còn gì nữa không ạ?", 3, 3);

    const shown = result(page);
    await expect(shown).toHaveAttribute("data-result", "fail");
    await expect(shown.locator(".headline-sm")).toHaveText("Lần này chưa có câu nào bám vào lời chị Thu.");
    await expect(shown.locator(".q")).toHaveText(`“${TARGET.sampleQuestion}”`);
  });
});

test.describe("the replay routes", () => {
  test("while the replay runs no response carries anything of the target, and a replay turn answers with the reply and the count alone", async ({ page, context, browser }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-sealed");
    const post = (path: string, data: unknown) => page.request.post(`/api/sessions/${sessionId}/${path}`, { data: data as never, headers: { "content-type": "application/json" } });
    const sealed = [...Object.values(TARGET), '"paid-app"'];

    // Bad requests, and a stop before any replay.
    expect((await post("replay", { action: "nope" })).status()).toBe(400);
    expect((await post("replay", "not json")).status()).toBe(400);
    expect(await (await post("replay", { action: "stop" })).json()).toEqual({ error: "not_replaying" });
    expect(await (await post("replay/turns", { text: "Sớm quá ạ?", expectedIndex: 1, turnKey: crypto.randomUUID() })).json()).toEqual({ error: "replay_ended" });

    expect(await (await post("replay", { action: "start" })).json()).toEqual({ ok: true });
    // Starting again is a no-op.
    expect((await post("replay", { action: "start" })).status()).toBe(200);
    expect(await (await post("replay", { action: "skip" })).json()).toEqual({ error: "not_offered" });

    // A replay turn, as the browser receives it: persona text, the judge's start, then the count.
    const turn = await post("replay/turns", { text: `Chị hay định ghi lại lắm ạ? ${analysis({ topic_tags: ["T2"] })}`, expectedIndex: 1, turnKey: crypto.randomUUID() });
    expect(turn.headers()["content-type"]).toContain("ndjson");
    const raw = await turn.text();
    const events = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { type: string } & Record<string, unknown>);
    const types = events.map((event) => event.type);
    expect(new Set(types)).toEqual(new Set(["delta", "checking", "done"]));
    expect(types.indexOf("checking")).toBe(types.length - 2);
    expect(events.at(-1)).toEqual({ type: "done", personaText: "Chị trả lời câu thứ 3 (trong khối dữ liệu).", replayTurnIndex: 1, unchecked: false });
    for (const text of sealed) expect(raw).not.toContain(text);

    // Every other response of the session, while it is `replaying`.
    for (const path of ["reveal", "transcript", "transcript?branch=replay"]) {
      const response = await page.request.get(`/api/sessions/${sessionId}/${path}`);
      expect(response.status(), path).toBe(200);
      const body = await response.text();
      for (const text of sealed) expect(body, path).not.toContain(text);
    }
    expect(await (await page.request.get(`/api/sessions/${sessionId}/transcript?branch=replay`)).json()).toEqual({ turns: [] });
    const html = await (await page.request.get(`/sessions/${sessionId}`)).text();
    // It is the replay screen. (React splits the number from the words in the markup.)
    expect(html).toContain("Luyện lại từ lượt");
    expect(html).toContain("Hỏi lại từ đây");
    for (const text of sealed) expect(html).not.toContain(text);
    // The main interview takes no more questions.
    expect(await (await post("turns", { text: "Còn hỏi được không ạ?", expectedIndex: 7, turnKey: crypto.randomUUID() })).json()).toEqual({ error: "session_ended" });
    // Bad replay input is refused before any model call.
    expect((await post("replay/turns", { text: "x".repeat(501), expectedIndex: 2, turnKey: crypto.randomUUID() })).status()).toBe(400);
    expect(await (await post("replay/turns", { text: "Nhảy lượt ạ?", expectedIndex: 3, turnKey: crypto.randomUUID() })).json()).toEqual({ error: "conflict" });

    // Another learner gets "not found" from every replay route.
    const other = await browser.newContext();
    await signInAsNewLearner(other, uniqueEmail("replay-other"));
    const stranger = await other.newPage();
    await stranger.goto("/data-notice?next=/");
    await stranger.getByRole("button", { name: "Tôi hiểu" }).click();
    await stranger.waitForURL((url) => url.pathname === "/");
    const asStranger = (path: string, data: unknown) => stranger.request.post(`/api/sessions/${sessionId}/${path}`, { data: data as never, headers: { "content-type": "application/json" } });
    for (const action of ["start", "skip", "stop"]) expect((await asStranger("replay", { action })).status(), action).toBe(404);
    expect((await asStranger("replay/turns", { text: "Của ai đây ạ?", expectedIndex: 2, turnKey: crypto.randomUUID() })).status()).toBe(404);
    expect((await stranger.request.get(`/api/sessions/${sessionId}/transcript?branch=replay`)).status()).toBe(404);
    await other.close();
    // Signed out: no replay either.
    const anonymous = await browser.newContext();
    const origin = new URL(page.url()).origin;
    expect((await anonymous.request.post(`${origin}/api/sessions/${sessionId}/replay`, { data: { action: "stop" } })).status()).toBe(401);
    expect((await anonymous.request.post(`${origin}/api/sessions/${sessionId}/replay/turns`, { data: { text: "a", expectedIndex: 2, turnKey: crypto.randomUUID() } })).status()).toBe(401);
    await anonymous.close();
    expect(await status(sessionId)).toBe("replaying");
    expect(await db.turnsOfBranch((await db.replayOf(sessionId)).id)).toHaveLength(1);

    // The stop is the answer that ends the replay: it carries what was held, and from then on so does everything.
    const stopped = await (await post("replay", { action: "stop" })).json();
    expect(stopped).toEqual({ outcome: { level: "primary", result: "stopped", target: { content: TARGET.content, sampleQuestion: TARGET.sampleQuestion }, otherItem: null } });
    expect(await (await page.request.get(`/api/sessions/${sessionId}/reveal`)).text()).toContain(TARGET.content);
    const replayTurns = await (await page.request.get(`/api/sessions/${sessionId}/transcript?branch=replay`)).json();
    expect(replayTurns.turns).toEqual([{ index: 3, learnerText: expect.stringContaining("Chị hay định ghi lại lắm ạ?"), personaText: "Chị trả lời câu thứ 3 (trong khối dữ liệu).", leading: null }]);
    expect(await (await post("replay", { action: "start" })).json()).toEqual({ error: "not_offered" });
  });

  test("the turn that ends the replay carries the outcome, and sending it again returns the same answer without a model call", async ({ page, context }) => {
    const { sessionId } = await primaryOffer(page, context, "replay-resend");
    const post = (data: unknown) => page.request.post(`/api/sessions/${sessionId}/replay/turns`, { data: data as never, headers: { "content-type": "application/json" } });
    await page.request.post(`/api/sessions/${sessionId}/replay`, { data: { action: "start" } });

    const body = { text: OPENING_QUESTION, expectedIndex: 1, turnKey: crypto.randomUUID() };
    const first = await post(body);
    const done = (await first.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line)).at(-1);
    expect(done).toEqual({
      type: "done",
      personaText: "Chị trả lời câu thứ 3 (trong khối dữ liệu).",
      replayTurnIndex: 1,
      unchecked: false,
      outcome: { level: "primary", result: "success", target: { content: TARGET.content, sampleQuestion: TARGET.sampleQuestion }, otherItem: null },
    });

    const calls = (await db.llmCallsOf(sessionId)).length;
    const again = await post(body);
    expect(again.headers()["content-type"]).toContain("application/json");
    expect(await again.json()).toEqual({ personaText: done.personaText, replayTurnIndex: 1, unchecked: false, outcome: done.outcome });
    expect((await db.llmCallsOf(sessionId)).length).toBe(calls);
    expect(await (await post({ text: "Thêm một câu ạ?", expectedIndex: 2, turnKey: crypto.randomUUID() })).json()).toEqual({ error: "replay_ended" });
  });
});

test.describe("Màn 7 at 360px", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  const expectNoHorizontalScroll = async (page: Page) =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  test("the replay, its result and the result card fit the screen", async ({ page, context }) => {
    await primaryOffer(page, context, "replay-mobile");
    await startReplay(page, 3);
    await expectNoHorizontalScroll(page);
    await expect(composer(page)).toBeInViewport({ ratio: 1 });
    await expect(stopButton(page)).toBeInViewport({ ratio: 1 });

    // On a phone Enter breaks the line; the button sends.
    await composer(page).fill("Hồi đó chị ghi vào đâu ạ?");
    await composer(page).press("Enter");
    await expect(counter(page)).toHaveText("Bạn có 3 lượt");
    await composer(page).fill("Hồi đó chị ghi vào đâu ạ?");
    await sendButton(page).click();
    await expect(counter(page)).toHaveText("Lượt 1/3");
    await expectNoHorizontalScroll(page);

    // The transcript before the fork takes the whole screen, with its own way back.
    await page.getByRole("button", { name: "Xem toàn bộ transcript trước đó" }).click();
    const drawer = transcriptDrawer(page);
    const size = (await drawer.boundingBox())!;
    expect([size.width, size.height]).toEqual([360, 740]);
    await drawer.getByRole("button", { name: "Về luyện lại" }).click();
    await expect(drawer).toBeHidden();

    await askReplay(page, OPENING_QUESTION, 4, 2);
    await expect(result(page).locator(".headline-md")).toHaveText(`Đã mở khóa: ${TARGET.content}`);
    await expectNoHorizontalScroll(page);
    await expect(backToResult(page)).toBeVisible();

    await backToResult(page).click();
    await expect(replayCard(page).locator(".headline-md")).toHaveText(`Đã mở khóa: ${TARGET.content}`);
    await expectNoHorizontalScroll(page);
    await replayCard(page).getByRole("button", { name: "Xem 2 lượt luyện lại" }).click();
    await expect(replayDrawer(page).locator("li.turn")).toHaveCount(2);
    await expectNoHorizontalScroll(page);
  });
});
