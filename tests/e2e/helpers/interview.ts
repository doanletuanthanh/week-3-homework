import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { signInAsNewLearner, uniqueEmail } from "./auth";
import { db } from "./db";
import { postTurn, turnOutcome } from "./turn-api";

/** A consenting learner inside a fresh session with the persona, on Màn 4. */
export async function startInterview(page: Page, context: BrowserContext, label: string) {
  const email = uniqueEmail(label);
  const userId = await signInAsNewLearner(context, email);
  await page.goto("/data-notice?next=/prep/chi-thu");
  await page.getByRole("button", { name: "Tôi hiểu" }).click();
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  return { userId, email, sessionId: page.url().split("/").pop()! };
}

export const notes = (page: Page) => page.getByRole("textbox", { name: "Ghi chú" });
export const endButton = (page: Page) => page.getByRole("button", { name: "Kết thúc buổi" });
export const endDialog = (page: Page) => page.getByRole("alertdialog", { name: "Kết thúc và đóng băng ghi chú?" });
export const endedHeading = (page: Page) => page.getByRole("heading", { name: "Buổi luyện đã kết thúc." });

/** Waits until the server holds exactly this text as the session's notes. */
export async function expectSavedNotes(sessionId: string, text: string) {
  await expect.poll(async () => (await db.session(sessionId)).canvasText).toBe(text);
}

/** Plays learner turns `from`..`to` through the API, without the page. */
export async function playTurns(request: APIRequestContext, sessionId: string, from: number, to: number) {
  for (let turn = from; turn <= to; turn += 1) {
    expect(turnOutcome(await postTurn(request, sessionId, { text: `Câu ${turn}`, expectedIndex: turn }))).toMatchObject({ turnIndex: turn });
  }
}

type JsonReply = { status: number; json: Record<string, unknown> | null };

async function sendJson(request: APIRequestContext, method: "put" | "post", url: string, data: unknown): Promise<JsonReply> {
  const response = await request[method](url, { data: data as never, headers: { "content-type": "application/json" } });
  const raw = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Not JSON: the caller sees the status and a null body.
  }
  return { status: response.status(), json };
}

/** The notes autosave, as the page sends it. */
export const putNotes = (request: APIRequestContext, sessionId: string, body: unknown) =>
  sendJson(request, "put", `/api/sessions/${sessionId}/notes`, body);

/** The end request, as the page sends it. */
export const postEnd = (request: APIRequestContext, sessionId: string, body: unknown) =>
  sendJson(request, "post", `/api/sessions/${sessionId}/end`, body);
