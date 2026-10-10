import { expect, test } from "@playwright/test";
import { db } from "./helpers/db";

test.describe("guest", () => {
  test("reads the home page and reaches the persona's prep screen without signing in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Luyện phỏng vấn người dùng.");
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Bắt đầu luyện" }).click();

    await expect(page).toHaveURL("/prep/chi-thu");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chị Thu, 26 tuổi");
    await expect(page.getByText("Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?")).toBeVisible();
    await expect(page.getByText("Đăng nhập Google khi bắt đầu")).toBeVisible();
  });

  test("reads the library, a topic and its persona's prep screen without signing in, and nothing is written", async ({ page }) => {
    const eventsBefore = (await db.eventsNamed("topic_opened")).length;

    expect((await page.goto("/library"))?.status()).toBe(200);
    await page.locator('a.tcard[href="/topics/ux-chi-tieu"]').click();
    await expect(page).toHaveURL("/topics/ux-chi-tieu");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chi tiêu hằng ngày của người trẻ đi làm");
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Bắt đầu", exact: true }).click();
    await expect(page).toHaveURL("/prep/chi-thu");
    await expect(page.getByText("Đăng nhập Google khi bắt đầu")).toBeVisible();

    await page.getByRole("navigation", { name: "Đường dẫn" }).getByRole("link", { name: "Chi tiêu hằng ngày của người trẻ đi làm" }).click();
    await expect(page).toHaveURL("/topics/ux-chi-tieu");
    await page.waitForLoadState("networkidle");
    expect(await db.eventsNamed("topic_opened")).toHaveLength(eventsBefore);
  });

  test("gets a 404 for a topic that does not exist", async ({ page }) => {
    const response = await page.goto("/topics/khong-co");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Không tìm thấy chủ đề này." })).toBeVisible();
  });

  test("gets a 404 for a persona that does not exist", async ({ page }) => {
    const response = await page.goto("/prep/khong-co");
    expect(response?.status()).toBe(404);
  });

  test("is sent to sign-in from a session link, with the link kept as the return path", async ({ page }) => {
    const sessionPath = "/sessions/0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10";
    await page.goto(sessionPath);

    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(sessionPath)}`);
    await expect(page.getByRole("button", { name: "Đăng nhập với Google" })).toBeVisible();
    await expect(page.locator('input[name="next"]')).toHaveValue(sessionPath);
  });

  test("is sent to sign-in from the data notice and from the resume page", async ({ page }) => {
    await page.goto("/data-notice?next=/sessions/x");
    await expect(page).toHaveURL(/\/sign-in\?next=/);

    await page.goto("/resume");
    await expect(page).toHaveURL("/sign-in?next=%2Fresume");
  });

  test("cannot post a turn: the API answers 401 and writes nothing", async ({ request }) => {
    const response = await request.post("/api/sessions/0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10/turns", { data: { text: "Xin chào" } });

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  test("the sign-in button goes to Google through Supabase and returns to the callback with the same path", async ({ page }) => {
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "google" }));
    await page.goto("/sign-in?next=/prep/chi-thu");

    const authorize = page.waitForRequest("**/auth/v1/authorize**");
    await page.getByRole("button", { name: "Đăng nhập với Google" }).click();
    const url = new URL((await authorize).url());

    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3100/auth/callback?next=%2Fprep%2Fchi-thu");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  test("an off-site return path is replaced by the home page", async ({ page }) => {
    await page.goto("/sign-in?next=https://evil.example/x");
    await expect(page.locator('input[name="next"]')).toHaveValue("/");

    await page.goto("/sign-in?next=//evil.example");
    await expect(page.locator('input[name="next"]')).toHaveValue("/");
  });

  test("the OAuth callback without a valid code shows the sign-in error and keeps the return path", async ({ page }) => {
    await page.goto("/auth/callback?next=/prep/chi-thu");
    await expect(page).toHaveURL("/sign-in?error=1&next=%2Fprep%2Fchi-thu");
    await expect(page.getByRole("alert").filter({ hasText: "Không đăng nhập được" })).toBeVisible();

    await page.goto("/auth/callback?code=not-a-real-code&next=https://evil.example");
    await expect(page).toHaveURL("/sign-in?error=1&next=%2F");
  });

  test("a redirect target that normalises to another origin is replaced by the home page", async ({ page }) => {
    for (const hostile of ["/.//evil.example/login", "/a/..//evil.example", "/%2e//evil.example"]) {
      await page.goto(`/sign-in?next=${encodeURIComponent(hostile)}`);
      await expect(page.locator('input[name="next"]')).toHaveValue("/");
    }
  });

  test("a guest cannot store a pending action for a persona that does not exist", async ({ page }) => {
    await page.goto("/prep/chi-thu");
    await page.locator('input[name="personaId"]').evaluate((input: HTMLInputElement) => (input.value = "x".repeat(5000)));
    const before = (await db.pendingActions()).length;

    await page.getByRole("button", { name: "Bắt đầu" }).click();

    await expect(page).toHaveURL("/");
    expect(await db.pendingActions()).toHaveLength(before);
  });

  test('pressing "Bắt đầu" stores a pending action server-side and sends the guest to Google; nothing is created yet', async ({
    page,
    context,
  }) => {
    await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ status: 200, body: "google" }));
    await page.goto("/prep/chi-thu");

    const authorize = page.waitForRequest("**/auth/v1/authorize**");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    const url = new URL((await authorize).url());

    // The return path names only the resume page: the action itself is not in any URL.
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3100/auth/callback?next=%2Fresume");
    expect(url.toString()).not.toContain("chi-thu");

    const cookie = (await context.cookies()).find((entry) => entry.name === "il_pending");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    const pending = await db.pendingActions();
    expect(pending.find((row) => row.id === cookie!.value)).toMatchObject({
      userId: null,
      payload: { kind: "start_session", personaId: "chi-thu" },
    });
  });
});
