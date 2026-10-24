import { expect, type Page } from "@playwright/test";

export const composer = (page: Page) => page.getByLabel("Câu hỏi của bạn");
export const sendButton = (page: Page) => page.getByRole("button", { name: "Gửi" });

/**
 * The `topic` of a `[stub:analysis=...]` marker: the question asks about the topic of this alias
 * (T1, T2...) directly, and its first token stands for the words that show it.
 */
export const directTopic = (tag: string) => ({ direct: tag, direct_span: [0, 0], broad: [] as string[] });

/**
 * Waits until the stubbed persona's Nth reply is a finished turn. The text alone is not enough:
 * it is on screen while it is still streaming, before the turn is written.
 */
export async function expectReply(page: Page, replyNumber: number) {
  await expect(page.locator(".bubble-p").filter({ hasText: `Chị trả lời câu thứ ${replyNumber} (trong khối dữ liệu).` })).toBeVisible();
  await expect(page.locator("[data-streaming]")).toHaveCount(0);
  await expect(composer(page)).toBeEnabled();
}

export async function ask(page: Page, text: string, replyNumber: number) {
  await composer(page).fill(text);
  await sendButton(page).click();
  await expectReply(page, replyNumber);
}
