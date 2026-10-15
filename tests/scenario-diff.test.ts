import { describe, expect, it } from "vitest";
import { diffScenario } from "@/scenario/diff";

describe("diffScenario", () => {
  it("names each changed, added and removed leaf by its path, and ignores the version", () => {
    const before = { version: 1, persona: { name: "Thu" }, items: [{ id: "a", content: "x" }, { id: "b" }], facts: [] };
    const after = { version: 2, persona: { name: "Thu", age: 30 }, items: [{ id: "a", content: "y" }], facts: ["mới"] };
    expect(diffScenario(before, after)).toEqual([
      { path: "persona.age", after: "30" },
      { path: "items[0].content", before: '"x"', after: '"y"' },
      { path: "facts[0]", after: '"mới"' },
      { path: "items[1].id", before: '"b"' },
      { path: "facts", before: "[]" },
    ]);
  });

  it("finds nothing between equal versions", () => {
    expect(diffScenario({ version: 1, a: [1, { b: 2 }] }, { version: 3, a: [1, { b: 2 }] })).toEqual([]);
  });
});
