export const PROVIDERS = ["google", "openai"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

/** One entry per call role. Each later phase adds the roles it first uses. */
export const ROLES = ["PERSONA"] as const;
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
