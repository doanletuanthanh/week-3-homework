import { z } from "zod";
import { parseRoleSpec, ROLES, type Role, type RoleSpec } from "@/llm/roles";
import { hasPrice } from "@/llm/pricing";

/** Comma-separated emails, lower-cased so every comparison is case-insensitive. */
const emailList = z
  .string()
  .default("")
  .transform((raw) =>
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

/** An optional secret. An empty value (`KEY=` in an env file) counts as not set. */
const optionalKey = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

/** `provider:model:effort`, and the model must have a price so its cost can be recorded. */
const roleSpec = z.string().transform((raw, ctx) => {
  try {
    const spec = parseRoleSpec(raw);
    if (!hasPrice(spec.model)) {
      ctx.addIssue({ code: "custom", message: `no price configured for model "${spec.model}"` });
      return z.NEVER;
    }
    return spec;
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});

/** A role only the operator CLI calls. An empty value (`LLM_X=` in an env file) counts as not set. */
const optionalRoleSpec = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), roleSpec.optional());

const envSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    ADMIN_EMAILS: emailList,
    DEMO_ACCOUNT_EMAILS: emailList,
    LLM_ANALYSIS: roleSpec,
    LLM_PERSONA: roleSpec,
    LLM_REPLAY_JUDGE: roleSpec,
    // CLI-only roles: needed by the commands that call them, not by the app.
    LLM_EVAL_INTERVIEWER: optionalRoleSpec,
    LLM_EVAL_LEAK_JUDGE: optionalRoleSpec,
    LLM_STRING_CHECK: optionalRoleSpec,
    GOOGLE_API_KEY: optionalKey,
    OPENAI_API_KEY: optionalKey,
    // Separate keys for evaluation, so batch load cannot rate-limit live turns.
    GOOGLE_API_KEY_BATCH: optionalKey,
    OPENAI_API_KEY_BATCH: optionalKey,
    LANGSMITH_TRACING: z.string().optional(),
    LANGSMITH_API_KEY: optionalKey,
  })
  .superRefine((env, ctx) => {
    // FR-45: one account must never be both an admin and a demo learner.
    const overlap = env.ADMIN_EMAILS.filter((email) => env.DEMO_ACCOUNT_EMAILS.includes(email));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["DEMO_ACCOUNT_EMAILS"],
        message: `email in both ADMIN_EMAILS and DEMO_ACCOUNT_EMAILS: ${overlap.join(", ")}`,
      });
    }

    const keyByProvider = { google: "GOOGLE_API_KEY", openai: "OPENAI_API_KEY" } as const;
    for (const provider of ["google", "openai"] as const) {
      const users = ROLES.filter((role) => env[`LLM_${role}`]?.provider === provider).map((role) => `LLM_${role}`);
      if (users.length > 0 && !env[keyByProvider[provider]]) {
        ctx.addIssue({
          code: "custom",
          path: [keyByProvider[provider]],
          message: `required because ${users.join(", ")} ${users.length > 1 ? "use" : "uses"} provider "${provider}"`,
        });
      }
    }

    if (env.LANGSMITH_TRACING === "true" && !env.LANGSMITH_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["LANGSMITH_API_KEY"],
        message: "required when LANGSMITH_TRACING=true",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates a raw environment. Throws one error listing every problem. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join(".") || "env"}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Server-side environment, validated on first use and at server start (see instrumentation.ts). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** The model a role runs on. A CLI-only role that was left unset fails here, with the variable to set. */
export function roleSpecFromEnv(role: Role): RoleSpec {
  const spec = getEnv()[`LLM_${role}`];
  if (!spec) throw new Error(`LLM_${role} is not set (expected "provider:model:effort" in .env.local)`);
  return spec;
}
