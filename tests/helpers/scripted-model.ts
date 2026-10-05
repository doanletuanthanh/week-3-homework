import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";

type Usage = { input: number; output: number; cached?: number; reasoning?: number };

/** One scripted attempt: a text reply, a structured reply, an error, or a call that waits to be aborted. */
export type ScriptedStep =
  | { text: string; usage?: Usage }
  | { structured: unknown; usage?: Usage }
  | { error: Error }
  | { hang: true };

export type ScriptedCall = { messages: BaseMessage[]; config: { signal?: AbortSignal; metadata?: unknown; tags?: string[] } };

const DEFAULT_USAGE: Usage = { input: 100, output: 20 };

function message(text: string, usage: Usage = DEFAULT_USAGE): AIMessage {
  return new AIMessage({
    content: text,
    usage_metadata: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      total_tokens: usage.input + usage.output,
      input_token_details: { cache_read: usage.cached ?? 0 },
      output_token_details: { reasoning: usage.reasoning ?? 0 },
    },
  });
}

/**
 * Stands in for a provider client at the vendor boundary. Each model attempt consumes the next
 * step; every attempt is kept in `calls` so tests can inspect exactly what was sent.
 */
export function scriptedModel(steps: ScriptedStep[]) {
  const queue = [...steps];
  const calls: ScriptedCall[] = [];

  const next = async (messages: BaseMessage[], config: ScriptedCall["config"]) => {
    calls.push({ messages, config });
    const step = queue.shift();
    if (!step) throw new Error("scripted model ran out of steps");
    if ("error" in step) throw step.error;
    if ("hang" in step) {
      return new Promise<never>((_, reject) => {
        const fail = () => reject(config.signal?.reason ?? new Error("aborted"));
        if (config.signal?.aborted) fail();
        config.signal?.addEventListener("abort", fail);
      });
    }
    return step;
  };

  const model = {
    invoke: async (messages: BaseMessage[], config: ScriptedCall["config"]) => {
      const step = await next(messages, config);
      if (!("text" in step)) throw new Error("scripted step is not a text reply");
      return message(step.text, step.usage);
    },
    withStructuredOutput: () => ({
      invoke: async (messages: BaseMessage[], config: ScriptedCall["config"]) => {
        const step = await next(messages, config);
        if (!("structured" in step)) throw new Error("scripted step is not a structured reply");
        return { raw: message("", step.usage), parsed: step.structured };
      },
    }),
  } as unknown as BaseChatModel;

  return { model, calls };
}
