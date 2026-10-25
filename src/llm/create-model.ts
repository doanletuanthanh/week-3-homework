import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "@/config/env";
import type { RoleSpec } from "./roles";

/** Per-call client settings `callModel` passes: the role's output cap, when it has one. */
export type ModelOptions = { maxOutputTokens?: number };

/**
 * Builds the provider client for a role. Library retries are off: `callModel` retries itself
 * so every attempt gets its own `llm_call` row. With `batch`, the provider's batch key is used
 * when one is configured, so evaluation load does not share a rate limit with live turns.
 */
export function createChatModel(spec: RoleSpec, options: ModelOptions & { batch?: boolean } = {}): BaseChatModel {
  const env = getEnv();
  if (spec.provider === "google") {
    return new ChatGoogle({
      model: spec.model,
      apiKey: (options.batch && env.GOOGLE_API_KEY_BATCH) || env.GOOGLE_API_KEY,
      reasoningEffort: spec.effort,
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: 0,
    });
  }
  return new ChatOpenAI({
    model: spec.model,
    apiKey: (options.batch && env.OPENAI_API_KEY_BATCH) || env.OPENAI_API_KEY,
    reasoning: { effort: spec.effort },
    maxTokens: options.maxOutputTokens,
    maxRetries: 0,
  });
}
