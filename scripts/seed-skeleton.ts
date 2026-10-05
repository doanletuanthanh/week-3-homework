import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// The CLI talks to Postgres over the session pooler / direct URL, like migrations do.
process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

async function main() {
  const { getDb } = await import("@/db/client");
  const { seedSkeletonPersona } = await import("@/db/seed-skeleton");
  await seedSkeletonPersona(getDb());
  console.log("Seeded the walking-skeleton persona.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
