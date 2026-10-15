import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adminAccessLog } from "@/db/schema";
import { ensureAccount, signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";
import { startInterview } from "./helpers/interview";

const ADMIN = "admin-e2e@example.com";
// A repeated key arrives as a list: the page must still render.
const PAGES = ["/admin/learners", "/admin/custom-topics?outcome=failed&outcome=passed", "/admin/config", "/admin/audit?action=a&action=b&page=1&page=2"];

test.describe("admin learners, config and audit", () => {
  test.afterEach(async () => {
    await db.clearConfig();
  });

  test("an admin follows a learner to a session transcript, and the read is logged", async ({ page, context, browser }) => {
    const { email, sessionId } = await startInterview(page, context, "admin-learners");

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await ensureAccount(ADMIN);
    await signIn(adminContext, ADMIN);

    await admin.goto("/admin/learners");
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Người học");
    await admin.getByRole("link", { name: email }).click();
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(email);
    await admin.getByRole("link", { name: "chị Thu" }).click();
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Bản ghi buổi");
    await expect(admin.getByRole("heading", { name: "Lượt 0 (lời mở đầu, không gọi LLM)" })).toBeVisible();

    const reads = await getDb()
      .select()
      .from(adminAccessLog)
      .where(and(eq(adminAccessLog.sessionId, sessionId), eq(adminAccessLog.action, "read_transcript")));
    expect(reads).toMatchObject([{ adminEmail: ADMIN, channel: "console" }]);

    await admin.goto(`/admin/audit?action=read_transcript&admin=${encodeURIComponent(ADMIN)}`);
    await expect(admin.locator(".adm-table")).toContainText("read_transcript");
    await adminContext.close();
  });

  test("an admin changes a setting, which the next read uses, and every page fits a phone", async ({ page, context }) => {
    await ensureAccount(ADMIN);
    await signIn(context, ADMIN);

    await page.goto("/admin/config");
    const cap = page.getByRole("region", { name: "session_daily_cap_usd" });
    await cap.getByLabel("Giá trị").fill("7.5");
    await cap.getByRole("button", { name: "Lưu" }).click();
    await expect(cap.getByRole("status")).toHaveText("session_daily_cap_usd: 5 → 7.5");
    await page.reload();
    await expect(page.getByRole("region", { name: "session_daily_cap_usd" }).getByLabel("Giá trị")).toHaveValue("7.5");

    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of PAGES) {
      expect((await page.goto(path))!.status()).toBe(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });

  test("a learner gets 404 on every page", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("not-admin"));
    for (const path of [...PAGES, "/admin/learners/00000000-0000-4000-8000-000000000000", "/admin/sessions/00000000-0000-4000-8000-000000000000"]) {
      expect((await page.goto(path))!.status()).toBe(404);
    }
  });
});
