import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import type { z } from "zod";
import { roleSpecFromEnv } from "@/config/env";
import { LLM_ATTEMPT_TIMEOUT_MS, LLM_MAX_RETRIES } from "@/config/limits";
import { getDb } from "@/db/client";
import { recordLlmCall, type LlmCallRecord } from "@/db/repo/llm-calls";
import type { LlmScope } from "@/db/schema";
import { createChatModel } from "./create-model";
import { costUsd, ZERO_USAGE, type TokenUsage } from "./pricing";
import type { Role, RoleSpec } from "./roles";

/** Which budget a call belongs to, and the row it is attributed to. */
export type CallScope = { scope: LlmScope; sessionId?: string; branchId?: string; turnIndex?: number; attemptId?: string };

export type CallModelOptions<T> = {
  /** When set, the reply is structured output that must parse with this schema. */
  schema?: z.ZodType<T>;
  /** LangSmith metadata, e.g. `{ session_id, turn_index }`. The call role is added. */
  meta: Record<string, string | number>;
  scope: CallScope;
  /** Caller cancellation. An aborted call is recorded but not retried. */
  signal?: AbortSignal;
  /**
   * Text replies only: receives the reply piece by piece as the provider sends it. Once a piece
   * has been handed over, a failure is final: a retry would send the reader a second beginning.
   */
  onDelta?: (text: string) => void;
};

export type CallModelResult<T> = {
  output: T;
  /** Usage, cost and latency of the successful attempt. Failed attempts are in `llm_call`. */
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  attempts: number;
};

/** Seams for tests: the provider client and the `llm_call` writer. */
export type CallModelDeps = {
  roleSpec: (role: Role) => RoleSpec;
  createModel: (spec: RoleSpec) => BaseChatModel;
  recordCall: (record: LlmCallRecord) => Promise<void>;
  attemptTimeoutMs: number;
  /** Cancels every call made with these dependencies: a run that is being stopped as a whole. */
  signal?: AbortSignal;
};

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * The plain handle, not a transaction: the row stays even if the caller's work rolls back. When
 * the session was deleted while the call ran (the learner deleted their account), the row is
 * written without the session, so the cost still counts against the day's cap.
 */
export const recordCallToDb: CallModelDeps["recordCall"] = async (record) => {
  try {
    await recordLlmCall(getDb(), record);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code !== FOREIGN_KEY_VIOLATION || (record.sessionId == null && record.branchId == null)) throw error;
    await recordLlmCall(getDb(), { ...record, sessionId: null, branchId: null });
  }
};

const defaultDeps: CallModelDeps = {
  roleSpec: roleSpecFromEnv,
  createModel: (spec) => createChatModel(spec),
  recordCall: recordCallToDb,
  attemptTimeoutMs: LLM_ATTEMPT_TIMEOUT_MS,
};

/** Thrown when every attempt failed. Each attempt already has its `llm_call` row. */
export class LlmCallError extends Error {
  constructor(
    readonly role: Role,
    readonly attempts: number,
    cause: unknown,
  ) {
    super(`LLM call ${role} failed after ${attempts} attempt(s)`, { cause });
    this.name = "LlmCallError";
  }
}

function readUsage(message: AIMessage | undefined): TokenUsage {
  const usage = message?.usage_metadata;
  if (!usage) return ZERO_USAGE;
  return {
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.input_token_details?.cache_read ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.output_token_details?.reasoning ?? 0,
  };
}

/** A failure that already consumed tokens (empty or unparseable reply), so its cost is known. */
class BilledAttemptError extends Error {
  constructor(
    message: string,
    readonly usage: TokenUsage,
  ) {
    super(message);
  }
}

/**
 * A request the provider rejected (bad key, bad request, blocked content) fails the same way
 * every time, so it is not repeated. Timeouts, rate limits, server errors and bad replies are.
 */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status < 400 || status >= 500 || status === 408 || status === 429;
}

/**
 * The single entry point for model calls. Resolves the role to provider, model and effort from
 * env, applies a per-attempt timeout, retries technical failures, writes one `llm_call` row per
 * attempt (success or failure) as it returns, and flushes tracing before resolving. With
 * `onDelta` the reply is streamed; a technical retry is then possible only before the first piece.
 */
