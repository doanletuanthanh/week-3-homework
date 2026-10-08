import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { composer } from "./helpers/chat";
import { db } from "./helpers/db";
import { postEnd, startInterview } from "./helpers/interview";
import { PLAIN_QUESTIONS, PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess, guessHeading, playQuestions } from "./helpers/reveal";

/**
 * PRD §7, the column "Mở buổi dẫn tới": the URL of a session renders the screen of its state,
 * whichever screen was open before. One row per state of the table; each is opened by its URL
 * in a browser that pressed no button of the session (a learner coming back, or another device).
 */

type Row = {
  state: string;
  /** Brings a session of a new learner to the state and returns its id. */
  arrange: (page: Page, context: BrowserContext) => Promise<string>;
  /** What the URL shows. */
  expectScreen: (page: Page, sessionId: string) => Promise<void>;
};

const offer = async (page: Page, context: BrowserContext, label: string) => {
  const { sessionId } = await endedInterview(page, context, label, PRIMARY_QUESTIONS, PRIMARY_NOTES);
  await guess(page, 5);
  await expectResult(page, 5, 2);
  return sessionId;
};

const ROWS: Row[] = [
  {
    state: "interviewing, no learner turn → Màn 3 with 'Tiếp tục buổi luyện', which leads to Màn 4",
    arrange: async (page, context) => (await startInterview(page, context, "state-zero")).sessionId,
    expectScreen: async (page, sessionId) => {
      await expect(page).toHaveURL("/prep/chi-thu");
      await expect(page.getByRole("heading", { level: 1, name: "Thu" })).toBeVisible();
      await expect(composer(page)).toHaveCount(0);
      await page.getByRole("button", { name: "Tiếp tục buổi luyện" }).click();
      await expect(page).toHaveURL(`/sessions/${sessionId}`);
      await expect(composer(page)).toBeVisible();
      // Now that the button was pressed here, the URL itself is Màn 4, also after a reload.
      await page.reload();
      await expect(page).toHaveURL(`/sessions/${sessionId}`);
      await expect(composer(page)).toBeVisible();
    },
  },
  {
    state: "interviewing, asking → Màn 4 at the turn it stopped on, notes as they were left",
    arrange: async (page, context) => {
      const { sessionId } = await startInterview(page, context, "state-asking");
      await playQuestions(page.request, sessionId, PLAIN_QUESTIONS);
      expect((await page.request.put(`/api/sessions/${sessionId}/notes`, { data: { text: "ghi dở giữa buổi" } })).status()).toBe(200);
      return sessionId;
    },
    expectScreen: async (page, sessionId) => {
      await expect(page).toHaveURL(`/sessions/${sessionId}`);
      await expect(page.locator(".bubble-p").filter({ hasText: "Chị trả lời câu thứ 2" })).toBeVisible();
      await expect(composer(page)).toBeEnabled();
      await expect(page.getByRole("textbox", { name: "Ghi chú" })).toHaveValue("ghi dở giữa buổi");
    },
  },
  {
    state: "interviewing, ended, no guess → Màn 5",
    arrange: async (page, context) => (await endedInterview(page, context, "state-ended", PLAIN_QUESTIONS, "ghi vội")).sessionId,
    expectScreen: async (page) => {
      await expect(guessHeading(page)).toBeVisible();
      await expect(composer(page)).toHaveCount(0);
    },
  },
  {
    state: "interviewing, ended with no question asked → Màn 5, not Màn 3",
    arrange: async (page, context) => {
      const { sessionId } = await startInterview(page, context, "state-ended-empty");
      expect((await postEnd(page.request, sessionId, { canvasText: "" })).status).toBe(200);
      return sessionId;
    },
    expectScreen: async (page, sessionId) => {
      await expect(page).toHaveURL(`/sessions/${sessionId}`);
      await expect(guessHeading(page)).toBeVisible();
    },
  },
  {
    state: "revealed, result being computed → Màn 6 computing",
    arrange: async (page, context) => {
      const { sessionId } = await endedInterview(page, context, "state-computing", PLAIN_QUESTIONS, "ghi vội [stub:slow-reveal]");
      expect((await page.request.post(`/api/sessions/${sessionId}/guess`, { data: { guess: 4 } })).status()).toBe(200);
      return sessionId;
    },
    expectScreen: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bạn đoán 4.");
      await expect(page.getByRole("status").filter({ hasText: "Đang đối chiếu transcript và ghi chú của bạn…" })).toBeVisible();
      await expect(page.getByText("đã kể:")).toHaveCount(0);
    },
  },
  {
    state: "revealed → Màn 6 with the replay on offer",
    arrange: (page, context) => offer(page, context, "state-revealed"),
    expectScreen: async (page) => {
      await expectResult(page, 5, 2);
      await expect(page.locator(".replay-offer").getByRole("button", { name: "Quay lại lượt 3" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Tải về" })).toBeDisabled();
    },
  },
  {
    state: "replaying → Màn 7 at the replay turn it stopped on",
    arrange: async (page, context) => {
      const sessionId = await offer(page, context, "state-replaying");
      expect((await page.request.post(`/api/sessions/${sessionId}/replay`, { data: { action: "start" } })).status()).toBe(200);
      const turn = await page.request.post(`/api/sessions/${sessionId}/replay/turns`, { data: { text: "Hồi đó chị ghi vào đâu ạ?", expectedIndex: 1, turnKey: crypto.randomUUID() } });
      expect(turn.status()).toBe(200);
      return sessionId;
    },
    expectScreen: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: "Luyện lại từ lượt 3" })).toBeVisible();
      await expect(page.locator(".rbar-turns .label-md")).toHaveText("Lượt 1/3");
      await expect(page.locator(".rp-col")).toContainText("Hồi đó chị ghi vào đâu ạ?");
      await expect(composer(page)).toBeEnabled();
    },
  },
  {
    state: "done → Màn 6 as the read-only review",
    arrange: async (page, context) => {
      const sessionId = await offer(page, context, "state-done");
      expect((await page.request.post(`/api/sessions/${sessionId}/replay`, { data: { action: "skip" } })).status()).toBe(200);
      return sessionId;
    },
    expectScreen: async (page) => {
      await expectResult(page, 5, 2);
      await expect(page.locator(".replay-offer")).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Kết quả luyện lại" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Tải về" })).toBeEnabled();
      await expect(composer(page)).toHaveCount(0);
    },
  },
  {
    state: "withdrawn → the stopped page with the read-only transcript",
    arrange: async (page, context) => {
      const { sessionId } = await startInterview(page, context, "state-withdrawn");
      await playQuestions(page.request, sessionId, PLAIN_QUESTIONS);
      await db.setSessionStatus(sessionId, "withdrawn");
      return sessionId;
    },
    expectScreen: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây.");
      await expect(page.locator(".stopped-log .k")).toHaveText(["Lượt 00", "Lượt 01", "Lượt 02"]);
      await expect(page.locator(".stopped-log .pill")).toHaveText("Chỉ đọc");
      await expect(composer(page)).toHaveCount(0);
    },
  },
  {
    state: "withdrawn before any question → the stopped page, not Màn 3",
    arrange: async (page, context) => {
      const { sessionId } = await startInterview(page, context, "state-withdrawn-empty");
      await db.setSessionStatus(sessionId, "withdrawn");
      return sessionId;
    },
    expectScreen: async (page, sessionId) => {
      await expect(page).toHaveURL(`/sessions/${sessionId}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây.");
      await expect(page.locator(".stopped-text")).toContainText("dừng ở lượt 0");
    },
  },
];

test.describe("PRD §7: the URL of a session renders the screen of its state", () => {
  for (const row of ROWS) {
    test(row.state, async ({ page, context }) => {
      const sessionId = await row.arrange(page, context);
      // As a learner coming back: no button of this session was pressed in this browser.
      await context.clearCookies({ name: "il_entered" });
      await page.goto("/");

      await page.goto(`/sessions/${sessionId}`);

      await row.expectScreen(page, sessionId);
    });
  }

  // `generating` and `failed_eval` exist only for custom topics. Their screen (Màn 11) is built
  // with the custom-topic path; until then a session cannot reach either state.
  test.fixme("generating → Màn 11, being prepared (custom topics)", () => {});
  test.fixme("failed_eval → Màn 11, did not pass the checks (custom topics)", () => {});
});
