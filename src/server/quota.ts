import { createHmac } from "node:crypto";
import type { Executor } from "@/db/client";
import { findGoogleSubject, listPlayedPersonas } from "@/db/repo/quota-tombstone";

/**
 * The key of what is kept after an account is deleted: a keyed hash of the Google account, so the
 * kept row names nobody and cannot be matched to an address without the server's secret. Null
 * when the auth server holds no Google identity for the user.
 */
export async function quotaKeyOf(db: Executor, userId: string): Promise<string | null> {
  const subject = await findGoogleSubject(db, userId);
  if (subject === null) return null;
  const secret = process.env.QUOTA_HASH_SECRET;
  if (!secret) throw new Error("QUOTA_HASH_SECRET is not set");
  return createHmac("sha256", secret).update(`google:${subject}`).digest("hex");
}

/**
 * True when this Google account already had its one session with the persona under an account it
 * has since deleted. Deleting and signing in again does not give a second session (FR-5).
 */
export async function playedBeforeDeletion(db: Executor, userId: string, personaId: string): Promise<boolean> {
  const key = await quotaKeyOf(db, userId);
  return key !== null && (await listPlayedPersonas(db, key)).includes(personaId);
}
