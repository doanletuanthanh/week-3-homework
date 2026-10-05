import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { LOCAL_DATABASE_URL } from "./local-stack";

/** Applies the committed migrations to the local database once per run. */
export default async function setup() {
  const client = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } catch (error) {
    throw new Error("Integration tests need the local Supabase stack: run `pnpm supabase:start` first.", {
      cause: error,
    });
  } finally {
    await client.end();
  }
}
