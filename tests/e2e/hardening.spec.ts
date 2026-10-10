import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { getDb } from "@/db/client";
import type { AppUser } from "@/server/auth";
import { openSession } from "@/server/sessions";
import { DELETE_ACCOUNT } from "@/strings/product-strings";
import { runMeasureLatency } from "../../cli/commands/measure-latency";
import { LOCAL_SUPABASE_URL } from "../helpers/local-stack";
import { ensureAccount, signIn, signInAndAccept } from "./helpers/auth";
import { ask, composer } from "./helpers/chat";
import { db } from "./helpers/db";
import { endButton, endDialog, expectSavedNotes, notes, startInterview } from "./helpers/interview";
import { LEADING_QUESTIONS, PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess, guessHeading } from "./helpers/reveal";
import { APP_URL, DEMO_LIST_EMAIL } from "./helpers/stack";

/** What a learner could type hoping the page runs it. `window.__xss` is set if any of it ever does. */
const HOSTILE = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1"><b>đậm</b>';
const xss = (page: Page) => page.evaluate(() => (window as unknown as { __xss?: number }).__xss);

/** The text is on the page as typed, and brought no element with it. */
async function expectShownAsText(page: Page, selector: string) {
  const holder = page.locator(selector).filter({ hasText: HOSTILE }).first();
  await expect(holder).toBeVisible();
  await expect(holder.locator("script, img, b")).toHaveCount(0);
  expect(await xss(page)).toBeUndefined();
}

/** Collects every refusal of the Content-Security-Policy on any page of the context. */
async function watchCsp(context: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  await context.exposeBinding("__cspViolation", (_source, violation: string) => void violations.push(violation));
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (window as unknown as { __cspViolation: (violation: string) => Promise<void> }).__cspViolation(`${event.violatedDirective} ${event.blockedURI} on ${location.pathname}`);
    });
  });
  return violations;
}

const nonceOf = (policy: string | undefined) => policy?.match(/'nonce-([A-Za-z0-9+/=]+)'/u)?.[1];

