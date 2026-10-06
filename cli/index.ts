import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import type { Database } from "@/db/client";
import type { CallModelDeps } from "@/llm/call-model";
import { adjudicateCommand } from "./commands/adjudicate";
import { configCommand } from "./commands/config";
import { evalCommand } from "./commands/eval";
import { importCommand } from "./commands/import-scenario";
import { judgementEvalCommand } from "./commands/judgement-eval";
import { publishCommand, unpublishCommand } from "./commands/publish";
import { approveStringsCommand, checkStringsCommand } from "./commands/strings";
import { traceCommand } from "./commands/trace";
import { validateCommand } from "./commands/validate";
import { operatorEmail } from "./operator";
import type { CliIo, Command } from "./scenario-file";

config({ path: ".env.local", quiet: true });
// The CLI talks to Postgres over the session pooler / direct URL, like migrations do.
if (process.env.DATABASE_URL_DIRECT) process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT;

const io: CliIo = { out: (line) => console.log(line), err: (line) => console.error(line) };

async function confirm(question: string): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim().toLowerCase() === "yes";
  } finally {
    prompt.close();
  }
}

/** LangSmith reads these when a call starts, so they are set before the first one. */
function setTracing(on: boolean): void {
  for (const name of ["LANGSMITH_TRACING", "LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING", "LANGCHAIN_TRACING_V2"]) {
    process.env[name] = on ? "true" : "false";
  }
}

async function main(): Promise<number> {
  let db: Database | null = null;
  if (process.env.DATABASE_URL) {
    const { getDb } = await import("@/db/client");
    db = getDb();
  }
  const { listOtherPersonaTags } = await import("@/db/repo/scenarios");
  const { roleSpecFromEnv } = await import("@/config/env");
  const { createChatModel } = await import("@/llm/create-model");
  const { recordLlmCall } = await import("@/db/repo/llm-calls");
  const connected = db;
  // Operator commands use the batch key when there is one, and keep their cost in `llm_call`
  // whenever a database is connected.
  const llmDeps = (): Partial<CallModelDeps> => ({
    createModel: (spec) => createChatModel(spec, { batch: true }),
    recordCall: connected ? (record) => recordLlmCall(connected, record) : async () => {},
  });
  const commands: Record<string, Command> = {
    validate: validateCommand(
      connected ? (topicId, personaId) => listOtherPersonaTags(connected, topicId, personaId) : undefined,
    ),
    import: importCommand(connected),
    config: configCommand(connected, operatorEmail),
    trace: traceCommand(connected, operatorEmail),
    eval: evalCommand(connected, () => ({ roleSpec: roleSpecFromEnv, llmDeps: llmDeps(), confirm, setTracing })),
    adjudicate: adjudicateCommand(connected, operatorEmail),
    "check-strings": checkStringsCommand(connected, llmDeps),
    "approve-strings": approveStringsCommand(connected, operatorEmail),
    publish: publishCommand(connected, operatorEmail),
    unpublish: unpublishCommand(connected, operatorEmail),
    "judgement-eval": judgementEvalCommand(llmDeps),
  };

  const [name, ...args] = process.argv.slice(2);
  const command = name ? commands[name] : undefined;
  if (!command) {
    const askedForHelp = name === undefined || name === "help" || name === "--help";
    if (!askedForHelp) io.err(`Không có lệnh "${name}".`);
    io.out("Cách dùng: pnpm il <lệnh>");
    for (const entry of Object.values(commands)) io.out(`  ${entry.usage.padEnd(34)} ${entry.summary}`);
    return askedForHelp ? 0 : 1;
  }
  return command.run(args, io);
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