export async function callModel(
  role: Role,
  messages: BaseMessage[],
  options: CallModelOptions<string> & { schema?: undefined },
  deps?: Partial<CallModelDeps>,
): Promise<CallModelResult<string>>;
export async function callModel<T>(
  role: Role,
  messages: BaseMessage[],
  options: CallModelOptions<T> & { schema: z.ZodType<T> },
  deps?: Partial<CallModelDeps>,
): Promise<CallModelResult<T>>;
export async function callModel<T>(
  role: Role,
  messages: BaseMessage[],
  options: CallModelOptions<T>,
  depsOverride: Partial<CallModelDeps> = {},
): Promise<CallModelResult<T | string>> {
  const deps = { ...defaultDeps, ...depsOverride };
  const spec = deps.roleSpec(role);
  const model = deps.createModel(spec);
  const { schema, scope, onDelta } = options;
  const signal = options.signal && deps.signal ? AbortSignal.any([options.signal, deps.signal]) : (options.signal ?? deps.signal);
  let deltaSent = false;
  const runConfig = {
    runName: role,
    tags: [`call:${role.toLowerCase()}`],
    metadata: { ...options.meta, call_role: role },
  };

  const runAttempt = async (attemptSignal: AbortSignal): Promise<{ output: T | string; usage: TokenUsage }> => {
    const config = { ...runConfig, signal: attemptSignal };
    if (schema) {
      // includeRaw keeps the AIMessage, which is the only place usage is reported.
      const { raw, parsed } = await model.withStructuredOutput(schema, { includeRaw: true }).invoke(messages, config);
      const usage = readUsage(raw as AIMessage);
      const checked = schema.safeParse(parsed);
      if (!checked.success) throw new BilledAttemptError("structured output failed validation", usage);
      return { output: checked.data, usage };
    }
    if (!onDelta) {
      const message = (await model.invoke(messages, config)) as AIMessage;
      const usage = readUsage(message);
      const text = message.text.trim();
      if (!text) throw new BilledAttemptError("model returned an empty reply", usage);
      return { output: text, usage };
    }

    let whole: AIMessageChunk | undefined;
    for await (const chunk of await model.stream(messages, config)) {
      whole = whole ? whole.concat(chunk) : chunk;
      if (chunk.text) {
        deltaSent = true;
        onDelta(chunk.text);
      }
    }
    const usage = readUsage(whole);
    const text = whole?.text.trim() ?? "";
    if (!text) throw new BilledAttemptError("model returned an empty reply", usage);
    return { output: text, usage };
  };

  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= LLM_MAX_RETRIES + 1; attempt++) {
      const startedAt = Date.now();
      const timeout = AbortSignal.timeout(deps.attemptTimeoutMs);
      const attemptSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const record = (ok: boolean, usage: TokenUsage) => {
        const cost = costUsd(spec.model, usage);
        const latencyMs = Date.now() - startedAt;
        return deps
          .recordCall({
            scope: scope.scope,
            sessionId: scope.sessionId,
            branchId: scope.branchId,
            turnIndex: scope.turnIndex,
            attemptId: scope.attemptId,
            role,
            model: spec.model,
            tokensIn: usage.inputTokens,
            tokensOut: usage.outputTokens,
            tokensCached: usage.cachedInputTokens,
            tokensReasoning: usage.reasoningTokens,
            costUsd: cost,
            latencyMs,
            attempt,
            ok,
          })
          .then(() => ({ cost, latencyMs }));
      };

      // Only the model attempt is guarded. A failure to write the `llm_call` row is not a model
      // failure: it propagates as it is, and the model is never called again because of it.
      let result: Awaited<ReturnType<typeof runAttempt>> | undefined;
      try {
        result = await runAttempt(attemptSignal);
      } catch (error) {
        lastError = error;
      }

      if (result) {
        const { cost, latencyMs } = await record(true, result.usage);
        return { output: result.output, usage: result.usage, costUsd: cost, latencyMs, attempts: attempt };
      }
      await record(false, lastError instanceof BilledAttemptError ? lastError.usage : ZERO_USAGE);
      if (signal?.aborted || deltaSent || !isRetryable(lastError)) throw new LlmCallError(role, attempt, lastError);
    }
    throw new LlmCallError(role, LLM_MAX_RETRIES + 1, lastError);
  } finally {
    // Serverless: tracing callbacks must finish before the function is frozen.
    await awaitAllCallbacks();
  }
}
