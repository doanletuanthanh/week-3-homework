import { execSync } from "node:child_process";
import { LOCAL_DATABASE_URL, LOCAL_SUPABASE_URL } from "../../helpers/local-stack";

export const APP_PORT = 3100;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const LLM_STUB_PORT = 4010;
export const DEMO_EMAIL = "demo-e2e@example.com";

/** Keys of the running local Supabase stack, read from the CLI so none are stored in the repo. */
export function localSupabaseKeys(): { publishableKey: string; secretKey: string } {
  let output: string;
  try {
    output = execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    throw new Error("End-to-end tests need the local Supabase stack: run `pnpm supabase:start` first.", { cause: error });
  }
  const read = (name: string) => {
    const match = output.match(new RegExp(`^${name}="?([^"\r\n]+)"?`, "m"));
    if (!match) throw new Error(`supabase status did not report ${name}`);
    return match[1];
  };
  return { publishableKey: read("PUBLISHABLE_KEY"), secretKey: read("SECRET_KEY") };
}

/** Environment of the app under test: local Supabase, and the OpenAI client pointed at the stub. */
export function appEnv(publishableKey: string): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    DATABASE_URL: LOCAL_DATABASE_URL,
    ADMIN_EMAILS: "admin-e2e@example.com",
    DEMO_ACCOUNT_EMAILS: DEMO_EMAIL,
    LLM_ANALYSIS: "openai:gpt-6-luna:low",
    LLM_PERSONA: "openai:gpt-6-luna:low",
    LLM_REPLAY_JUDGE: "openai:gpt-6-luna:low",
    OPENAI_API_KEY: "stub-key",
    OPENAI_BASE_URL: `http://127.0.0.1:${LLM_STUB_PORT}/v1`,
    LANGSMITH_TRACING: "false",
  };
}
