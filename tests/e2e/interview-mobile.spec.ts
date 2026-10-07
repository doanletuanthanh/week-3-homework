import { expect, test, type Locator, type Page } from "@playwright/test";
import { ask, composer, expectReply, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { endButton, endDialog, endedHeading, expectSavedNotes, notes, playTurns, startInterview } from "./helpers/interview";

// The narrowest screen the product supports (NFR-11), with touch.
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

const RESEARCH_GOAL = "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?";
const notesButton = (page: Page) => page.getByRole("button", { name: "Ghi chú", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Ghi chú" });
const closeButton = (page: Page) => page.getByRole("button", { name: "Thu", exact: true });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("the element is not on screen");
  return found;
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("Màn 4 at 360px", () => {
  test("fits the screen: bar, last message, notes button and composer, with the notepad collapsed", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "m-layout");
    await playTurns(page.request, sessionId, 1, 6);
    await page.reload();

    await expectNoHorizontalScroll(page);
    const bar = page.locator(".sbar");
    await expect(bar.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(bar.locator(".code")).toHaveText("6/30");
    await expect(bar.locator(".code")).toBeInViewport({ ratio: 1 });
    // The long form of the seal counter is for wide screens.
    await expect(bar.locator(".pill")).toHaveText("11 điều chưa nói", { useInnerText: true });
    await expect(bar.locator(".pill")).toBeInViewport({ ratio: 1 });
    await expect(endButton(page)).toBeInViewport({ ratio: 1 });

    // Collapsed, the notepad is one button: it covers neither the composer nor the send button.
    await expect(notes(page)).toBeHidden();
    await expect(notesButton(page)).toBeInViewport({ ratio: 1 });
    await expect(composer(page)).toBeInViewport({ ratio: 1 });
    await expect(sendButton(page)).toBeInViewport({ ratio: 1 });
    expect(overlap(await box(notesButton(page)), await box(page.locator(".composer")))).toBe(false);
    // The newest reply is in view above them.
    await expect(page.locator(".bubble-p").last()).toBeInViewport({ ratio: 1 });
    expect(overlap(await box(page.locator(".bubble-p").last()), await box(notesButton(page)))).toBe(false);
  });

  test("the research question is one line until it is tapped; turn count and seal counter stay in view", async ({ page, context }) => {
    await startInterview(page, context, "m-goal");
    const goal = page.getByRole("button", { name: `Câu hỏi nghiên cứu: ${RESEARCH_GOAL}` });
    await expect(goal).toHaveAttribute("aria-expanded", "false");
    const collapsed = (await box(goal)).height;
    expect(await goal.locator(".rq-text").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    await goal.tap();
    await expect(goal).toHaveAttribute("aria-expanded", "true");
    expect((await box(goal)).height).toBeGreaterThan(collapsed);
    await expect(goal).toContainText(RESEARCH_GOAL);
    await expect(page.locator(".sbar .code")).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".sbar .pill")).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);

    await goal.tap();
    await expect(goal).toHaveAttribute("aria-expanded", "false");
  });

  test("Enter breaks the line and the send button sends", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "m-enter");

    await composer(page).fill("Dòng một");
    await composer(page).press("Enter");
    await composer(page).pressSequentially("dòng hai");
    await expect(composer(page)).toHaveValue("Dòng một\ndòng hai");
    expect(await db.turnsOf(sessionId)).toHaveLength(1);

    await sendButton(page).tap();
    await expectReply(page, 1);
    expect((await db.turnsOf(sessionId))[1].learnerText).toBe("Dòng một\ndòng hai");
    expect((await db.session(sessionId)).deviceClass).toBe("mobile");
    await expectNoHorizontalScroll(page);
  });

  test("a long unbroken question and its reply stay inside the screen", async ({ page, context }) => {
    await startInterview(page, context, "m-long");
    await ask(page, "khôngcókhoảngtrắng".repeat(20), 1);
    await expectNoHorizontalScroll(page);
    await expect(composer(page)).toBeInViewport({ ratio: 1 });
  });
});