test.describe("security headers", () => {
  test("every response carries them: a page, the library and a topic, a redirect, an API answer, a page that is not there", async ({ page, context }) => {
    await signInAndAccept(page, context, "headers");
    const guest = await page.context().browser()!.newContext();

    const responses = [
      await guest.request.get("/"),
      await guest.request.get("/sign-in"),
      await guest.request.get("/library"),
      await guest.request.get("/topics/ux-chi-tieu"),
      // What a client navigation asks for, and a topic that is not there.
      await guest.request.get("/library", { headers: { RSC: "1" } }),
      await guest.request.get("/topics/khong-co"),
      await guest.request.get("/my-sessions", { maxRedirects: 0 }),
      await guest.request.get("/api/sessions"),
      await guest.request.get("/no-such-page"),
      await page.request.get("/my-sessions"),
      await page.request.get("/library"),
      await page.request.get("/topics/ux-chi-tieu"),
      await page.request.get("/api/sessions"),
    ];
    expect(responses.map((response) => response.status())).toEqual([200, 200, 200, 200, 200, 404, 307, 401, 404, 200, 200, 200, 200]);

    for (const response of responses) {
      const headers = response.headers();
      const where = response.url();
      expect(headers["x-content-type-options"], where).toBe("nosniff");
      expect(headers["x-frame-options"], where).toBe("DENY");
      expect(headers["referrer-policy"], where).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"], where).toContain("camera=()");
      expect(headers["strict-transport-security"], where).toContain("max-age=63072000");
      expect(headers["x-powered-by"], where).toBeUndefined();

      const policy = headers["content-security-policy"];
      expect(policy, where).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'(;|$)/u);
      expect(policy, where).toContain("default-src 'self'");
      expect(policy, where).toContain("connect-src 'self';");
      expect(policy, where).toContain("frame-ancestors 'none'");
      expect(policy, where).toContain("object-src 'none'");
      expect(policy, where).toContain("base-uri 'self'");
      expect(policy, where).toContain(`form-action 'self' ${LOCAL_SUPABASE_URL} https://accounts.google.com`);
      expect(policy, where).not.toContain("unsafe-eval");
    }
    await guest.close();
  });

  test("a built file is served with nosniff as well", async ({ page }) => {
    await page.goto("/");
    const stylesheet = await page.locator('link[rel="stylesheet"]').first().getAttribute("href");
    const response = await page.request.get(stylesheet!);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("the nonce is new for every response, and it is the one on every script of the page", async ({ page }) => {
    const first = await page.request.get("/");
    const second = await page.request.get("/");
    const nonce = nonceOf(first.headers()["content-security-policy"]);
    expect(nonce).toBeTruthy();
    expect(nonceOf(second.headers()["content-security-policy"])).not.toBe(nonce);

    const scripts = (await first.text()).match(/<script\b[^>]*>/gu) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);
  });

  test("the browser enforces it: an inline handler does not run, a string is not evaluated", async ({ page, context }) => {
    const violations = await watchCsp(context);
    await page.goto("/");

    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<img src="/missing.png" onerror="window.__xss=1">'));
    await expect.poll(() => violations.some((violation) => violation.startsWith("script-src-attr"))).toBe(true);
    expect(await xss(page)).toBeUndefined();

    // A string handed to a timer is evaluated like `eval`, and the page's own policy decides on it.
    await page.evaluate(() => void setTimeout("window.__xss=2", 0));
    await expect.poll(() => violations.some((violation) => violation.startsWith("script-src ") && violation.includes(" eval "))).toBe(true);
    expect(await xss(page)).toBeUndefined();
  });

  test("a whole session breaks none of it: pages, fonts, requests and the streamed reply all load", async ({ page, context }) => {
    const violations = await watchCsp(context);
    const refused: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/u.test(message.text())) refused.push(message.text());
    });
    // A request the browser gave up on because the page moved on (`ERR_ABORTED`) is no refusal.
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") refused.push(`${request.failure()?.errorText} ${request.url()}`);
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Into the library and down to a persona by the links, so the pages come as a client navigation brings them.
    await page.locator(".hero").getByRole("link", { name: "Vào thư viện" }).click();
    await expect(page).toHaveURL("/library");
    // The role filter is a form posted to the page itself.
    const ux = page.getByRole("group", { name: "Lọc theo vai trò" }).getByRole("button", { name: "UX", exact: true });
    await ux.click();
    await expect(ux).toHaveAttribute("aria-pressed", "true");
    await page.locator('a.tcard[href="/topics/ux-chi-tieu"]').click();
    await expect(page).toHaveURL("/topics/ux-chi-tieu");
    await expect(page.getByRole("heading", { level: 1, name: "Chi tiêu hằng ngày của người trẻ đi làm" })).toBeVisible();
    await page.getByRole("link", { name: "Bắt đầu", exact: true }).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await page.goto("/topics/khong-co");
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Đăng nhập với Google" })).toBeVisible();
    // The three typefaces are files of this origin.
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").length)).toBe(0);
    expect(await page.evaluate(() => [...document.fonts].some((font) => font.status === "loaded"))).toBe(true);

    const { sessionId } = await startInterview(page, context, "csp-walk");
    // The page is hydrated: a question goes out and its reply streams in.
    await ask(page, "Chị kể em nghe về công việc của chị được không ạ?", 1);
    await notes(page).fill("làm kế toán");
    await expectSavedNotes(sessionId, "làm kế toán");
    await endButton(page).click();
    await endDialog(page).getByRole("button", { name: "Kết thúc buổi" }).click();
    await expect(guessHeading(page)).toBeVisible();
    await guess(page, 0);
    await expectResult(page, 0, 0);
    await page.goto("/my-sessions");
    await expect(page.getByRole("heading", { level: 1, name: "Buổi của tôi" })).toBeVisible();
    await page.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" }).click();
    await expect(page.getByRole("alertdialog", { name: DELETE_ACCOUNT.title })).toBeVisible();
    await page.goto("/custom-topic");
    await expect(page.getByRole("heading", { level: 1, name: "Tạo chủ đề của bạn" })).toBeVisible();
    // The library and the topic as a learner has them: the progress, and the card that follows the session.
    await page.goto("/library");
    await expect(page.locator('a.tcard[href="/topics/ux-chi-tieu"] .tcard-done')).toBeVisible();
    await page.locator('a.tcard[href="/topics/ux-chi-tieu"]').click();
    await expect(page.locator(".topic-done")).toBeVisible();
    await expect(page.locator("article.pcard .actionbar a").first()).toBeVisible();
    await page.goto("/no-such-page");

    expect(violations).toEqual([]);
    expect(refused).toEqual([]);
  });

  test("the sign-in form posted before any script ran still reaches the auth server", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/sign-in?next=/my-sessions");

    // The form's own post, then the redirect to the auth server: `form-action` has to allow both.
    const left = page.waitForRequest((request) => request.url().startsWith(`${LOCAL_SUPABASE_URL}/auth/v1/authorize`));
    await page.getByRole("button", { name: "Đăng nhập với Google" }).click();
    const authorize = new URL((await left).url());

    expect(authorize.searchParams.get("provider")).toBe("google");
    expect(authorize.searchParams.get("redirect_to")).toBe(`${APP_URL}/auth/callback?next=%2Fmy-sessions`);
    await context.close();
  });
});

