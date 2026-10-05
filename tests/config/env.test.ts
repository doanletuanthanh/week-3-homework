import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  DATABASE_URL: "postgresql://app@db/postgres",
  ADMIN_EMAILS: "admin@example.com",
  DEMO_ACCOUNT_EMAILS: "demo@example.com",
  LLM_PERSONA: "google:gemini-3.8-flash:low",
  GOOGLE_API_KEY: "g-key",
};

describe("parseEnv", () => {
  it("accepts a complete environment and normalises the email lists", () => {
    const env = parseEnv({ ...valid, ADMIN_EMAILS: " Admin@Example.com , second@example.com ,," });
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.com", "second@example.com"]);
    expect(env.DEMO_ACCOUNT_EMAILS).toEqual(["demo@example.com"]);
    expect(env.LLM_PERSONA).toEqual({ provider: "google", model: "gemini-3.8-flash", effort: "low" });
  });

  it("treats missing email lists as empty", () => {
    const env = parseEnv({ ...valid, ADMIN_EMAILS: undefined, DEMO_ACCOUNT_EMAILS: undefined });
    expect(env.ADMIN_EMAILS).toEqual([]);
    expect(env.DEMO_ACCOUNT_EMAILS).toEqual([]);
  });

  it("refuses an email that is in both the admin and the demo list", () => {
    expect(() => parseEnv({ ...valid, DEMO_ACCOUNT_EMAILS: "demo@example.com,admin@example.com" })).toThrow(
      /both ADMIN_EMAILS and DEMO_ACCOUNT_EMAILS: admin@example.com/,
    );
  });

  it("refuses the overlap when the two entries differ only in case or spacing", () => {
    expect(() =>
      parseEnv({ ...valid, ADMIN_EMAILS: "Thanh@Gmail.com", DEMO_ACCOUNT_EMAILS: "  thanh@gmail.COM " }),
    ).toThrow(/both ADMIN_EMAILS and DEMO_ACCOUNT_EMAILS: thanh@gmail.com/);
  });

  it("requires the API key of the provider a role uses", () => {
    expect(() => parseEnv({ ...valid, GOOGLE_API_KEY: undefined })).toThrow(/GOOGLE_API_KEY/);
    expect(() => parseEnv({ ...valid, LLM_PERSONA: "openai:gpt-6-luna:low" })).toThrow(/OPENAI_API_KEY/);
    expect(parseEnv({ ...valid, LLM_PERSONA: "openai:gpt-6-luna:low", OPENAI_API_KEY: "o-key" }).LLM_PERSONA.provider).toBe(
      "openai",
    );
  });

  it("treats an empty key, as left blank in an env file, the same as a missing one", () => {
    const env = parseEnv({ ...valid, OPENAI_API_KEY: "", LANGSMITH_API_KEY: "  " });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.LANGSMITH_API_KEY).toBeUndefined();
    expect(() => parseEnv({ ...valid, GOOGLE_API_KEY: "" })).toThrow(/GOOGLE_API_KEY/);
    expect(() => parseEnv({ ...valid, LANGSMITH_TRACING: "true", LANGSMITH_API_KEY: "" })).toThrow(/LANGSMITH_API_KEY/);
  });

  it("refuses a role whose model has no price, so no call can go unmetered", () => {
    expect(() => parseEnv({ ...valid, LLM_PERSONA: "google:gemini-unknown:low" })).toThrow(/no price configured/);
  });

  it("refuses a malformed role value", () => {
    expect(() => parseEnv({ ...valid, LLM_PERSONA: "gemini-3.8-flash" })).toThrow(/provider:model:effort/);
    expect(() => parseEnv({ ...valid, LLM_PERSONA: "azure:gemini-3.8-flash:low" })).toThrow(/unknown provider/);
    expect(() => parseEnv({ ...valid, LLM_PERSONA: "google:gemini-3.8-flash:extreme" })).toThrow(/unknown effort/);
  });

  it("requires the LangSmith key only when tracing is on", () => {
    expect(() => parseEnv({ ...valid, LANGSMITH_TRACING: "true" })).toThrow(/LANGSMITH_API_KEY/);
    expect(() => parseEnv({ ...valid, LANGSMITH_TRACING: "true", LANGSMITH_API_KEY: "ls-key" })).not.toThrow();
    expect(() => parseEnv({ ...valid, LANGSMITH_TRACING: "false" })).not.toThrow();
  });

  it("reports every problem in one error", () => {
    expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*DATABASE_URL[\s\S]*LLM_PERSONA/);
  });
});
