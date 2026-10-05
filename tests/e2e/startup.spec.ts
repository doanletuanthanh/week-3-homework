import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { appEnv } from "./helpers/stack";

/** Starts the built app on a spare port with the given env and reports how it ended. */
function startApp(env: Record<string, string>, port: number): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(`pnpm exec next start -p ${port}`, { shell: true, env: { ...process.env, ...env } });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    // A server that did start is stopped with its whole process tree (the shell does not forward a kill on Windows).
    const giveUp = setTimeout(() => {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else child.kill();
    }, 30_000);
    child.on("exit", (exitCode) => {
      clearTimeout(giveUp);
      resolve({ exitCode, output });
    });
  });
}

test.describe("startup check", () => {
  test("the server refuses to start when an email is both admin and demo, whatever its case", async () => {
    const env = {
      ...appEnv(process.env.E2E_SUPABASE_PUBLISHABLE_KEY!),
      ADMIN_EMAILS: "someone@example.com, Thanh@Example.com",
      DEMO_ACCOUNT_EMAILS: "thanh@example.COM",
    };

    const { exitCode, output } = await startApp(env, 3199);

    expect(exitCode).toBe(1);
    expect(output).toContain("email in both ADMIN_EMAILS and DEMO_ACCOUNT_EMAILS: thanh@example.com");
  });

  test("the server refuses to start when a role points at a model with no price", async () => {
    const env = { ...appEnv(process.env.E2E_SUPABASE_PUBLISHABLE_KEY!), LLM_PERSONA: "openai:not-a-priced-model:low" };

    const { exitCode, output } = await startApp(env, 3198);

    expect(exitCode).toBe(1);
    expect(output).toContain("no price configured");
  });
});
