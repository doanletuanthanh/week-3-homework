import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { AppUser } from "@/server/auth";
import { resolveUser } from "@/server/auth";
import { openSession } from "@/server/sessions";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { LOCAL_DATABASE_URL } from "./local-stack";

export const PERSONA_ID = "chi-thu";
export const PERSONA_FILE = "scenarios/ux-chi-tieu/chi-thu.json";

/**
 * Empties every app table and the sign-in accounts, and imports the one persona from its file, so
 * each test starts from the same state. Refuses any database but the local stack.
 */
export async function resetDatabase(): Promise<void> {
  if (process.env.DATABASE_URL !== LOCAL_DATABASE_URL) throw new Error("resetDatabase only runs against the local Supabase stack");
  const db = getDb();
  await db.execute(sql`DELETE FROM auth.users`);
  await db.execute(
    sql`TRUNCATE "turn", "snapshot", "branch", "event", "session", "pending_action", "llm_call", "daily_spend", "config", "admin_access_log", "string_approval", "waitlist", "quota_tombstone", "scenario", "topic", "user" CASCADE`,
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

/**
 * A learner as after a real Google sign-in: the app row, created through the real sign-in path,
 * and the sign-in account with its Google identity. `googleSubject: null` leaves the account out,
 * for the tests about a learner the auth server knows nothing of.
 */
export async function createLearner(
  email: string,
  lists: { ADMIN_EMAILS: string[]; DEMO_ACCOUNT_EMAILS: string[] } = NO_LISTS,
  options: { googleSubject?: string | null } = {},
): Promise<AppUser> {
  const user = await resolveUser(getDb(), googleClaims(email), lists);
  if (!user) throw new Error("test learner was rejected");
  if (options.googleSubject !== null) await giveGoogleAccount(user, options.googleSubject ?? `google-${user.id}`);
  return user;
}

/** A session started through the real path; fails the test when it was refused. */
export async function startSession(learner: AppUser, personaId: string = PERSONA_ID) {
  const result = await openSession(getDb(), learner, personaId);
  if (!result.ok) throw new Error(`session was refused: ${result.reason}`);
  return result.session;
}

/**
 * Gives a learner the sign-in account a Google sign-in leaves on the auth server: the account
 * row, and the identity that names the Google account behind it. Calling it again changes which
 * Google account that is.
 */
export async function giveGoogleAccount(user: Pick<AppUser, "id" | "email">, googleSubject: string): Promise<void> {
  const db = getDb();
  // No address on the account row: the auth server allows one account per address, and tests reuse addresses.
  await db.execute(sql`INSERT INTO auth.users (id, aud, role) VALUES (${user.id}, 'authenticated', 'authenticated') ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`DELETE FROM auth.identities WHERE user_id = ${user.id} AND provider = 'google'`);
  await db.execute(sql`
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (${googleSubject}, ${user.id}, ${JSON.stringify({ sub: googleSubject, email: user.email })}::jsonb, 'google', now(), now(), now())
  `);
}

/** A learner whose Google account is this one. */
export const createGoogleLearner = (
  email: string,
  googleSubject: string,
  lists: { ADMIN_EMAILS: string[]; DEMO_ACCOUNT_EMAILS: string[] } = NO_LISTS,
): Promise<AppUser> => createLearner(email, lists, { googleSubject });

export const authAccountRows = (userId: string) => getDb().execute<{ id: string }>(sql`SELECT id FROM auth.users WHERE id = ${userId}`);
export const identityRows = (userId: string) => getDb().execute<{ id: string }>(sql`SELECT id FROM auth.identities WHERE user_id = ${userId}`);
