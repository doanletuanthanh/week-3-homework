import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_TILE } from "@/components/brand-mark";

describe("BRAND_TILE", () => {
  it("is the colour of the header's tile, so the tab icon and the header cannot drift apart", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toContain(`--primary-container:${BRAND_TILE};`);
  });
});
