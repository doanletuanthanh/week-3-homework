import { describe, expect, it } from "vitest";
import { RateLimitError, withRateLimitBackoff } from "@/eval/rate-limit";
import { LlmCallError } from "@/llm/call-model";

const rateLimited = () => new LlmCallError("ANALYSIS", 3, Object.assign(new Error("429 Too Many Requests"), { status: 429 }));

/** A step that fails with each error in turn, then answers "ok". */
function failing(errors: Error[]) {
  let calls = 0;
  const step = async () => {
    calls += 1;
    const error = errors.shift();
    if (error) throw error;
    return "ok";
  };
  return { step, calls: () => calls };
}

describe("withRateLimitBackoff", () => {
  it("waits and repeats the step when the provider answers 429, then carries on", async () => {
    const { step, calls } = failing([rateLimited()]);
    const waits: number[] = [];

    expect(await withRateLimitBackoff(step, { rateLimitDelaysMs: [5, 10], sleep: async (ms) => void waits.push(ms) })).toBe("ok");

    expect(waits).toEqual([5]);
    expect(calls()).toBe(2);
  });

  it("gives up with a rate limit error once every wait is used", async () => {
    const { step } = failing([rateLimited(), rateLimited(), rateLimited()]);
    const waits: number[] = [];

    await expect(withRateLimitBackoff(step, { rateLimitDelaysMs: [5, 10], sleep: async (ms) => void waits.push(ms) })).rejects.toBeInstanceOf(RateLimitError);
    expect(waits).toEqual([5, 10]);
  });

  it("does not wait for a failure that is not a rate limit", async () => {
    const { step } = failing([new LlmCallError("ANALYSIS", 3, new Error("boom"))]);
    const waits: number[] = [];

    await expect(withRateLimitBackoff(step, { rateLimitDelaysMs: [5], sleep: async (ms) => void waits.push(ms) })).rejects.toThrow(/ANALYSIS failed after 3 attempt/);
    expect(waits).toEqual([]);
  });
});
