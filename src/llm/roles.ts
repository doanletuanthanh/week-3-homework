export const PROVIDERS = ["google", "openai"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

/**
 * Roles the app itself calls; each has its own required `LLM_<ROLE>` variable. Each later phase
 * adds the roles it first uses. ANALYSIS is Call 1, PERSONA is Call 2, REPLAY_JUDGE is the turn judge.
 * END_JUDGE, FEEDBACK and VERIFIER are the three reveal calls, in that order.
 */
export const APP_ROLES = ["ANALYSIS", "PERSONA", "REPLAY_JUDGE", "END_JUDGE", "FEEDBACK", "VERIFIER"] as const;

/**
 * Roles only the operator CLI calls (evaluation and the fixed-string check). Their variables are
 * optional, so a deployment that never runs them does not have to set them. EVAL_INTERVIEWER
 * plays the learner, EVAL_LEAK_JUDGE reads a finished episode against the whole scenario,
 * STRING_CHECK looks for claims about real users in fixed strings.
 */
export const EVAL_ROLES = ["EVAL_INTERVIEWER", "EVAL_LEAK_JUDGE", "STRING_CHECK"] as const;

export const ROLES = [...APP_ROLES, ...EVAL_ROLES] as const;
export type Role = (typeof ROLES)[number];

export type RoleSpec = { provider: Provider; model: string; effort: Effort };

/** Parses the `LLM_<ROLE>` value: `provider:model:effort`. */
export function parseRoleSpec(raw: string): RoleSpec {
  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => part === "")) {
    throw new Error(`expected "provider:model:effort", got "${raw}"`);
  }
  const [provider, model, effort] = parts;
  if (!PROVIDERS.includes(provider as Provider)) {
    throw new Error(`unknown provider "${provider}" (expected ${PROVIDERS.join(" | ")})`);
  }
  if (!EFFORTS.includes(effort as Effort)) {
    throw new Error(`unknown effort "${effort}" (expected ${EFFORTS.join(" | ")})`);
  }
  return { provider: provider as Provider, model, effort: effort as Effort };
}
