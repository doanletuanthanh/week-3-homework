import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { CallModelDeps } from "./call-model";
import { createChatModel, type ModelOptions } from "./create-model";
import type { RoleSpec } from "./roles";

/**
 * One attempt of a batched call may wait this long: past the 48 hours after which the provider
 * expires a job itself, so an attempt is never given up (and sent again) while its job may still run and bill.
 */
export const BATCH_ATTEMPT_TIMEOUT_MS = 49 * 60 * 60 * 1000;

/**
 * Gemini Batch Mode, inline requests (https://ai.google.dev/gemini-api/docs/batch-mode): half the
 * standard price, results in minutes to hours. Calls are collected while they arrive and sent as
 * one batch job per model once no new call has come for a short while, then the job is polled
 * until it finishes. Only for work nobody waits on: evaluation, never a learner's turn.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";

type Part = { text?: string; thought?: boolean };
/**
 * A request as a batch job takes it. Field names are snake_case: measured on 2026-10-14, a batch
 * inline request ignored `generationConfig.responseJsonSchema` without an error and honoured
 * `generation_config.response_json_schema`.
 */
type GeminiRequest = {
  contents: { role: "user" | "model"; parts: Part[] }[];
  system_instruction?: { parts: Part[] };
  generation_config: {
    thinking_config?: { thinking_level: string };
    max_output_tokens?: number;
    response_mime_type?: string;
    response_json_schema?: unknown;
  };
};
type UsageMetadata = { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
type GeminiResponse = { candidates?: { content?: { parts?: Part[] } }[]; usageMetadata?: UsageMetadata };
type InlinedResponse = { response?: GeminiResponse; error?: { code?: number; message?: string }; metadata?: { key?: string } };

/** Job states the API reports, in the REST (`BATCH_STATE_*`) and the SDK (`JOB_STATE_*`) spelling. */
const SUCCEEDED = new Set(["BATCH_STATE_SUCCEEDED", "JOB_STATE_SUCCEEDED"]);
const ENDED = new Set([...SUCCEEDED, "BATCH_STATE_FAILED", "JOB_STATE_FAILED", "BATCH_STATE_CANCELLED", "JOB_STATE_CANCELLED", "BATCH_STATE_EXPIRED", "JOB_STATE_EXPIRED"]);

/** An error the caller can retry or not by its status, as `callModel` reads one. */
export class BatchCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BatchCallError";
  }
}

export type BatchCollectorOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  /** A batch is sent once no call has arrived for this long. */
  debounceMs?: number;
  /** A batch is sent at once when it holds this many calls. */
  maxRequests?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Told when a job is sent and when it ends, for progress output. */
  onJob?: (event: { model: string; job: string; requests: number; state: string }) => void;
};

/** One HTTP request to the batch API is abandoned after this long. */
const REQUEST_TIMEOUT_MS = 60_000;
/** Status checks in a row that may fail (network, 429, 5xx) before a job is given up: about an hour at the default poll interval. */
const MAX_FAILED_POLLS = 360;

/**
 * A request's error inside a finished job carries a `google.rpc.Code`, not an HTTP status. Mapped
 * to the HTTP status `callModel` decides a retry by: invalid argument, permission and not-found are
 * final; quota, deadline and anything else are worth another try.
 */
const RPC_TO_HTTP: Record<number, number> = { 3: 400, 5: 404, 7: 403, 16: 401, 8: 429, 4: 408 };
const httpStatusOf = (rpcCode: number | undefined) => (rpcCode === undefined ? 500 : (RPC_TO_HTTP[rpcCode] ?? 500));

/** A failure worth asking again: the network, a timeout, rate limiting or the server. */
const isTransient = (error: unknown) => !(error instanceof BatchCallError) || error.status === 429 || error.status === 408 || error.status >= 500;

type Waiting = {
  request: GeminiRequest;
  resolve: (response: GeminiResponse) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  /** True once the caller gave up: its job may then be cancelled when no other caller waits on it. */
  aborted: boolean;
};

