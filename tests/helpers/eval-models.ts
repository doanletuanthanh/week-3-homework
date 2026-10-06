import type { LlmCallRecord } from "@/db/repo/llm-calls";
import type { CallModelDeps } from "@/llm/call-model";
import { ROLES, type Role } from "@/llm/roles";
import { scriptedModel, type ScriptedStep } from "./scripted-model";

/** One priced model per role, so a call can be traced back to the role that made it. */
const MODEL_OF: Record<Role, string> = {
  ANALYSIS: "gemini-3.8-flash",
  PERSONA: "gemini-3.5-flash",
  REPLAY_JUDGE: "gemini-3.5-flash-lite",
  EVAL_INTERVIEWER: "gpt-6-luna",
  EVAL_LEAK_JUDGE: "gpt-6-sol",
  STRING_CHECK: "gpt-6.1-sol",
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
  const roleOf = (model: string) => ROLES.find((role) => MODEL_OF[role] === model)!;
  const records: LlmCallRecord[] = [];
  const llmDeps: Partial<CallModelDeps> = {
    roleSpec: (role) => ({ provider: "openai", model: MODEL_OF[role], effort: "low" }),
    createModel: (spec) => scripted[roleOf(spec.model)].model,
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
