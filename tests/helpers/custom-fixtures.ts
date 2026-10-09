import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { LlmCallRecord } from "@/db/repo/llm-calls";
import type { CallModelDeps } from "@/llm/call-model";
import type { GeneratedScenario } from "@/llm/prompts/scenario-generator";
import { ROLES, type Role } from "@/llm/roles";
import type { Scenario } from "@/scenario/schema";
import { chiThu, rawAnalysis } from "./engine-fixtures";
import { roleModels } from "./eval-models";

/** A scenario as the generator would have returned it: the reverse of `toScenarioFile`. */
export function generatedFrom(scenario: Scenario = chiThu): GeneratedScenario {
  return {
    persona: {
      display_name: scenario.persona.display_name,
      name: scenario.persona.name,
      tagline: scenario.persona.tagline,
      identity: scenario.persona.identity,
      voice_notes: scenario.persona.voice_notes,
    },
    research_goal: scenario.research_goal,
    opening_line: scenario.opening_line,
    openness_start: scenario.openness_start,
    surface_facts: scenario.surface_facts,
    error_patterns: scenario.error_patterns,
    habit_card_label: scenario.habit_card_label,
    items: scenario.items.map((item) => ({
      id: item.id,
      content: item.content,
      secret_terms: item.secret_terms,
      topic_tag: item.topic_tag,
      path: item.path,
      prerequisite_id: item.prerequisite_id ?? null,
      trust_threshold: item.trust_threshold ?? null,
      hook_line: item.hook_line,
      do_not_assert: item.do_not_assert.text,
      weight: item.weight,
      sample_question: item.sample_question,
    })),
  };
}

export type Reply = { structured: unknown } | { text: string } | { error: Error } | { hang: true };
export type SeenCall = { role: Role; prompt: string; metadata: unknown; tags: unknown };

/**
 * Stands in for the provider clients of a run: every call is answered from its role and its
 * prompt, not from a queue, so a test can say what one role does without scripting the others.
 * `calls` keeps what each call was sent, `records` every `llm_call` row the run would write.
 */
export function respondingModels(respond: (role: Role, prompt: string) => Reply | Promise<Reply>, options: { recordCall?: CallModelDeps["recordCall"] } = {}) {
  const calls: SeenCall[] = [];
  const records: LlmCallRecord[] = [];
  const specOf = roleModels({}).roleSpec;
  const roleOfModel = (model: string, effort: string) => ROLES.find((role) => specOf(role).model === model && specOf(role).effort === effort)!;
  const usage = { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_token_details: { cache_read: 0 }, output_token_details: { reasoning: 0 } };

  const answer = async (role: Role, messages: BaseMessage[], config: { signal?: AbortSignal; metadata?: unknown; tags?: unknown }) => {
    const prompt = messages.map((message) => message.text).join("\n");
    // A provider client refuses a request whose signal is already aborted; so does this one.
    if (config.signal?.aborted) throw config.signal.reason ?? new Error("aborted");
    calls.push({ role, prompt, metadata: config.metadata, tags: config.tags });
    const reply = await respond(role, prompt);
    if ("error" in reply) throw reply.error;
    if ("hang" in reply) {
      return new Promise<never>((_, reject) => {
        const fail = () => reject(config.signal?.reason ?? new Error("aborted"));
        if (config.signal?.aborted) fail();
        config.signal?.addEventListener("abort", fail);
      });
    }
    return reply;
  };

  const modelOf = (role: Role) =>
    ({
      invoke: async (messages: BaseMessage[], config: { signal?: AbortSignal }) => {
        const reply = await answer(role, messages, config);
        if (!("text" in reply)) throw new Error(`${role} was asked for text but the test answers with structured output`);
        return new AIMessage({ content: reply.text, usage_metadata: usage });
      },
      withStructuredOutput: () => ({
        invoke: async (messages: BaseMessage[], config: { signal?: AbortSignal }) => {
          const reply = await answer(role, messages, config);
          if (!("structured" in reply)) throw new Error(`${role} was asked for structured output but the test answers with text`);
          return { raw: new AIMessage({ content: "", usage_metadata: usage }), parsed: reply.structured };
        },
      }),
    }) as unknown as BaseChatModel;

  const llmDeps: Partial<CallModelDeps> = {
    roleSpec: specOf,
    createModel: (spec) => modelOf(roleOfModel(spec.model, spec.effort)),
    recordCall: async (record) => {
      records.push(record);
      await options.recordCall?.(record);
    },
    attemptTimeoutMs: 2_000,
  };
  return {
    llmDeps,
    calls,
    records,
    count: (role: Role) => calls.filter((call) => call.role === role).length,
    prompts: (role: Role) => calls.filter((call) => call.role === role).map((call) => call.prompt),
  };
}

export const ALLOW = { decision: "allow", reason_code: null, constraints: [], focus: "general" };
export const SAFE = { violations: [] };

export type PipelineScript = {
  moderation?: unknown;
  /** One reply per generator try, in order; the last one is repeated. */
  generated?: unknown[];
  safety?: unknown;
  /** Replaces the reply of one role. */
  override?: Partial<Record<Role, (prompt: string) => Reply | Promise<Reply>>>;
};

/**
 * Replies for the whole custom-topic path on a scenario generated from chị Thu: moderation
 * allows, the generator returns a valid file, the safety check finds nothing. The two calls of
 * an interview turn get neutral replies, so a session on the generated scenario can be played
 * with the same models.
 */
export function pipelineModels(script: PipelineScript = {}, options: { recordCall?: CallModelDeps["recordCall"] } = {}) {
  const generated = script.generated ?? [generatedFrom()];
  let generatorTry = 0;

  return respondingModels((role, prompt) => {
    const custom = script.override?.[role];
    if (custom) return custom(prompt);
    switch (role) {
      case "MODERATION":
        return { structured: script.moderation ?? ALLOW };
      case "SCENARIO_GENERATOR":
        return { structured: generated[Math.min(generatorTry++, generated.length - 1)] };
      case "SAFETY":
        return { structured: script.safety ?? SAFE };
      case "ANALYSIS":
        return { structured: rawAnalysis() };
      case "PERSONA":
        return { text: "Chị cũng không rõ nữa em." };
      default:
        return { error: new Error(`no reply scripted for ${role}`) };
    }
  }, options);
}