export class GeminiBatchCollector {
  private readonly queues = new Map<string, Waiting[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly options: Required<Omit<BatchCollectorOptions, "onJob">> & Pick<BatchCollectorOptions, "onJob">;

  constructor(options: BatchCollectorOptions) {
    if (!options.apiKey) throw new Error("Gemini batch needs an API key (GOOGLE_API_KEY_BATCH or GOOGLE_API_KEY)");
    this.options = {
      fetch: globalThis.fetch,
      debounceMs: 2_000,
      maxRequests: 200,
      pollMs: 10_000,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...options,
    };
  }

  /**
   * Queues one request; resolves with its response once the batch that carries it has finished.
   * A call cancelled before its batch is sent leaves the queue. Once sent, it is rejected at once,
   * and the job is cancelled on the provider when every call in it was cancelled.
   */
  enqueue(model: string, request: GeminiRequest, signal?: AbortSignal): Promise<GeminiResponse> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const onAbort = () => {
        waiting.aborted = true;
        const queue = this.queues.get(model) ?? [];
        const index = queue.indexOf(waiting);
        if (index >= 0) queue.splice(index, 1);
        reject(signal!.reason);
      };
      const settle = <T>(finish: (value: T) => void) => (value: T) => {
        signal?.removeEventListener("abort", onAbort);
        finish(value);
      };
      const waiting: Waiting = { request, resolve: settle(resolve), reject: settle(reject), signal, aborted: false };
      signal?.addEventListener("abort", onAbort, { once: true });
      const queue = this.queues.get(model) ?? [];
      queue.push(waiting);
      this.queues.set(model, queue);
      clearTimeout(this.timers.get(model));
      if (queue.length >= this.options.maxRequests) return void this.flush(model);
      this.timers.set(model, setTimeout(() => void this.flush(model), this.options.debounceMs));
    });
  }

  private async flush(model: string): Promise<void> {
    clearTimeout(this.timers.get(model));
    const batch = (this.queues.get(model) ?? []).filter((waiting) => !waiting.aborted);
    this.queues.set(model, []);
    if (batch.length === 0) return;
    try {
      const responses = await this.run(model, batch);
      batch.forEach((waiting, index) => {
        const entry = responses.get(String(index));
        if (entry?.response) return waiting.resolve(entry.response);
        waiting.reject(new BatchCallError(entry?.error?.message ?? "batch returned no response for this request", httpStatusOf(entry?.error?.code)));
      });
    } catch (error) {
      for (const waiting of batch) waiting.reject(error);
    }
  }

  private async call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.options.fetch(url, {
      ...init,
      headers: { "x-goog-api-key": this.options.apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BatchCallError(`Gemini batch API ${response.status}: ${JSON.stringify(body).slice(0, 300)}`, response.status);
    return body;
  }

  /**
   * Sends one job and polls it until it ends. A status check that fails is tried again, so a
   * passing network or server error never drops a job that is still running and billed. Responses
   * are keyed by each request's position.
   */
  private async run(model: string, batch: Waiting[]): Promise<Map<string, InlinedResponse>> {
    const created = await this.call(`${API}/models/${model}:batchGenerateContent`, {
      method: "POST",
      body: JSON.stringify({
        batch: {
          display_name: `interviewlab-eval-${Date.now()}`,
          input_config: { requests: { requests: batch.map((waiting, index) => ({ request: waiting.request, metadata: { key: String(index) } })) } },
        },
      }),
    });
    const job = String(created.name);
    this.options.onJob?.({ model, job, requests: batch.length, state: "sent" });
    for (let failures = 0; ; ) {
      // Nobody waits on the job any more: stop paying for it.
      if (batch.every((waiting) => waiting.aborted)) {
        await this.call(`${API}/${job}:cancel`, { method: "POST" }).catch(() => undefined);
        this.options.onJob?.({ model, job, requests: batch.length, state: "cancelled by caller" });
        throw new BatchCallError(`batch ${job} cancelled: every call in it was cancelled`, 499);
      }
      let status: Record<string, unknown>;
      try {
        status = await this.call(`${API}/${job}`);
        failures = 0;
      } catch (error) {
        failures += 1;
        if (!isTransient(error) || failures >= MAX_FAILED_POLLS) throw error;
        await this.options.sleep(this.options.pollMs);
        continue;
      }
      const metadata = (status.metadata ?? {}) as Record<string, unknown>;
      const state = String(metadata.state ?? status.state ?? "");
      if (status.done === true || ENDED.has(state)) {
        this.options.onJob?.({ model, job, requests: batch.length, state });
        // A finished job that names no state is read as succeeded; its responses still say per request.
        if (state !== "" && !SUCCEEDED.has(state)) throw new BatchCallError(`batch ${job} ended ${state}`, 500);
        return keyed(inlinedResponses(status));
      }
      await this.options.sleep(this.options.pollMs);
    }
  }
}

/** The documented places a finished job's inline responses appear in. */
function inlinedResponses(status: Record<string, unknown>): InlinedResponse[] {
  const holders = [status.response, status.dest, (status.metadata as Record<string, unknown> | undefined)?.output] as (Record<string, unknown> | undefined)[];
  for (const holder of holders) {
    const inlined = holder?.inlinedResponses as { inlinedResponses?: InlinedResponse[] } | InlinedResponse[] | undefined;
    const list = Array.isArray(inlined) ? inlined : inlined?.inlinedResponses;
    if (list) return list;
  }
  return [];
}

function keyed(responses: InlinedResponse[]): Map<string, InlinedResponse> {
  return new Map(responses.map((entry, index) => [entry.metadata?.key ?? String(index), entry]));
}

/** The JSON Schema of a reply, without the `$schema` URI the API does not take. */
function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** One LangChain conversation as a Gemini request: system text apart, the rest as user and model turns. */
export function toGeminiRequest(messages: BaseMessage[], spec: RoleSpec, schema?: z.ZodType, maxOutputTokens?: number): GeminiRequest {
  const text = (message: BaseMessage) => [{ text: message.text }];
  const system = messages.filter((message) => message.getType() === "system");
  const jsonSchema = schema ? jsonSchemaOf(schema) : undefined;
  return {
    contents: messages
      .filter((message) => message.getType() !== "system")
      .map((message) => ({ role: message.getType() === "ai" ? ("model" as const) : ("user" as const), parts: text(message) })),
    ...(system.length > 0 ? { system_instruction: { parts: system.flatMap(text) } } : {}),
    generation_config: {
      thinking_config: { thinking_level: spec.effort.toUpperCase() },
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(jsonSchema ? { response_mime_type: "application/json", response_json_schema: jsonSchema } : {}),
    },
  };
}

/** A Gemini response as the AIMessage `callModel` reads: the answer text, without thought parts, and the usage. */
export function fromGeminiResponse(response: GeminiResponse): AIMessage {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const usage = response.usageMetadata ?? {};
  const thoughts = usage.thoughtsTokenCount ?? 0;
  const output = (usage.candidatesTokenCount ?? 0) + thoughts;
  return new AIMessage({
    content: parts.filter((part) => !part.thought).map((part) => part.text ?? "").join(""),
    usage_metadata: {
      input_tokens: usage.promptTokenCount ?? 0,
      output_tokens: output,
      total_tokens: (usage.promptTokenCount ?? 0) + output,
      input_token_details: { cache_read: usage.cachedContentTokenCount ?? 0 },
      output_token_details: { reasoning: thoughts },
    },
  });
}

/**
 * The part of a chat model `callModel` uses, served by the batch collector: `invoke` for text,
 * `withStructuredOutput(..., { includeRaw })` for JSON. No streaming: nobody watches a batch.
 */
export function geminiBatchModel(spec: RoleSpec, collector: GeminiBatchCollector, options: ModelOptions = {}): BaseChatModel {
  const ask = async (messages: BaseMessage[], config: { signal?: AbortSignal } | undefined, schema?: z.ZodType) =>
    fromGeminiResponse(await collector.enqueue(spec.model, toGeminiRequest(messages, spec, schema, options.maxOutputTokens), config?.signal));
  const model = {
    invoke: (messages: BaseMessage[], config?: { signal?: AbortSignal }) => ask(messages, config),
    withStructuredOutput: (schema: z.ZodType) => ({
      invoke: async (messages: BaseMessage[], config?: { signal?: AbortSignal }) => {
        const raw = await ask(messages, config, schema);
        // A reply that is not JSON parses as nothing; `callModel` then bills it and asks again.
        const parsed = (() => {
          try {
            return JSON.parse(raw.text);
          } catch {
            return undefined;
          }
        })();
        return { raw, parsed };
      },
    }),
    stream: () => {
      throw new Error("a batch model does not stream");
    },
  };
  return model as unknown as BaseChatModel;
}

/**
 * `callModel` dependencies that send every Gemini role through the collector, billed at the batch
 * price; a role on another provider keeps its usual client and price.
 */
export function batchLlmDeps(collector: GeminiBatchCollector, base: Partial<CallModelDeps> = {}): Partial<CallModelDeps> {
  const isGoogle = (spec: RoleSpec) => spec.provider === "google";
  return {
    ...base,
    createModel: (spec, options) =>
      isGoogle(spec) ? geminiBatchModel(spec, collector, options) : (base.createModel ?? createChatModel)(spec, options),
    priceTier: (spec) => (isGoogle(spec) ? "batch" : "standard"),
    attemptTimeoutMs: BATCH_ATTEMPT_TIMEOUT_MS,
  };
}
