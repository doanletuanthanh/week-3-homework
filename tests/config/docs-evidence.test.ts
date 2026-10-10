import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { curatedPersonas, curatedTopics } from "../helpers/curated-scenarios";

/** The pages a maintainer reads: the README and everything written under `docs/`, the design snapshot's own files aside. */
const PAGES = ["README.md", "docs/design/README.md", ...readdirSync("docs").filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`)];
const ROOTS = ["tests", "src", "cli", "scenarios", "evalsets", "drizzle", "docs", "plans", "supabase"];

const read = (page: string) => readFileSync(page, "utf8");
/** What a page writes between backticks. */
const quoted = (page: string) => [...read(page).matchAll(/`([^`\n]+)`/gu)].map((match) => match[1]);
/** A path with a placeholder or a pattern in it names no one file. */
const isExactPath = (text: string) => ROOTS.some((root) => text === root || text.startsWith(`${root}/`)) && !/[<>*{}\s|]/u.test(text);

/** The commands `pnpm il` knows, as its table of commands names them. */
function cliCommands(): string[] {
  const table = read("cli/index.ts").match(/const commands: Record<string, Command> = \{([\s\S]*?)\n {2}\};/u)?.[1] ?? "";
  return [...table.matchAll(/^ {4}"?([a-z-]+)"?: \w+Command\(/gmu)].map((match) => match[1]);
}

describe("what the docs point at", () => {
  it.each(PAGES)("%s: every file or folder it names is in the repository", (page) => {
    const paths = [...new Set(quoted(page).filter(isExactPath))];
    expect(paths.filter((path) => !existsSync(path))).toEqual([]);
  });

  it("the command table of the CLI is read whole", () => {
    expect(cliCommands()).toEqual(expect.arrayContaining(["validate", "import", "check-strings", "approve-strings", "publish", "seed-demo"]));
  });

  it.each(PAGES)("%s: every `pnpm il` command it gives exists", (page) => {
    const known = new Set([...cliCommands(), "help"]);
    const given = [...read(page).matchAll(/pnpm il ([a-z][a-z-]*)/gu)].map((match) => match[1]);
    expect([...new Set(given)].filter((name) => !known.has(name))).toEqual([]);
  });

  it.each(PAGES)("%s: every package script it gives exists", (page) => {
    const scripts = new Set(Object.keys((JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts));
    // `pnpm exec`, `pnpm install` and the like are pnpm's own.
    const own = new Set(["il", "exec", "install", "add", "dlx", "run"]);
    // Between backticks in a sentence, or at the start of a line of a command block.
    const given = [...read(page).matchAll(/(?:`|^\s*)pnpm ([a-z][a-z0-9:-]*)/gmu)].map((match) => match[1]);
    expect([...new Set(given)].filter((name) => !scripts.has(name) && !own.has(name))).toEqual([]);
  });
});

describe("what the launch checklist says of the library", () => {
  const checklist = read("docs/launch-checklist.md");

  it("counts the curated topics and personas that are on disk", () => {
    const topics = curatedTopics();
    const personas = curatedPersonas();
    expect(checklist).toContain(`${topics.length} curated topics`);
    expect(checklist).toContain(`${personas.length} personas`);
    // A topic with one persona is named as such: the PRD plans three for each.
    for (const entry of topics.filter((topic) => topic.personas.length === 1)) expect(checklist, entry.folder).toContain(`\`${entry.topic.id}\` has one persona`);
  });

  it("names every curated persona", () => {
    for (const { scenario } of curatedPersonas()) expect(checklist, scenario.persona_id).toContain(`\`${scenario.persona_id}\``);
  });

  it("no longer says the library is out, and sends the demo path through it", () => {
    expect(checklist).not.toMatch(/without the library|Library screens are out|The S2 library,/u);
    expect(checklist).toMatch(/Home → library → topic → prep/u);
  });

  it("cites the specs of the library and the topic screen", () => {
    for (const spec of ["tests/e2e/library.spec.ts", "tests/e2e/topic.spec.ts", "tests/e2e/library-path.spec.ts", "tests/e2e/home-and-next-persona.spec.ts"]) expect(checklist).toContain(`\`${spec}\``);
  });
});
