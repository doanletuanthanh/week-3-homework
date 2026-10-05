import { expect, test } from "@playwright/test";
import { DATA_NOTICE, DATA_NOTICE_VERSION } from "@/strings/product-strings";
import { createAccount, signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { DEMO_EMAIL } from "./helpers/stack";

test.describe("sign-in rules", () => {
  test("an account that did not sign in with Google is treated as signed out", async ({ page, context }) => {
    const email = uniqueEmail("password-user");
    const id = await createAccount(email, { provider: "email" });
    await signIn(context, email);

    await page.goto("/sessions/0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10");
    await expect(page).toHaveURL(/\/sign-in\?next=/);

    const api = await page.request.post("/api/sessions/0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10/turns", { data: { text: "Chào" } });
    expect(api.status()).toBe(401);
    expect(await db.user(id)).toBeUndefined();
  });

  test("a signed-in learner is not redirected off-site by a crafted return path", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("redirect"));

    await page.goto(`/sign-in?next=${encodeURIComponent("/.//evil.example/login")}`);
    await expect(page).toHaveURL("/");

    await page.goto(`/data-notice?next=${encodeURIComponent("/a/..//evil.example")}`);
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/");
  });

  test("signing out ends the session", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("signout"));
    await page.goto("/");
    await page.getByLabel("Tài khoản: mở menu").click();
    await page.getByRole("button", { name: "Đăng xuất" }).click();

    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
    await page.goto("/resume");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("data notice (Màn 0)", () => {
  test("blocks a direct link to a session and every write until the learner agrees", async ({ page, context }) => {
    const id = await signInAsNewLearner(context, uniqueEmail("no-consent"));
    const sessionPath = "/sessions/0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10";

    await page.goto(sessionPath);
    await expect(page).toHaveURL(`/data-notice?next=${encodeURIComponent(sessionPath)}`);
    await expect(page.getByRole("heading", { name: "Ai xem được buổi luyện của bạn" })).toBeVisible();

    await page.goto("/resume");
    await expect(page).toHaveURL("/data-notice?next=%2Fresume");

    const api = await page.request.post(`/api${sessionPath}/turns`, { data: { text: "Chào chị" } });
    expect(api.status()).toBe(403);
    expect(await api.json()).toEqual({
      error: "notice_required",
      redirectTo: `/data-notice?next=${encodeURIComponent(sessionPath)}`,
    });

    expect(await db.user(id)).toMatchObject({ visibilityAckVersion: null, visibilityAckAt: null });
    expect(await db.sessionsOf(id)).toHaveLength(0);
  });

  test("shows the full notice, including the tracing service and the usage counter", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("notice-text"));
    await page.goto("/data-notice?next=/");

    for (const sentence of Object.values(DATA_NOTICE)) {
      await expect(page.getByText(sentence, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("LangSmith")).toBeVisible();
  });

  test('"Quay lại" stores no consent and starts nothing', async ({ page, context }) => {
    const id = await signInAsNewLearner(context, uniqueEmail("go-back"));
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL("/data-notice?next=%2Fresume");

    await page.getByRole("link", { name: "Quay lại" }).click();

    await expect(page).toHaveURL("/");
    expect(await db.user(id)).toMatchObject({ visibilityAckVersion: null, visibilityAckAt: null });
    expect(await db.sessionsOf(id)).toHaveLength(0);
  });

  test('"Tôi hiểu" stores the version and time, then resumes the start the learner asked for', async ({ page, context }) => {
    const id = await signInAsNewLearner(context, uniqueEmail("consent"));
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL("/data-notice?next=%2Fresume");
    const startedAt = Date.now();

    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Chào em, chị là Thu.")).toBeVisible();

    const user = await db.user(id);
    expect(user.visibilityAckVersion).toBe(DATA_NOTICE_VERSION);
    expect(Math.abs(user.visibilityAckAt!.getTime() - startedAt)).toBeLessThan(30_000);
    const sessions = await db.sessionsOf(id);
    expect(sessions).toHaveLength(1);
    expect(page.url()).toContain(sessions[0].id);
    expect((await context.cookies()).find((cookie) => cookie.name === "il_pending")).toBeUndefined();
  });

  test("agreeing without a pending action returns to the page the learner wanted", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("consent-next"));
    await page.goto("/data-notice?next=/prep/chi-thu");

    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await expect(page).toHaveURL("/prep/chi-thu");
  });

  test("is skipped for a learner who already agreed", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("already"));
    await page.goto("/data-notice?next=/");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/data-notice?next=/prep/chi-thu");
    await expect(page).toHaveURL("/prep/chi-thu");
  });
});

