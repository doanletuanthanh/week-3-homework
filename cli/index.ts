import { config } from "dotenv";
import type { Database } from "@/db/client";
import { configCommand } from "./commands/config";
import { importCommand } from "./commands/import-scenario";
import { traceCommand } from "./commands/trace";
import { validateCommand } from "./commands/validate";
import { operatorEmail } from "./operator";
import type { CliIo, Command } from "./scenario-file";

config({ path: ".env.local", quiet: true });
// The CLI talks to Postgres over the session pooler / direct URL, like migrations do.
if (process.env.DATABASE_URL_DIRECT) process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT;

const io: CliIo = { out: (line) => console.log(line), err: (line) => console.error(line) };

async function main(): Promise<number> {
  let db: Database | null = null;
  if (process.env.DATABASE_URL) {
    const { getDb } = await import("@/db/client");
    db = getDb();
  }
  const { listOtherPersonaTags } = await import("@/db/repo/scenarios");
  const connected = db;
  const commands: Record<string, Command> = {
    validate: validateCommand(
      connected ? (topicId, personaId) => listOtherPersonaTags(connected, topicId, personaId) : undefined,
    ),
    import: importCommand(connected),
    config: configCommand(connected, operatorEmail),
    trace: traceCommand(connected, operatorEmail),
  };

  const [name, ...args] = process.argv.slice(2);
  const command = name ? commands[name] : undefined;
  if (!command) {
    const askedForHelp = name === undefined || name === "help" || name === "--help";
    if (!askedForHelp) io.err(`Không có lệnh "${name}".`);
    io.out("Cách dùng: pnpm il <lệnh>");
    for (const entry of Object.values(commands)) io.out(`  ${entry.usage.padEnd(24)} ${entry.summary}`);
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
