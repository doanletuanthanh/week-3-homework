import { expect, test } from "@playwright/test";
import { getDb } from "@/db/client";
import { runAdjudicate } from "../../cli/commands/adjudicate";
import { runPublish, runUnpublish } from "../../cli/commands/publish";
import { approveEverything, seedFullRun } from "../helpers/publish-fixtures";
import { signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { ask, composer, sendButton } from "./helpers/chat";
import { db } from "./helpers/db";
import { postTurn } from "./helpers/turn-api";

const BEING_UPDATED = "Nhân vật này đang được cập nhật.";
const thanh = () => "admin-e2e@example.com";
const linh = () => "second-admin-e2e@example.com";

/** Runs an operator command the way `pnpm il` does, against the database the app under test uses. */
async function il(command: (args: string[], io: { out: (line: string) => void; err: (line: string) => void }) => Promise<number>, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await command(args, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

const publish = () => il((args, io) => runPublish(args, io, getDb(), thanh), ["chi-thu"]);
const startButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Bắt đầu" });

test.describe("publish and unpublish, as a learner sees them", () => {
  test.beforeEach(async () => {
    await db.requirePublished();
  });

  test.afterEach(async () => {
    await db.clearConfig();
    await db.resetPublishState();
  });

  test("a refused publish changes nothing; a passed one lets the learner start; unpublish with --stop-sessions ends the session", async ({ page, context }) => {
    const userId = await signInAsNewLearner(context, uniqueEmail("publish"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page.locator("main [role=alert]")).toHaveText(BEING_UPDATED);

    // Nothing has been evaluated or approved: the gate refuses and the learner still cannot start.
    const refused = await publish();
    expect(refused.code).toBe(1);
    expect(refused.err[0]).toBe("KHÔNG publish chi-thu phiên bản 1: 3 lý do");
    await page.reload();
    await expect(page.locator("main [role=alert]")).toHaveText(BEING_UPDATED);
    await expect(startButton(page)).toHaveCount(0);

    // A full run with one flag, both admins dismiss it, every string checked and approved.
    await seedFullRun([{ episode: "adversarial-05", turn: 3 }]);
    await approveEverything(thanh);
    const stillOpen = await publish();
    expect(stillOpen.err).toEqual(["KHÔNG publish chi-thu phiên bản 1: 1 lý do", "  - Còn 1 cờ rò rỉ chưa được hai quản trị viên phân xử."]);
    const list = await il((args, io) => runAdjudicate(args, io, getDb(), thanh), ["list", "chi-thu"]);
    const flagId = list.out.find((line) => line.startsWith("Cờ "))!.slice("Cờ ".length);
    expect((await il((args, io) => runAdjudicate(args, io, getDb(), thanh), [flagId, "not-leak", "Chỉ nhắc sự thật bề mặt."])).code).toBe(0);
    expect((await il((args, io) => runAdjudicate(args, io, getDb(), linh), [flagId, "not-leak", "Đồng ý."])).code).toBe(0);

    const passed = await publish();
    expect(passed.err).toEqual([]);
    expect(passed.code).toBe(0);
    expect(await db.scenarioOf("chi-thu")).toMatchObject({ status: "published", interimGate: true });

    // The learner can now start and talk to the persona.
    await page.reload();
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionId = page.url().split("/").pop()!;
    await ask(page, "Chị kể em nghe về chuyện chi tiêu của chị được không ạ?", 1);

    // The operator pulls the persona and stops the sessions on it.
    const pulled = await il((args, io) => runUnpublish(args, io, getDb(), thanh), ["chi-thu", "--stop-sessions"]);
    // Sessions other tests left unfinished on this version are withdrawn with it, so the count varies.
    expect(pulled.out).toEqual([
      "Đã gỡ 1 phiên bản của chi-thu (admin-e2e@example.com). Không buổi mới nào bắt đầu được với persona này.",
      expect.stringMatching(/^Đã rút \d+ buổi chưa xong\.$/),
    ]);
    expect((await db.session(sessionId)).status).toBe("withdrawn");

    // The turn API refuses a question on the withdrawn session, and no model is called for it.
    const callsBefore = (await db.llmCallsOf(sessionId)).length;
    const reply = await postTurn(page.request, sessionId, { text: "Chị kể thêm đi ạ?", expectedIndex: 2 });
    expect(reply.status).not.toBe(200);
    expect(reply.raw).toContain("session_ended");
    expect(await db.llmCallsOf(sessionId)).toHaveLength(callsBefore);
    expect(await db.turnsOf(sessionId)).toHaveLength(2);

    // What was said stays readable; nothing more can be sent.
    await page.reload();
    await expect(page.getByText("Chị trả lời câu thứ 1 (trong khối dữ liệu).")).toBeVisible();
    await expect(composer(page)).toBeDisabled();
    await expect(sendButton(page)).toBeDisabled();

    // The persona is pulled: the prep screen is back to "being updated", and a withdrawn session
    // does not count as the learner's one session with the persona.
    await page.goto("/prep/chi-thu");
    await expect(page.locator("main [role=alert]")).toHaveText(BEING_UPDATED);
    await expect(startButton(page)).toHaveCount(0);
    expect((await db.sessionsOf(userId)).map((session) => session.status)).toEqual(["withdrawn"]);
  });

  test("unpublish without --stop-sessions blocks new learners and lets a running session go on", async ({ page, context, browser }) => {
    await seedFullRun();
    await approveEverything(thanh);
    expect((await publish()).code).toBe(0);

    await signInAsNewLearner(context, uniqueEmail("keeps-going"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await startButton(page).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionId = page.url().split("/").pop()!;
    await ask(page, "Chị kể em nghe về chuyện chi tiêu của chị được không ạ?", 1);

    const pulled = await il((args, io) => runUnpublish(args, io, getDb(), thanh), ["chi-thu"]);
    expect(pulled.out[1]).toBe("Các buổi đang diễn ra tiếp tục trên phiên bản cũ.");

    // The session that was under way continues on the version it started on.
    await ask(page, "Rồi sau đó thì sao ạ?", 2);
    expect((await db.session(sessionId)).status).toBe("interviewing");
    expect(await db.turnsOf(sessionId)).toHaveLength(3);

    // A learner who had not started cannot start now.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const otherId = await signInAsNewLearner(otherContext, uniqueEmail("too-late"));
    await other.goto("/data-notice?next=/prep/chi-thu");
    await other.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(other.locator("main [role=alert]")).toHaveText(BEING_UPDATED);
    await expect(startButton(other)).toHaveCount(0);
    expect(await db.sessionsOf(otherId)).toHaveLength(0);
    await otherContext.close();
  });
});
