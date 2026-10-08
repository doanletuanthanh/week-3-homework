import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { db } from "./db";
import { postEnd, startInterview } from "./interview";
import { postTurn, turnOutcome } from "./turn-api";

/** The stub marker that steers Call 1 for one question. */
const analysis = (value: object) => `[stub:analysis=${JSON.stringify(value)}]`;
const verdict = (hookDropped: boolean, told: string[] = []) => ({ hook_dropped: hookDropped, disclosed_item_ids: told, violations: [] });

// Aliases of chị Thu's items as the prompts show them: the item's position in the scenario.
// I2/T2 paid-app, I3/T3 last-attempt, I5/T5 money-home.

/**
 * Six questions that leave one of everything a reveal shows: `money-home` and `last-attempt` told,
 * the hooks of `paid-app` (turn 2) and `shame` (turn 3) ignored, a leading question at turn 4 (the
 * words "tại chị lười"), two questions about the future. The replay moment is `paid-app`.
 */
export const PRIMARY_QUESTIONS = [
  `Chị quản lý tiền nong thế nào ạ? ${analysis({ topic_tags: ["T5"], question_type: "open" })}`,
  `Chị có hay ghi lại chi tiêu không ạ? ${analysis({ prev_turn_verdict: verdict(true, ["I5"]), topic_tags: ["T2"] })}`,
  `Lần gần nhất chị ghi là khi nào ạ? ${analysis({ prev_turn_verdict: verdict(true), topic_tags: ["T3"], question_type: "past_specific", label: "confirm_grounded", grounded_turn_id: 2 })}`,
  `Chắc tại chị lười nên mới bỏ đúng không ạ? ${analysis({ prev_turn_verdict: verdict(true, ["I3"]), label: "leading", introduced_span: [1, 3] })}`,
  `Sau này chị có định ghi lại không ạ? ${analysis({ question_type: "hypothetical_future" })}`,
  `Nếu có app tự ghi thì chị sẽ dùng chứ ạ? ${analysis({ question_type: "hypothetical_future" })}`,
];

/** A leading question at turn 1 and nothing else to replay: fallback 1. */
export const LEADING_QUESTIONS = [
  `Chắc chị ngại ghi lắm đúng không ạ? ${analysis({ label: "leading", introduced_span: [1, 3] })}`,
  "Chị kể thêm cho em nghe được không ạ?",
];

/** Nothing ignored and nothing leading: no replay moment. */
export const PLAIN_QUESTIONS = ["Chị kể em nghe về công việc của chị được không ạ?", "Chị đi làm bằng gì ạ?"];

const judge = (matches: { range: [number, number]; kind: "item" | "never_said"; item_id: string | null }[]) =>
  `[stub:judge=${JSON.stringify({ canvas_matches: matches.map((match) => ({ ...match, reason: "r" })) })}]`;

/**
 * Notes for `PRIMARY_QUESTIONS`, with what the stubbed end judge finds in them: a told item
 * (tokens 0–6), the replay target (7–14) and something nobody said (15–20).
 */
export const PRIMARY_NOTES = [
  "mỗi tháng gửi ba mẹ 3 triệu",
  "đang trả phí cho app mà không dùng",
  "lương thấp nên khó để dành",
  judge([
    { range: [0, 6], kind: "item", item_id: "I5" },
    { range: [7, 14], kind: "item", item_id: "I2" },
    { range: [15, 20], kind: "never_said", item_id: null },
  ]),
].join("\n");

export async function playQuestions(request: APIRequestContext, sessionId: string, questions: string[]) {
  for (const [position, text] of questions.entries()) {
    expect(turnOutcome(await postTurn(request, sessionId, { text, expectedIndex: position + 1 }))).toMatchObject({ turnIndex: position + 1 });
  }
}

/** A learner whose session was played and ended through the API, with the page on the guess screen. */
export async function endedInterview(page: Page, context: BrowserContext, label: string, questions: string[], notes: string) {
  const started = await startInterview(page, context, label);
  await playQuestions(page.request, started.sessionId, questions);
  expect((await postEnd(page.request, started.sessionId, { canvasText: notes })).status).toBe(200);
  await page.reload();
  await expect(guessHeading(page)).toBeVisible();
  return started;
}

export const guessHeading = (page: Page) => page.getByRole("heading", { name: "Bạn nghĩ chị Thu đã kể cho bạn bao nhiêu trong 11 điều?" });
export const slider = (page: Page) => page.getByRole("slider", { name: "Số điều chị Thu đã kể" });
export const seeResult = (page: Page) => page.getByRole("button", { name: "Xem kết quả" });

/** Chooses a number on the slider with the keyboard and sends it. */
export async function guess(page: Page, value: number) {
  await slider(page).focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < value; step += 1) await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toHaveAttribute("aria-valuetext", `${value} trên 11`);
  await seeResult(page).click();
}

/** Waits for the result screen: the line that only exists once the reveal is ready. */
export async function expectResult(page: Page, guessed: number, told: number) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bạn đoán ${guessed}.Chị Thu đã kể: ${told} trên 11.`, { timeout: 20_000 });
}

/** The reveal calls a session made, in order. */
export async function revealCallsOf(sessionId: string) {
  return (await db.llmCallsOf(sessionId)).filter((row) => ["END_JUDGE", "FEEDBACK", "VERIFIER"].includes(row.role));
}

export const transcriptDrawer = (page: Page) => page.getByRole("dialog", { name: "Transcript buổi chính" });
