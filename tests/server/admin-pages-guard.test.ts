import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");
const SERVICE_DIR = join(process.cwd(), "src", "server", "admin");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The code of a file without its comments, so a check named only in a comment does not count. */
const codeOf = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * What a request can reach in the admin area: its pages, its route handlers, and any module of
 * server functions, which Next serves as POST endpoints that no layout guards.
 */
const adminEntries = (dir: string) =>
  filesUnder(dir).filter((path) => /[\\/](page|route)\.tsx?$/.test(path) || /^\s*["']use server["']/m.test(readFileSync(path, "utf8")));

/**
 * A layout renders in parallel with its page, so the admin layout's check does not keep a page's
 * data from being read. Every page and route handler of the area must check for itself.
 */
describe("admin area", () => {
  it.each(adminEntries(ADMIN_DIR))("%s checks the admin itself", (path) => {
    expect(codeOf(path)).toMatch(/await requireAdmin\(\)/);
  });

  it.each(filesUnder(SERVICE_DIR))("%s checks the user it is handed", (path) => {
    expect(codeOf(path)).toMatch(/assertAdmin\(/);
  });

  it("has a page to check", () => {
    expect(adminEntries(ADMIN_DIR).length).toBeGreaterThan(0);
  });
});
