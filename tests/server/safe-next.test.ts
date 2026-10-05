import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/server/safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/sessions/123", "/sessions/123"],
    ["/data-notice?next=%2Fsessions%2F1", "/data-notice?next=%2Fsessions%2F1"],
    ["/", "/"],
  ])("keeps the same-origin path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    "https://evil.example/sessions/1",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/.//evil.example/login",
    "/..//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/./\\evil.example",
    "javascript:alert(1)",
    "sessions/1",
    "",
    null,
    undefined,
  ])("falls back to the home page for %s", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  it("drops the fragment", () => {
    expect(safeNextPath("/sessions/1#x")).toBe("/sessions/1");
  });
});
