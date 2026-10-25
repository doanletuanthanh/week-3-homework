import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { callModel } from "@/llm/call-model";
import { BatchCallError, batchLlmDeps, fromGeminiResponse, GeminiBatchCollector, toGeminiRequest } from "@/llm/gemini-batch";
import type { RoleSpec } from "@/llm/roles";

const spec: RoleSpec = { provider: "google", model: "gemini-3.8-flash", effort: "low" };

type Sent = { url: string; body: unknown };

/**
 * A batch API that finishes each job on its second successful poll and answers each request with
 * `answer(request, index)`. `failPolls` status checks fail with a 503 first.
 */
function fakeApi(answer: (request: Record<string, unknown>, index: number) => Record<string, unknown>, failPolls = 0) {
  const sent: Sent[] = [];
  let failuresLeft = failPolls;
  const jobs = new Map<string, { requests: { request: Record<string, unknown>; metadata: { key: string } }[]; polls: number }>();
  const fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (init?.method === "POST") {
      const name = `batches/${jobs.size + 1}`;
      jobs.set(name, { requests: body.batch.input_config.requests.requests, polls: 0 });
      return json({ name });
    }
    if (url.endsWith(":cancel")) return json({});
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      return new Response("{}", { status: 503 });
    }
    const job = jobs.get(url.slice(url.indexOf("batches/")))!;
    job.polls += 1;
    if (job.polls < 2) return json({ name: url, metadata: { state: "BATCH_STATE_RUNNING" } });
    // Answered in reverse order: responses are matched by key, not by position.
    const inlinedResponses = job.requests.map((entry, index) => ({ ...answer(entry.request, index), metadata: entry.metadata })).reverse();
    return json({ name: url, done: true, metadata: { state: "BATCH_STATE_SUCCEEDED" }, response: { inlinedResponses: { inlinedResponses } } });
  }) as typeof globalThis.fetch;
  return { fetch, sent, jobs };
}

const reply = (text: string, usage = { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 5 }) => ({
  response: { candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text }] } }], usageMetadata: usage },
});

const collector = (api: ReturnType<typeof fakeApi>) => new GeminiBatchCollector({ apiKey: "k", fetch: api.fetch, debounceMs: 5, pollMs: 0, sleep: async () => {} });

describe("Gemini batch transport", () => {
  it("sends the calls that arrive together as one job, and gives each its own answer", async () => {
    const api = fakeApi((request) => reply(`đáp: ${(request.contents as { parts: { text: string }[] }[])[0].parts[0].text}`));
    const batch = collector(api);
    const [a, b] = await Promise.all([batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("một")], spec)), batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("hai")], spec))]);
    expect(api.jobs.size).toBe(1);
    expect(fromGeminiResponse(a).text).toBe("đáp: một");
    expect(fromGeminiResponse(b).text).toBe("đáp: hai");
    expect(api.sent[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:batchGenerateContent");
  });

  it("writes requests in snake_case, the spelling a batch job honours, with the schema and the thinking level", () => {
    const request = toGeminiRequest([new SystemMessage("luật"), new HumanMessage("hỏi"), new AIMessage("đáp")], spec, z.object({ x: z.enum(["a", "b"]) }));
    expect(request).toEqual({
      contents: [
        { role: "user", parts: [{ text: "hỏi" }] },
        { role: "model", parts: [{ text: "đáp" }] },
      ],
      system_instruction: { parts: [{ text: "luật" }] },
      generation_config: {
        thinking_config: { thinking_level: "LOW" },
        response_mime_type: "application/json",
        response_json_schema: expect.objectContaining({ type: "object", properties: { x: { type: "string", enum: ["a", "b"] } } }),
      },
    });
    expect(request.generation_config.response_json_schema).not.toHaveProperty("$schema");
  });

  it("caps the output only when a cap is given", () => {
    expect(toGeminiRequest([new HumanMessage("hỏi")], spec, undefined, 400).generation_config).toEqual({ thinking_config: { thinking_level: "LOW" }, max_output_tokens: 400 });
    expect(toGeminiRequest([new HumanMessage("hỏi")], spec).generation_config).not.toHaveProperty("max_output_tokens");
  });

  it("reads usage with thoughts billed as output, and leaves thought parts out of the text", () => {
    const message = fromGeminiResponse(reply("xin chào").response);
    expect(message.text).toBe("xin chào");
    expect(message.usage_metadata).toMatchObject({ input_tokens: 100, output_tokens: 15, output_token_details: { reasoning: 5 } });
  });

  it("keeps a running job through status checks that fail, without sending it again", async () => {
    const api = fakeApi(() => reply("ok"), 3);
    const answer = await collector(api).enqueue(spec.model, toGeminiRequest([new HumanMessage("1")], spec));
    expect(fromGeminiResponse(answer).text).toBe("ok");
    expect(api.jobs.size).toBe(1);
  });

  it("cancels a sent job when every call in it was cancelled", async () => {
    const api = fakeApi(() => reply("ok"));
    const stop = new AbortController();
    const batch = new GeminiBatchCollector({ apiKey: "k", fetch: api.fetch, debounceMs: 1, pollMs: 0, sleep: async () => void stop.abort(new Error("stop")) });
    await expect(batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("1")], spec), stop.signal)).rejects.toThrow("stop");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.sent.some((entry) => entry.url.endsWith("batches/1:cancel"))).toBe(true);
  });

  it("refuses to start without an API key", () => {
    expect(() => new GeminiBatchCollector({ apiKey: "" })).toThrow(/API key/);
  });

  it("fails one request with the HTTP status of its RPC code, and the others not", async () => {
    // google.rpc.Code 3 is INVALID_ARGUMENT: final, so callModel does not send it again.
    const api = fakeApi((_request, index) => (index === 0 ? { error: { code: 3, message: "bad" } } : reply("ok")));
    const batch = collector(api);
    const results = await Promise.allSettled([batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("1")], spec)), batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("2")], spec))]);
    expect(results[0]).toMatchObject({ status: "rejected", reason: expect.objectContaining({ status: 400 }) });
    expect(results[0].status === "rejected" && results[0].reason).toBeInstanceOf(BatchCallError);
    expect(results[1].status).toBe("fulfilled");
  });

  it("drops a call cancelled before its job is sent", async () => {
    const api = fakeApi(() => reply("ok"));
    const batch = collector(api);
    const stop = new AbortController();
    const cancelled = batch.enqueue(spec.model, toGeminiRequest([new HumanMessage("1")], spec), stop.signal);
    stop.abort(new Error("stop"));
    await expect(cancelled).rejects.toThrow("stop");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.jobs.size).toBe(0);
  });

  it("serves callModel's structured calls and bills them at the batch price", async () => {
    const api = fakeApi(() => reply('{"x":"a"}', { promptTokenCount: 1_000_000, candidatesTokenCount: 0, thoughtsTokenCount: 0 }));
    const records: { costUsd: number }[] = [];
    const deps = batchLlmDeps(collector(api), { roleSpec: () => spec, recordCall: async (record) => void records.push(record) });
    const result = await callModel("ANALYSIS", [new HumanMessage("hỏi")], { schema: z.object({ x: z.enum(["a", "b"]) }), meta: {}, scope: { scope: "eval" } }, deps);
    expect(result.output).toEqual({ x: "a" });
    // 1M input tokens of gemini-3.8-flash: 0.75 USD standard, half in a batch.
    expect(records[0].costUsd).toBeCloseTo(0.375);
    // The role's output cap reaches the batch request.
    expect(JSON.stringify(api.sent)).toContain('"max_output_tokens":1024');
  });
});
