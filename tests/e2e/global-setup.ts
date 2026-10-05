import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { resetDatabase } from "../helpers/test-db";
import migrate from "../helpers/int-global-setup";
import { LOCAL_DATABASE_URL } from "../helpers/local-stack";

/** Migrated schema, empty tables, no auth accounts from earlier runs, and the one persona. */
export default async function globalSetup() {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  await migrate();
  await resetDatabase();
  // Local stack only: the URL above is the fixed local address.
  await getDb().execute(sql`DELETE FROM auth.users`);
}
