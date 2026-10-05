import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { seedSkeletonPersona } from "@/db/seed-skeleton";
import type { AppUser } from "@/server/auth";
import { resolveUser } from "@/server/auth";

/** Empties every app table and re-inserts the one persona, so each test starts from the same state. */
export async function resetDatabase(): Promise<void> {
  const db = getDb();
  await db.execute(
    sql`TRUNCATE "turn", "session", "pending_action", "llm_call", "daily_spend", "scenario", "topic", "user" CASCADE`,
  );
  await seedSkeletonPersona(db);
}

/** Token claims as Supabase issues them for a Google sign-in. */
export function googleClaims(email: string, id: string = randomUUID()) {
  return {
    sub: id,
    email,
    is_anonymous: false,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { email, email_verified: true },
  };
}

const NO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: [] };

/** A learner row created through the real sign-in path. */
export async function createLearner(
  email: string,
  lists: { ADMIN_EMAILS: string[]; DEMO_ACCOUNT_EMAILS: string[] } = NO_LISTS,
): Promise<AppUser> {
  const user = await resolveUser(getDb(), googleClaims(email), lists);
  if (!user) throw new Error("test learner was rejected");
  return user;
}
