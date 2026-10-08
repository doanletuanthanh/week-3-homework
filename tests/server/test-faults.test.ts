import { describe, expect, it } from "vitest";
import { testFaultsEnabled } from "@/server/test-faults";

describe("testFaultsEnabled: the switch that lets a test fail a render", () => {
  const stub = "http://127.0.0.1:4010/v1";

  it("is on only when asked for and the model provider is the local stub", () => {
    expect(testFaultsEnabled({ E2E_TEST_FAULTS: "true", OPENAI_BASE_URL: stub })).toBe(true);
  });

  it.each([
    ["nothing set, as in a deployed app", {}],
    ["the switch alone, with the real provider", { E2E_TEST_FAULTS: "true" }],
    ["the switch with a provider that is not the local stub", { E2E_TEST_FAULTS: "true", OPENAI_BASE_URL: "https://api.openai.com/v1" }],
    ["the switch with a host that only starts like the stub", { E2E_TEST_FAULTS: "true", OPENAI_BASE_URL: "http://127.0.0.1.evil.example/v1" }],
    ["the stub alone, without the switch", { OPENAI_BASE_URL: stub }],
    ["the switch set to something else", { E2E_TEST_FAULTS: "1", OPENAI_BASE_URL: stub }],
  ])("is off with %s", (_name, env) => {
    expect(testFaultsEnabled(env)).toBe(false);
  });
});