test.describe("the method page (FR-62)", () => {
  test("/phuong-phap is not found, and nothing links to it", async ({ page, context }) => {
    const response = await page.goto("/phuong-phap");
    expect(response?.status()).toBe(404);

    const linksToIt = (current: Page) => current.locator('a[href*="phuong-phap"]').or(current.getByRole("link", { name: /Phương pháp/iu }));
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(linksToIt(page)).toHaveCount(0);
    await signInAndAccept(page, context, "method-page");
    await expect(linksToIt(page)).toHaveCount(0);
    expect((await page.request.get("/phuong-phap")).status()).toBe(404);
  });
});

test.describe("learner text with HTML in it is shown as text (NFR-5)", () => {
  test("a question and the notes: on the interview, after a reload, and in the transcript of a stopped session", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "escape-interview");

    await ask(page, HOSTILE, 1);
    await expectShownAsText(page, ".bubble-me");
    await notes(page).fill(HOSTILE);
    await expectSavedNotes(sessionId, HOSTILE);
    expect((await db.turnsOf(sessionId))[1].learnerText).toBe(HOSTILE);

    await page.reload();
    await expectShownAsText(page, ".bubble-me");
    await expect(notes(page)).toHaveValue(HOSTILE);

    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây." })).toBeVisible();
    await expectShownAsText(page, '.stopped-log [data-turn="1"] .tl');
  });

  test("the notes on the result, and the question in the transcript drawer", async ({ page, context }) => {
    const [first, ...rest] = LEADING_QUESTIONS;
    await endedInterview(page, context, "escape-reveal", [`${first} ${HOSTILE}`, ...rest], HOSTILE);
    await guess(page, 1);
    await expectResult(page, 1, 0);

    await expectShownAsText(page, ".notes-review .paper");

    // The replay on offer is skipped: the comments, with their way into the transcript, are open.
    await page.locator(".replay-offer").getByRole("button", { name: "Bỏ qua, cho tôi xem luôn" }).click();
    await page.getByRole("alertdialog", { name: "Bỏ qua lần luyện lại?" }).getByRole("button", { name: "Cho tôi xem luôn" }).click();
    await page.getByRole("button", { name: "Lượt 1", exact: true }).first().click();
    const drawer = page.getByRole("dialog", { name: "Transcript buổi chính" });
    await expect(drawer.locator('[data-turn="1"]')).toContainText(HOSTILE);
    await expect(drawer.locator("script, img, b")).toHaveCount(0);
    expect(await xss(page)).toBeUndefined();
  });

  test("a custom topic and its focus: while it is prepared, when it did not pass, in the list, and back in the form", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signInAndAccept(page, context, "escape-topic", "/custom-topic");
    await page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?").fill(`${HOSTILE} [stub:invalid]`);
    await page.getByLabel(/^Bạn muốn luyện điều gì trong buổi này\?/u).fill(HOSTILE);
    await page.getByRole("button", { name: "Tạo kịch bản" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/u);
    const sessionId = page.url().split("/").pop()!;

    // Whichever of the two screens is up, the topic on it is text.
    await expectShownAsText(page, ".gen-card");
    await expect(page.locator(".failed-card")).toBeVisible({ timeout: 60_000 });
    await expectShownAsText(page, ".failed-facts dd");

    await page.goto("/my-sessions");
    await expectShownAsText(page, `.srows a[href="/sessions/${sessionId}"]`);

    await page.goto(`/custom-topic?retry=${sessionId}`);
    await expect(page.getByLabel("Bạn muốn phỏng vấn người dùng về chủ đề gì?")).toHaveValue(`${HOSTILE} [stub:invalid]`);
    await expect(page.getByLabel(/^Bạn muốn luyện điều gì trong buổi này\?/u)).toHaveValue(HOSTILE);
    expect(await xss(page)).toBeUndefined();
  });
});

