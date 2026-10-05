import { describe, expect, it } from "vitest";
import { costUsd, hasPrice } from "@/llm/pricing";
import { parseRoleSpec } from "@/llm/roles";

describe("parseRoleSpec", () => {
  it("parses provider, model and effort", () => {
    expect(parseRoleSpec("openai:gpt-6.1-sol:medium")).toEqual({ provider: "openai", model: "gpt-6.1-sol", effort: "medium" });
    expect(parseRoleSpec(" google : gemini-3.8-flash : low ")).toEqual({
      provider: "google",
      model: "gemini-3.8-flash",
      effort: "low",
    });
  });

  it.each(["", "google", "google:gemini-3.8-flash", "google::low", "google:a:b:c"])("rejects %j", (raw) => {
    expect(() => parseRoleSpec(raw)).toThrow();
  });
});

describe("costUsd", () => {
  it("prices fresh input, cached input and output separately", () => {
    // gpt-6-luna: 0.10 in, 0.01 cached in, 0.50 out per 1M tokens.
    const cost = costUsd("gpt-6-luna", { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 200_000, reasoningTokens: 50_000 });
    expect(cost).toBeCloseTo(0.6 * 0.1 + 0.4 * 0.01 + 0.2 * 0.5, 10);
  });

  it("is zero for a call that used no tokens", () => {
    expect(costUsd("gemini-3.8-flash", { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 })).toBe(0);
  });

  it("never prices cached tokens above the input total", () => {
    expect(costUsd("gpt-6-luna", { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0, reasoningTokens: 0 })).toBeCloseTo(
      (500 * 0.01) / 1_000_000,
      12,
    );
  });

  it("refuses a model without a price", () => {
    expect(hasPrice("gemini-3.8-flash")).toBe(true);
    expect(hasPrice("made-up")).toBe(false);
    expect(() => costUsd("made-up", { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0 })).toThrow(
      /no price configured/,
    );
  });
});
