import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { AppUser } from "@/server/auth";
import { resolveUser } from "@/server/auth";
import { openSession } from "@/server/sessions";
import { importScenarioFile } from "../../cli/commands/import-scenario";

export const PERSONA_ID = "chi-thu";
export const PERSONA_FILE = "scenarios/ux-chi-tieu/chi-thu.json";

/** Empties every app table and imports the one persona from its file, so each test starts from the same state. */
export async function resetDatabase(): Promise<void> {
  const db = getDb();
  await db.execute(
    sql`TRUNCATE "turn", "snapshot", "branch", "event", "session", "pending_action", "llm_call", "daily_spend", "config", "admin_access_log", "string_approval", "waitlist", "scenario", "topic", "user" CASCADE`,
  );
  const imported = await importScenarioFile(db, PERSONA_FILE);
  if (!imported.ok) throw new Error(`${PERSONA_FILE} does not pass validate`);
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

/** A session started through the real path; fails the test when it was refused. */
export async function startSession(learner: AppUser, personaId: string = PERSONA_ID) {
  const result = await openSession(getDb(), learner, personaId);
  if (!result.ok) throw new Error(`session was refused: ${result.reason}`);
  return result.session;
}