test.describe("pending action after sign-in", () => {
  /** A guest presses "Bắt đầu", then signs in (the Google round trip is replaced by the fixture). */
  async function guestStartsThenSignsIn(page: import("@playwright/test").Page, email: string) {
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "google" }));
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await page.waitForURL("**/auth/v1/authorize**");
    const id = await createAccount(email);
    await signIn(page.context(), email);
    return id;
  }

  test("a new learner continues through the notice straight into the session they started", async ({ page }) => {
    const id = await guestStartsThenSignsIn(page, uniqueEmail("guest-start"));

    await page.goto("/resume");
    await expect(page).toHaveURL("/data-notice?next=%2Fresume");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    expect(await db.sessionsOf(id)).toHaveLength(1);
  });

  test("loading the resume page with GET never performs the action", async ({ page }) => {
    const id = await guestStartsThenSignsIn(page, uniqueEmail("get-only"));
    // Consent is given first (without the token), so the GET below reaches the resume page itself.
    const token = (await page.context().cookies()).find((cookie) => cookie.name === "il_pending")!;
    await page.context().clearCookies({ name: "il_pending" });
    await page.goto("/data-notice?next=/");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/");
    await page.context().addCookies([{ name: token.name, value: token.value, domain: "localhost", path: "/" }]);

    // Plain GET requests with the learner's cookies: no script runs, so the page's form cannot post.
    const response = await page.request.get("/resume");
    expect(response.status()).toBe(200);
    expect(response.url()).toContain("/resume");
    await page.request.get("/resume?personaId=chi-thu&action=start_session");

    expect(await db.sessionsOf(id)).toHaveLength(0);
    expect((await db.pendingActions()).some((row) => row.id === token.value)).toBe(true);
  });

  test("a learner who already agreed is taken into the session, and the action cannot be replayed", async ({ page, context }) => {
    const email = uniqueEmail("returning");
    const id = await createAccount(email);
    await signIn(context, email);
    await page.goto("/data-notice?next=/");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();
    await expect(page).toHaveURL("/");
    await context.clearCookies();

    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "google" }));
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await page.waitForURL("**/auth/v1/authorize**");
    const token = (await context.cookies()).find((cookie) => cookie.name === "il_pending")!;
    await signIn(context, email);

    await page.goto("/resume");
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    expect(await db.sessionsOf(id)).toHaveLength(1);

    // Put the used token back and load the resume page again: nothing is left to perform.
    await context.addCookies([{ name: token.name, value: token.value, domain: "localhost", path: "/" }]);
    await page.goto("/resume");
    await expect(page).toHaveURL("/");
    expect(await db.sessionsOf(id)).toHaveLength(1);
  });
});

test.describe("starting a session", () => {
  test("a learner has one session per persona and is offered to continue it", async ({ page, context }) => {
    const id = await signInAsNewLearner(context, uniqueEmail("one-session"));
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionUrl = page.url();

    await page.goto("/prep/chi-thu");
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toHaveCount(0);
    await page.getByRole("link", { name: "Tiếp tục buổi luyện" }).click();

    await expect(page).toHaveURL(sessionUrl);
    expect(await db.sessionsOf(id)).toHaveLength(1);
  });

  test("a demo account can start a new session with the same persona again", async ({ page, context }) => {
    const id = await createAccount(DEMO_EMAIL);
    await signIn(context, DEMO_EMAIL);
    await page.goto("/data-notice?next=/prep/chi-thu");
    await page.getByRole("button", { name: "Tôi hiểu" }).click();

    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    await page.goto("/prep/chi-thu");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);

    const sessions = await db.sessionsOf(id);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.isDemo)).toBe(true);
  });
});
