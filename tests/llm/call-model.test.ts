import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_OUTPUT_TOKENS } from "@/config/limits";
import type { LlmCallRecord } from "@/db/repo/llm-calls";
import { callModel, LlmCallError, type CallModelDeps } from "@/llm/call-model";
import { scriptedModel, type ScriptedStep } from "../helpers/scripted-model";

const SESSION_ID = "0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10";
const messages = [new HumanMessage("câu hỏi")];
const options = { meta: { session_id: SESSION_ID, turn_index: 3 }, scope: { scope: "session" as const, sessionId: SESSION_ID } };

function harness(steps: ScriptedStep[], attemptTimeoutMs = 1_000) {
  const { model, calls } = scriptedModel(steps);
  const records: LlmCallRecord[] = [];
  const deps: Partial<CallModelDeps> = {
    roleSpec: () => ({ provider: "openai", model: "gpt-6-luna", effort: "low" }),
    createModel: () => model,
    recordCall: async (record) => void records.push(record),
    attemptTimeoutMs,
  };
  return { deps, records, calls };
}

describe("callModel", () => {
  it("returns the reply with usage, cost and latency, and records one successful call", async () => {
    const { deps, records, calls } = harness([{ text: "  Chị hay ghi vào sổ.  ", usage: { input: 1000, output: 200, cached: 400, reasoning: 50 } }]);

    const result = await callModel("PERSONA", messages, options, deps);

    expect(result.output).toBe("Chị hay ghi vào sổ.");
    expect(result.attempts).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 200, reasoningTokens: 50 });
    expect(result.costUsd).toBeCloseTo((600 * 0.1 + 400 * 0.01 + 200 * 0.5) / 1_000_000, 12);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      scope: "session",
      sessionId: SESSION_ID,
      role: "PERSONA",
      model: "gpt-6-luna",
      tokensIn: 1000,
      tokensOut: 200,
      tokensCached: 400,
      tokensReasoning: 50,
      attempt: 1,
      ok: true,
    });
    expect(records[0].costUsd).toBe(result.costUsd);
    expect(calls).toHaveLength(1);
  });

  it("builds the client with the role's output cap, and none for an uncapped role", async () => {
    const { deps } = harness([{ text: "a" }, { text: "b" }]);
    const seen: unknown[] = [];
    const createModel = deps.createModel!;
    const capped: Partial<CallModelDeps> = { ...deps, createModel: (spec, modelOptions) => (seen.push(modelOptions), createModel(spec)) };
    await callModel("PERSONA", messages, options, capped);
    await callModel("FEEDBACK", messages, options, capped);
    expect(seen).toEqual([{ maxOutputTokens: MAX_OUTPUT_TOKENS.PERSONA }, { maxOutputTokens: undefined }]);
  });

  it("attaches the call role and caller metadata for tracing", async () => {
    const { deps, calls } = harness([{ text: "ok" }]);
    await callModel("PERSONA", messages, options, deps);
    expect(calls[0].config.metadata).toEqual({ session_id: SESSION_ID, turn_index: 3, call_role: "PERSONA" });
    expect(calls[0].config.tags).toEqual(["call:persona"]);
  });

  it("retries a technical failure and records the failed attempt as well as the successful one", async () => {
    const { deps, records } = harness([{ error: new Error("503 from provider") }, { text: "lần hai" }]);

    const result = await callModel("PERSONA", messages, options, deps);

    expect(result.output).toBe("lần hai");
    expect(result.attempts).toBe(2);
    expect(records.map((record) => [record.attempt, record.ok])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("gives up after two retries; every failed attempt has its own row with ok = false", async () => {
    const { deps, records, calls } = harness([
      { error: new Error("boom 1") },
      { error: new Error("boom 2") },
      { error: new Error("boom 3") },
    ]);

    await expect(callModel("PERSONA", messages, options, deps)).rejects.toMatchObject({
      name: "LlmCallError",
      attempts: 3,
      cause: new Error("boom 3"),
    });

    expect(calls).toHaveLength(3);
    expect(records).toHaveLength(3);
    for (const [index, record] of records.entries()) {
      expect(record).toMatchObject({ attempt: index + 1, ok: false, costUsd: 0, tokensIn: 0, tokensOut: 0 });
    }
  });

  it("charges an empty reply as a failed attempt with its real cost", async () => {
    const { deps, records } = harness([{ text: "   ", usage: { input: 2000, output: 10 } }, { text: "có" }]);

    const result = await callModel("PERSONA", messages, options, deps);

    expect(result.attempts).toBe(2);
    expect(records[0]).toMatchObject({ ok: false, tokensIn: 2000, tokensOut: 10 });
    expect(records[0].costUsd).toBeCloseTo((2000 * 0.1 + 10 * 0.5) / 1_000_000, 12);
  });

  it("abandons an attempt that outlives the timeout and retries it", async () => {
    const { deps, records } = harness([{ hang: true }, { text: "kịp" }], 30);

    const result = await callModel("PERSONA", messages, options, deps);

    expect(result.output).toBe("kịp");
    expect(records.map((record) => record.ok)).toEqual([false, true]);
  });

  it("does not retry after the caller aborts, and still records the attempt", async () => {
    const { deps, records, calls } = harness([{ hang: true }, { text: "never used" }]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await expect(callModel("PERSONA", messages, { ...options, signal: controller.signal }, deps)).rejects.toBeInstanceOf(
      LlmCallError,
    );

    expect(calls).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(records[0].ok).toBe(false);
  });

  it.each([400, 401, 403, 404, 422])("does not repeat a request the provider rejected with %i", async (status) => {
    const { deps, records, calls } = harness([{ error: Object.assign(new Error("rejected"), { status }) }, { text: "never used" }]);

    await expect(callModel("PERSONA", messages, options, deps)).rejects.toMatchObject({ name: "LlmCallError", attempts: 1 });

    expect(calls).toHaveLength(1);
    expect(records.map((record) => record.ok)).toEqual([false]);
  });

  it.each([408, 429, 500, 503])("retries a provider error with status %i", async (status) => {
    const { deps, records } = harness([{ error: Object.assign(new Error("try later"), { status }) }, { text: "được" }]);

    const result = await callModel("PERSONA", messages, options, deps);

    expect(result.attempts).toBe(2);
    expect(records.map((record) => record.ok)).toEqual([false, true]);
  });

  it("does not call the model again when writing the llm_call row fails after a good reply", async () => {
    const { deps, calls } = harness([{ text: "trả lời tốt" }, { text: "never used" }]);
    const attempted: boolean[] = [];
    deps.recordCall = async (record) => {
      attempted.push(record.ok);
      throw new Error("database unavailable");
    };

    await expect(callModel("PERSONA", messages, options, deps)).rejects.toThrow("database unavailable");

    // One model call, one attempt to record it as a success: never relabelled as a failed call.
    expect(calls).toHaveLength(1);
    expect(attempted).toEqual([true]);
  });

  it("stops when the row of a failed attempt cannot be written, instead of calling the model unrecorded", async () => {
    const { deps, calls } = harness([{ error: new Error("503") }, { text: "never used" }]);
    deps.recordCall = async () => {
      throw new Error("database unavailable");
    };

    await expect(callModel("PERSONA", messages, options, deps)).rejects.toThrow("database unavailable");
    expect(calls).toHaveLength(1);
  });

  describe("streamed text", () => {
    const stream = (deps: Partial<CallModelDeps>, pieces: string[]) =>
      callModel("PERSONA", messages, { ...options, onDelta: (text) => pieces.push(text) }, deps);

    it("hands over each piece as it arrives and returns the whole reply with its usage", async () => {
      const { deps, records } = harness([{ text: "Chị hay ghi vào sổ tay.", usage: { input: 800, output: 30, cached: 200 } }]);
      const pieces: string[] = [];

      const result = await stream(deps, pieces);

      expect(pieces).toEqual(["Chị ", "hay ", "ghi ", "vào ", "sổ ", "tay."]);
      expect(result.output).toBe("Chị hay ghi vào sổ tay.");
      expect(result.usage).toEqual({ inputTokens: 800, cachedInputTokens: 200, outputTokens: 30, reasoningTokens: 0 });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ ok: true, attempt: 1, tokensIn: 800, tokensOut: 30, tokensCached: 200 });
    });

    it("retries a failure that happens before the first piece", async () => {
      const { deps, records } = harness([{ error: new Error("503") }, { text: "lần hai" }]);
      const pieces: string[] = [];

      const result = await stream(deps, pieces);

      expect(result.output).toBe("lần hai");
      expect(result.attempts).toBe(2);
      expect(pieces.join("")).toBe("lần hai");
      expect(records.map((record) => record.ok)).toEqual([false, true]);
    });

    it("does not retry once a piece was handed over: the reader never gets a second beginning", async () => {
      const { deps, records, calls } = harness([{ text: "một hai ba bốn", failAfterChunks: 2 }, { text: "không dùng" }]);
      const pieces: string[] = [];

      await expect(stream(deps, pieces)).rejects.toMatchObject({ name: "LlmCallError", attempts: 1 });

      expect(pieces).toEqual(["một ", "hai "]);
      expect(calls).toHaveLength(1);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ ok: false, attempt: 1 });
    });

    it("treats a stream with no text as an empty reply: a costed failure, then a retry", async () => {
      const { deps, records } = harness([{ text: "", usage: { input: 300, output: 2 } }, { text: "có chữ" }]);
      const pieces: string[] = [];

      expect((await stream(deps, pieces)).output).toBe("có chữ");
      expect(records[0]).toMatchObject({ ok: false, tokensIn: 300 });
      expect(records[0].costUsd).toBeGreaterThan(0);
    });

    it("does not stream when no listener is given", async () => {
      const { deps, calls } = harness([{ text: "một lần" }]);
      expect((await callModel("PERSONA", messages, options, deps)).output).toBe("một lần");
      expect(calls).toHaveLength(1);
    });
  });

  it("records the turn a call belongs to", async () => {
    const { deps, records } = harness([{ text: "ok" }]);
    await callModel("PERSONA", messages, { ...options, scope: { ...options.scope, turnIndex: 7 } }, deps);
    expect(records[0].turnIndex).toBe(7);
  });

  describe("structured output", () => {
    const schema = z.object({ label: z.enum(["open", "closed"]), turn: z.number().nullable() });

    it("returns the parsed object and reads usage from the raw message", async () => {
      const { deps, records } = harness([{ structured: { label: "open", turn: null }, usage: { input: 500, output: 40 } }]);

      const result = await callModel("PERSONA", messages, { ...options, schema }, deps);

      expect(result.output).toEqual({ label: "open", turn: null });
      expect(records[0]).toMatchObject({ ok: true, tokensIn: 500, tokensOut: 40 });
    });

    it("re-validates what the provider returned: a wrong shape is a costed failure, then a retry", async () => {
      const { deps, records } = harness([
        { structured: { label: "sideways", turn: "3" }, usage: { input: 500, output: 40 } },
        { structured: { label: "closed", turn: 3 } },
      ]);

      const result = await callModel("PERSONA", messages, { ...options, schema }, deps);

      expect(result.output).toEqual({ label: "closed", turn: 3 });
      expect(records[0]).toMatchObject({ ok: false, attempt: 1, tokensIn: 500, tokensOut: 40 });
      expect(records[0].costUsd).toBeGreaterThan(0);
      expect(records[1]).toMatchObject({ ok: true, attempt: 2 });
    });

    it("fails when the provider never returns a valid object", async () => {
      const { deps, records } = harness([{ structured: null }, { structured: {} }, { structured: { label: "open" } }]);

      await expect(callModel("PERSONA", messages, { ...options, schema }, deps)).rejects.toBeInstanceOf(LlmCallError);
      expect(records.map((record) => record.ok)).toEqual([false, false, false]);
    });
  });
  describe("fallback models", () => {
    const PRIMARY = { provider: "openai", model: "gpt-6.1-terra", effort: "low" } as const;
    const FALLBACK = { provider: "google", model: "gemini-3.8-flash", effort: "low" } as const;

    /** One scripted client per model, so each attempt shows which model answered it. */
    function chain(primarySteps: ScriptedStep[], fallbackSteps: ScriptedStep[]) {
      const primary = scriptedModel(primarySteps);
      const fallback = scriptedModel(fallbackSteps);
      const records: LlmCallRecord[] = [];
      const deps: Partial<CallModelDeps> = {
        roleSpec: () => PRIMARY,
        fallbackSpecs: () => [FALLBACK],
        createModel: (spec) => (spec.model === PRIMARY.model ? primary.model : fallback.model),
        recordCall: async (record) => void records.push(record),
        attemptTimeoutMs: 1_000,
      };
      return { deps, records, primaryCalls: primary.calls, fallbackCalls: fallback.calls };
    }
    const rows = (records: LlmCallRecord[]) => records.map((record) => [record.attempt, record.model, record.ok]);
    const rejected = (fields: Record<string, unknown>): ScriptedStep => ({ error: Object.assign(new Error("rejected"), fields) });
    const noCredit = () => rejected({ status: 429, rateLimitType: "stop" });

    /** Runs with console.warn captured, so the fallback log neither clutters the output nor goes unchecked. */
    async function withWarnings<T>(run: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
      const warnings: string[] = [];
      const warn = console.warn;
      console.warn = (line: string) => void warnings.push(line);
      try {
        return { result: await run(), warnings };
      } finally {
        console.warn = warn;
      }
    }

    it("asks the fallback once the primary's retries are spent, and numbers every attempt across both", async () => {
      const { deps, records } = chain([{ error: new Error("500") }, { error: new Error("500") }, { error: new Error("500") }], [{ text: "từ Google" }]);

      const { result } = await withWarnings(() => callModel("PERSONA", messages, options, deps));

      expect(result.output).toBe("từ Google");
      expect(result.attempts).toBe(4);
      expect(rows(records)).toEqual([
        [1, "gpt-6.1-terra", false],
        [2, "gpt-6.1-terra", false],
        [3, "gpt-6.1-terra", false],
        [4, "gemini-3.8-flash", true],
      ]);
      expect(result.costUsd).toBe(records[3].costUsd);
    });

    // Shapes read off the real clients: OpenAI's RateLimitError and Google's RequestError.
    it.each([
      ["OpenAI credit used up", { status: 429, code: "insufficient_quota", rateLimitType: "stop" }],
      ["Google credit used up", { statusCode: 429, rateLimitType: "stop" }],
      ["a bad key", { status: 401 }],
      ["a bad key reported by the Google client", { statusCode: 401 }],
    ])("goes to the fallback at once, without retrying, on %s", async (_case, fields) => {
      const { deps, records, primaryCalls } = chain([rejected(fields), { text: "never used" }], [{ text: "được" }]);

      const { result } = await withWarnings(() => callModel("PERSONA", messages, options, deps));

      expect(result.output).toBe("được");
      expect(primaryCalls).toHaveLength(1);
      expect(rows(records)).toEqual([
        [1, "gpt-6.1-terra", false],
        [2, "gemini-3.8-flash", true],
      ]);
    });

    it("still retries a passing rate limit on the primary", async () => {
      const { deps, records } = chain([rejected({ status: 429, rateLimitType: "capacity" }), { text: "lần hai" }], []);

      const result = await callModel("PERSONA", messages, options, deps);

      expect(result.output).toBe("lần hai");
      expect(rows(records)).toEqual([
        [1, "gpt-6.1-terra", false],
        [2, "gpt-6.1-terra", true],
      ]);
    });

    it("does not fall back once a streamed piece was handed over", async () => {
      const { deps, records, fallbackCalls } = chain([{ text: "một hai ba", failAfterChunks: 1 }], [{ text: "không dùng" }]);
      const pieces: string[] = [];

      await expect(callModel("PERSONA", messages, { ...options, onDelta: (text) => pieces.push(text) }, deps)).rejects.toMatchObject({
        name: "LlmCallError",
        attempts: 1,
      });

      expect(pieces).toEqual(["một "]);
      expect(fallbackCalls).toHaveLength(0);
      expect(records).toHaveLength(1);
    });

    it("falls back for a stream that failed before its first piece", async () => {
      const { deps } = chain([noCredit()], [{ text: "từ Google" }]);
      const pieces: string[] = [];

      const { result } = await withWarnings(() => callModel("PERSONA", messages, { ...options, onDelta: (text) => pieces.push(text) }, deps));

      expect(result.output).toBe("từ Google");
      expect(pieces.join("")).toBe("từ Google");
    });

    it("does not fall back after the caller aborts", async () => {
      const { deps, fallbackCalls } = chain([{ hang: true }], [{ text: "không dùng" }]);
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      await expect(callModel("PERSONA", messages, { ...options, signal: controller.signal }, deps)).rejects.toBeInstanceOf(LlmCallError);

      expect(fallbackCalls).toHaveLength(0);
    });

    it("fails with the total attempt count when every model of the chain failed", async () => {
      const { deps, records } = chain([noCredit()], [noCredit()]);

      await expect(withWarnings(() => callModel("PERSONA", messages, options, deps))).rejects.toMatchObject({ name: "LlmCallError", attempts: 2 });

      expect(rows(records)).toEqual([
        [1, "gpt-6.1-terra", false],
        [2, "gemini-3.8-flash", false],
      ]);
    });

    it("falls back when the primary never returns a valid structured object", async () => {
      const schema = z.object({ label: z.enum(["open", "closed"]) });
      const { deps, records } = chain([{ structured: {} }, { structured: {} }, { structured: {} }], [{ structured: { label: "open" } }]);

      const { result } = await withWarnings(() => callModel("ANALYSIS", messages, { ...options, schema }, deps));

      expect(result.output).toEqual({ label: "open" });
      expect(records.at(-1)).toMatchObject({ model: "gemini-3.8-flash", ok: true, attempt: 4 });
    });

    it("logs each fallback with role, models and status only, never the error text", async () => {
      const { deps } = chain([rejected({ status: 401, message: "prompt text" })], [{ text: "được" }]);

      const { warnings } = await withWarnings(() => callModel("PERSONA", messages, options, deps));

      expect(warnings).toEqual(["[callModel] PERSONA: gpt-6.1-terra failed (401), falling back to gemini-3.8-flash"]);
    });

    it("never falls back in an evaluation, so every score belongs to the model it names", async () => {
      const { deps, records, fallbackCalls } = chain([noCredit()], [{ text: "không dùng" }]);

      await expect(callModel("ANALYSIS", messages, { meta: {}, scope: { scope: "eval" } }, deps)).rejects.toMatchObject({ attempts: 1 });

      expect(fallbackCalls).toHaveLength(0);
      expect(rows(records)).toEqual([[1, "gpt-6.1-terra", false]]);
    });

    it("treats an insufficient_quota code as final even without the client's rate-limit marker", async () => {
      const { deps, primaryCalls } = chain([rejected({ status: 429, code: "insufficient_quota" }), { text: "never used" }], [{ text: "được" }]);

      const { result } = await withWarnings(() => callModel("PERSONA", messages, options, deps));

      expect(result.output).toBe("được");
      expect(primaryCalls).toHaveLength(1);
    });

    it("uses no fallback when the caller picks the model and names none", async () => {
      const { deps, records } = harness([rejected({ status: 401 })]);

      await expect(callModel("PERSONA", messages, options, deps)).rejects.toMatchObject({ attempts: 1 });
      expect(records).toHaveLength(1);
    });
  });
});
