import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogle } from "@langchain/google";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "@/config/env";
import type { RoleSpec } from "./roles";

/**
 * Builds the provider client for a role. Library retries are off: `callModel` retries itself
 * so every attempt gets its own `llm_call` row.
 */
export function createChatModel(spec: RoleSpec): BaseChatModel {
  const env = getEnv();
  if (spec.provider === "google") {
    return new ChatGoogle({
      model: spec.model,
      apiKey: env.GOOGLE_API_KEY,
      reasoningEffort: spec.effort,
      maxRetries: 0,
    });
  }
  return new ChatOpenAI({
    model: spec.model,
    apiKey: env.OPENAI_API_KEY,
    reasoning: { effort: spec.effort },
    maxRetries: 0,
  });
}
