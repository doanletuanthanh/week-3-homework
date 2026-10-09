import type { LlmCallRecord } from "@/db/repo/llm-calls";
import type { CallModelDeps } from "@/llm/call-model";
import { ROLES, type Role, type RoleSpec } from "@/llm/roles";
import { scriptedModel, type ScriptedStep } from "./scripted-model";

/** One priced model and effort per role, so a call can be traced back to the role that made it. */
const SPEC_OF: Record<Role, RoleSpec> = {
  ANALYSIS: { provider: "openai", model: "gemini-3.8-flash", effort: "low" },
  PERSONA: { provider: "openai", model: "gemini-3.5-flash", effort: "low" },
  REPLAY_JUDGE: { provider: "openai", model: "gemini-3.5-flash-lite", effort: "low" },
  END_JUDGE: { provider: "openai", model: "gemini-3.1-flash-lite", effort: "low" },
  FEEDBACK: { provider: "openai", model: "gemini-3.8-flash", effort: "medium" },
  VERIFIER: { provider: "openai", model: "gemini-3.5-flash", effort: "medium" },
  EVAL_INTERVIEWER: { provider: "openai", model: "gpt-6-luna", effort: "low" },
  EVAL_LEAK_JUDGE: { provider: "openai", model: "gpt-6-sol", effort: "low" },
  STRING_CHECK: { provider: "openai", model: "gpt-6.1-sol", effort: "low" },
  MODERATION: { provider: "openai", model: "gpt-6-luna", effort: "medium" },
  SCENARIO_GENERATOR: { provider: "openai", model: "gpt-6-sol", effort: "medium" },
  SAFETY: { provider: "openai", model: "gpt-6.1-sol", effort: "medium" },
};

/**
 * A scripted model per call role, wired as `callModel` dependencies. Each role consumes its own
 * steps in order; `records` holds every `llm_call` row the run would have written.
 */
export function roleModels(script: Partial<Record<Role, ScriptedStep[]>>) {
  const scripted = Object.fromEntries(ROLES.map((role) => [role, scriptedModel(script[role] ?? [])])) as Record<
    Role,
    ReturnType<typeof scriptedModel>
  >;
  const roleOf = (spec: RoleSpec) => ROLES.find((role) => SPEC_OF[role].model === spec.model && SPEC_OF[role].effort === spec.effort)!;
  const records: LlmCallRecord[] = [];
  const llmDeps: Partial<CallModelDeps> = {
    roleSpec: (role) => SPEC_OF[role],
    createModel: (spec) => scripted[roleOf(spec)].model,
    recordCall: async (record) => {
      records.push(record);
    },
    attemptTimeoutMs: 1_000,
  };
  return {
    llmDeps,
    records,
    roleSpec: llmDeps.roleSpec!,
    calls: (role: Role) => scripted[role].calls,
    /** The whole prompt of each call a role received, as text. */
    prompts: (role: Role) => scripted[role].calls.map((call) => call.messages.map((message) => message.text).join("\n")),
  };
}

/** `count` identical steps, for roles whose reply does not matter to the test. */
export const repeat = (count: number, step: ScriptedStep): ScriptedStep[] => Array.from({ length: count }, () => step);

export const NO_FINDINGS = { structured: { flags: [], contradictions: [] } };
