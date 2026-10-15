import { expect, test } from "@playwright/test";
import { getDb } from "@/db/client";
import { listFlags } from "@/db/repo/eval";
import { runCheckStrings } from "../../cli/commands/strings";
import { CLEAN_STRING, cleanPersonaCheck, seedLeanRun } from "../helpers/publish-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import { productStrings } from "@/strings/product-strings";
import { ensureAccount, signIn, signInAsNewLearner, uniqueEmail } from "./helpers/auth";
import { db } from "./helpers/db";

const ADMIN = "admin-e2e@example.com";
const DRAFTED = "e2e-chi-mai";
const silent = { out: () => {}, err: () => {} };

test.describe("admin scenario review in the browser", () => {
  test.afterEach(async () => {
    await db.removePersona(DRAFTED);
    await db.clearConfig();
    await db.resetPublishState();
  });

  test("an admin drafts a persona for a topic and runs a lean eval on it, with no CLI step", async ({ page, context }) => {
    test.setTimeout(120_000);
    await ensureAccount(ADMIN);
    await signIn(context, ADMIN);

    await page.goto("/admin/scenarios");
    await page.getByRole("link", { name: "Soạn persona mới" }).click();
    await page.getByLabel("Mã persona mới").fill(DRAFTED);
    await page.getByLabel("Mô tả cho trình soạn").fill("Nhân viên văn phòng tự quản lý chi tiêu hằng tháng");
    await page.getByRole("button", { name: "Soạn bản nháp" }).click();

    // The stub's generator and safety check answer at once; the page follows the draft until it is stored.
    await page.getByRole("link", { name: "Mở để duyệt" }).click({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("chị Mai");
    await expect(page.locator("main")).toContainText("Bản nháp");
    expect((await db.scenarioOf(DRAFTED)).status).toBe("draft");

    await page.getByRole("button", { name: "Chạy eval lean" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã bắt đầu eval lean." })).toBeVisible();
    // The progress poller re-renders the page until the run is over and its probes are listed.
    await expect(page.getByRole("heading", { name: "Các phép thử" })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("#eval-h + p")).toContainText("Xong");
  });

  test("an admin rules on a flag, approves strings and the version, publishes and unpublishes", async ({ page, context }) => {
    await ensureAccount(ADMIN);
    await signIn(context, ADMIN);
    const run = await seedLeanRun(["shame"]);
    // FR-36 runs its model calls in-process here; approving them is the admin's step in the browser.
    await runCheckStrings(["chi-thu"], silent, getDb(), cleanPersonaCheck().llmDeps);
    await runCheckStrings(["product"], silent, getDb(), roleModels({ STRING_CHECK: repeat(productStrings().length, CLEAN_STRING) }).llmDeps);

    await page.goto("/admin/scenarios/chi-thu");
    const publish = page.getByRole("button", { name: "Publish", exact: true });
    await expect(publish).toBeDisabled();

    const flag = page.getByRole("article", { name: "Cờ shame" });
    await flag.getByLabel("Lý do").fill("Chỉ nhắc sự thật bề mặt.");
    await flag.getByRole("button", { name: "Không phải rò rỉ" }).click();
    await expect(flag.getByRole("status")).toHaveText("Đã ghi phán quyết.");

    for (const button of await page.getByRole("button", { name: "Duyệt mọi chuỗi đã qua kiểm" }).all()) {
      await button.click();
      await expect(page.getByRole("status").filter({ hasText: "Đã duyệt" }).first()).toBeVisible();
    }
    await page.getByLabel("Ghi chú duyệt phiên bản").fill("Đã đọc báo cáo.");
    await page.getByRole("button", { name: "Duyệt phiên bản" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã duyệt phiên bản 1" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("list", { name: "Lý do chưa publish được" })).toHaveCount(0);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã publish chi-thu phiên bản 1." })).toBeVisible();
    expect((await db.scenarioOf("chi-thu")).status).toBe("published");
    expect((await listFlags(getDb(), run.id))[0].rulings).toMatchObject([{ adminEmail: ADMIN, verdict: "not_leak" }]);

    await page.getByRole("button", { name: "Gỡ publish" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã gỡ 1 phiên bản." })).toBeVisible();
    expect((await db.scenarioOf("chi-thu")).status).toBe("unpublished");
  });

  test("a learner gets 404 on every scenario page", async ({ page, context }) => {
    await signInAsNewLearner(context, uniqueEmail("not-admin-review"));
    for (const path of ["/admin/scenarios", "/admin/scenarios/chi-thu", "/admin/scenarios/new"]) {
      expect((await page.goto(path))!.status()).toBe(404);
    }
  });
});
