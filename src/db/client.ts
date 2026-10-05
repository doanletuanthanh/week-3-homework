import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase transaction pooler: no prepared statements, one connection per function instance.
  const client = postgres(url, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
/** A database handle or an open transaction; repo functions accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

// Survives dev hot reloads so each reload does not open another connection.
const globalForDb = globalThis as unknown as { __interviewlabDb?: Database };

export function getDb(): Database {
  globalForDb.__interviewlabDb ??= createDb();
  return globalForDb.__interviewlabDb;
}