test.describe("the notes sheet on mobile", () => {
  test("opens from the labelled button over the lower part of the screen, with the composer hidden and the last reply in view", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "m-open");
    await playTurns(page.request, sessionId, 1, 6);
    await page.reload();
    await composer(page).fill("Câu đang gõ dở");

    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "false");
    await notesButton(page).tap();

    await expect(sheet(page)).toBeVisible();
    await expect(notes(page)).toBeFocused();
    await expect(composer(page)).toBeHidden();
    await expect(sendButton(page)).toBeHidden();
    await expect(notesButton(page)).toBeHidden();
    // The sheet takes the lower part; the persona's last message stays readable above it.
    const sheetBox = await box(sheet(page));
    const lastReply = page.locator(".bubble-p").last();
    await expect(lastReply).toBeInViewport({ ratio: 1 });
    expect((await box(lastReply)).y + (await box(lastReply)).height).toBeLessThanOrEqual(sheetBox.y);
    expect(sheetBox.y + sheetBox.height).toBeGreaterThan(730);
    expect(sheetBox.height).toBeGreaterThan(300);
    await expectNoHorizontalScroll(page);

    await notes(page).fill("từng thử ghi chép rồi bỏ?");
    await expectSavedNotes(sessionId, "từng thử ghi chép rồi bỏ?");
  });

  test('"Thu" closes it: the composer is back with what was typed, and focus returns to the button', async ({ page, context }) => {
    await startInterview(page, context, "m-thu");
    await composer(page).fill("Câu đang gõ dở");
    await notesButton(page).tap();
    await notes(page).fill("ghi chú");

    await closeButton(page).tap();

    await expect(notes(page)).toBeHidden();
    await expect(composer(page)).toBeVisible();
    await expect(composer(page)).toHaveValue("Câu đang gõ dở");
    await expect(notesButton(page)).toBeFocused();
    await expect(notesButton(page)).toHaveAttribute("aria-expanded", "false");

    // The notes are still there when it is opened again.
    await notesButton(page).tap();
    await expect(notes(page)).toHaveValue("ghi chú");
  });

  test("Esc closes it and focus returns to the button", async ({ page, context }) => {
    await startInterview(page, context, "m-esc");
    await notesButton(page).tap();
    await expect(notes(page)).toBeFocused();
    await page.keyboard.type("gõ bằng bàn phím");

    await page.keyboard.press("Escape");

    await expect(notes(page)).toBeHidden();
    await expect(notesButton(page)).toBeFocused();
    await expect(composer(page)).toBeVisible();
    // Opened and closed with the keyboard alone.
    await page.keyboard.press("Enter");
    await expect(notes(page)).toBeFocused();
    await expect(notes(page)).toHaveValue("gõ bằng bàn phím");
  });

  test("a tap outside closes it", async ({ page, context }) => {
    await startInterview(page, context, "m-outside");
    await notesButton(page).tap();
    await expect(notes(page)).toBeVisible();

    await page.locator(".bubble-p").last().tap();

    await expect(notes(page)).toBeHidden();
    await expect(composer(page)).toBeVisible();
  });

  test("a swipe down on the handle closes it; a short drag does not", async ({ page, context }) => {
    await startInterview(page, context, "m-swipe");
    await notesButton(page).tap();
    const handle = await box(page.locator(".grab-zone"));
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 20, { steps: 3 });
    await page.mouse.up();
    await expect(notes(page)).toBeVisible();

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 140, { steps: 6 });
    await page.mouse.up();
    await expect(notes(page)).toBeHidden();
    await expect(composer(page)).toBeVisible();
  });

  test("the notes can be written while the persona is typing, and the reply arrives behind the sheet", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "m-typing");
    await composer(page).fill("Chị kể từ từ thôi nha [stub:slow]");
    await sendButton(page).tap();
    await expect(page.locator(".typing").filter({ hasText: "Chị Thu đang gõ…" })).toBeVisible();

    await notesButton(page).tap();
    await notes(page).fill("ghi khi chị đang gõ");

    await expect(page.locator("[data-streaming]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(".bubble-p").last()).toHaveText("Chị trả lời câu thứ 1 (trong khối dữ liệu).");
    await expect(page.locator(".bubble-p").last()).toBeInViewport({ ratio: 1 });
    // Still in the notes: the reply did not close the sheet or move focus.
    await expect(notes(page)).toBeFocused();
    await expectSavedNotes(sessionId, "ghi khi chị đang gõ");
  });

  test("the end dialog fits the screen and ends the session with the notes", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "m-end");
    await notesButton(page).tap();
    await notes(page).fill("ghi chú trên điện thoại");
    await closeButton(page).tap();

    await endButton(page).tap();
    await expect(endDialog(page)).toBeVisible();
    const dialog = await box(endDialog(page));
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(360);
    await expectNoHorizontalScroll(page);
    await endDialog(page).getByRole("button", { name: "Kết thúc buổi" }).tap();

    await expect(endedHeading(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect((await db.session(sessionId)).canvasText).toBe("ghi chú trên điện thoại");
  });
});