test.describe("accessibility notes of the review", () => {
  test("the delete dialog reads out what deleting does", async ({ page, context }) => {
    await signInAndAccept(page, context, "a11y-delete");
    await page.getByRole("button", { name: "Xóa tài khoản và toàn bộ dữ liệu" }).click();

    const dialog = page.getByRole("alertdialog", { name: DELETE_ACCOUNT.title });
    await expect(dialog).toHaveAccessibleDescription(`${DELETE_ACCOUNT.body} ${DELETE_ACCOUNT.kept}`);
  });

  test("the skip and the stop dialogs of a replay read out what they do", async ({ page, context }) => {
    await endedInterview(page, context, "a11y-replay", PRIMARY_QUESTIONS, PRIMARY_NOTES);
    await guess(page, 5);
    await expectResult(page, 5, 2);

    await page.locator(".replay-offer").getByRole("button", { name: "Bỏ qua, cho tôi xem luôn" }).click();
    const skip = page.getByRole("alertdialog", { name: "Bỏ qua lần luyện lại?" });
    await expect(skip).toHaveAccessibleDescription("Bạn sẽ không thử lại được khoảnh khắc này.");
    await skip.getByRole("button", { name: "Ở lại" }).click();

    await page.locator(".replay-offer").getByRole("button", { name: "Quay lại lượt 3" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Luyện lại từ lượt 3" })).toBeVisible();
    await page.locator(".rbar").getByRole("button", { name: "Dừng" }).click();
    await expect(page.getByRole("alertdialog", { name: "Dừng luyện lại?" })).toHaveAccessibleDescription("Điều bị giữ sẽ được mở ra.");
  });

  test("'Tải thêm' says how many rows it added, each time, and puts focus on the first of them", async ({ page }) => {
    const id = await ensureAccount(DEMO_LIST_EMAIL);
    await signIn(page.context(), DEMO_LIST_EMAIL);
    const demo: AppUser = { id, email: DEMO_LIST_EMAIL, isAdmin: false, isDemo: true, noticeAcked: true, roleFilter: null };
    await page.goto("/data-notice?next=/my-sessions");
    const agree = page.getByRole("button", { name: "Tôi hiểu" });
    const heading = page.getByRole("heading", { level: 1, name: "Buổi của tôi" });
    await expect(agree.or(heading)).toBeVisible();
    if (await agree.isVisible()) await agree.click();
    await expect(heading).toBeVisible();
    // Enough for three pages of twenty, so two loads add the same number of rows.
    for (let count = (await db.sessionsOf(id)).length; count < 60; count += 1) expect((await openSession(getDb(), demo, "chi-thu")).ok).toBe(true);

    await page.goto("/my-sessions");
    const rows = page.locator(".srows li");
    const announcement = page.locator('.slist [aria-live="polite"]');
    await expect(rows).toHaveCount(20);
    await expect(announcement).toHaveText("");

    await page.getByRole("button", { name: "Tải thêm" }).click();
    await expect(rows).toHaveCount(40);
    await expect(announcement).toHaveText("Đã thêm 20 buổi, đang hiện 40 buổi.");
    await expect(rows.nth(20).locator("a")).toBeFocused();

    // The second load adds twenty as well: its line is a new one, so it is read out too.
    await page.getByRole("button", { name: "Tải thêm" }).click();
    await expect(rows).toHaveCount(60);
    await expect(announcement).toHaveText("Đã thêm 20 buổi, đang hiện 60 buổi.");
    await expect(rows.nth(40).locator("a")).toBeFocused();
  });

  test("a stopped session's transcript is a list of its turns", async ({ page, context }) => {
    const { sessionId } = await startInterview(page, context, "a11y-stopped");
    await ask(page, "Chị kể em nghe về công việc của chị được không ạ?", 1);
    await db.setSessionStatus(sessionId, "withdrawn");
    await page.reload();

    const log = page.getByRole("region", { name: "Transcript" });
    await expect(log.getByRole("listitem")).toHaveCount(2);
    await expect(log.getByRole("listitem").nth(0)).toContainText("Lượt 00");
    await expect(log.getByRole("listitem").nth(1)).toContainText("Lượt 01");
    await expect(log.getByRole("listitem").nth(1)).toContainText("BẠN");
    await expect(composer(page)).toHaveCount(0);
  });
});

test.describe("il measure-latency against the running app", () => {
  test("plays a session over HTTP with the account's cookies, to its result", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { sessionId } = await startInterview(page, context, "measure");
    const cookie = (await context.cookies(APP_URL)).map(({ name, value }) => `${name}=${value}`).join("; ");
    const out: string[] = [];
    const err: string[] = [];

    const code = await runMeasureLatency([APP_URL, "--session", sessionId, "--turns", "3"], { out: (line) => out.push(line), err: (line) => err.push(line) }, { cookie });

    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out.filter((line) => /^ {2}lượt \d\d: \d+\.\d\d s \(chữ đầu sau \d+\.\d\d s\)$/u.test(line))).toHaveLength(3);
    expect(out.some((line) => /^Lượt \(tới hết câu trả lời\): p50 .* · 3 mẫu$/u.test(line))).toBe(true);
    expect(out.some((line) => line.startsWith("Reveal: sẵn sàng "))).toBe(true);
    expect(await db.turnsOf(sessionId)).toHaveLength(4);
    const session = await db.session(sessionId);
    expect(session.endedAt).not.toBeNull();
    expect(session.revealJson).not.toBeNull();

    // Without the cookies the app asks for a sign-in, and the command says so.
    const refused: string[] = [];
    expect(await runMeasureLatency([APP_URL, "--session", sessionId, "--turns", "1"], { out: () => {}, err: (line) => refused.push(line) }, { cookie: "none=1" })).toBe(1);
    expect(refused[0]).toContain("app đòi đăng nhập lại");
  });
});
