import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, APP_URL, LLM_STUB_PORT, appEnv, localSupabaseKeys } from "./tests/e2e/helpers/stack";

const { publishableKey, secretKey } = localSupabaseKeys();
// The fixtures (not the app) use the secret key to create test accounts in local Supabase Auth.
process.env.E2E_SUPABASE_SECRET_KEY = secretKey;
process.env.E2E_SUPABASE_PUBLISHABLE_KEY = publishableKey;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One database is shared by every test; each test uses its own account.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: { baseURL: APP_URL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node tests/e2e/llm-stub.mjs",
      port: LLM_STUB_PORT,
      env: { LLM_STUB_PORT: String(LLM_STUB_PORT) },
      reuseExistingServer: false,
    },
    {
      // A production build, so the tests exercise what would be deployed.
      command: `pnpm exec next build && pnpm exec next start -p ${APP_PORT}`,
      url: APP_URL,
      env: appEnv(publishableKey),
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
