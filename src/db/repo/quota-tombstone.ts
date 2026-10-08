import { eq, sql } from "drizzle-orm";
import type { Executor } from "../client";
import { quotaTombstones } from "../schema";

/**
 * The Google account behind an auth user, as the auth server recorded it at sign-in. Read from
 * `auth.identities`, which a user cannot edit; the copy in the token's metadata can be changed.
 */
export async function findGoogleSubject(db: Executor, userId: string): Promise<string | null> {
  const [row] = await db.execute<{ provider_id: string }>(
    sql`SELECT provider_id FROM auth.identities WHERE user_id = ${userId} AND provider = 'google' LIMIT 1`,
  );
  return row?.provider_id ?? null;
}

/** Personas a deleted account behind this key had already played. */
export async function listPlayedPersonas(db: Executor, key: string): Promise<string[]> {
  const [row] = await db.select({ played: quotaTombstones.playedPersonaIds }).from(quotaTombstones).where(eq(quotaTombstones.key, key));
  return row?.played ?? [];
}

/** Adds to what is kept for the key. Call inside the transaction that deletes the account. */
export async function addPlayedPersonas(db: Executor, key: string, personaIds: string[]): Promise<void> {
  const played = [...new Set([...(await listPlayedPersonas(db, key)), ...personaIds])].sort();
  await db
    .insert(quotaTombstones)
    .values({ key, playedPersonaIds: played })
    .onConflictDoUpdate({ target: quotaTombstones.key, set: { playedPersonaIds: played, updatedAt: sql`now()` } });
}
