import { createHmac } from "node:crypto";
import { QUOTA_HASH_SECRET_MIN_LENGTH } from "@/config/limits";
import type { Executor } from "@/db/client";
import { findGoogleSubject } from "@/db/repo/quota-tombstone";

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
  if (secret.length < QUOTA_HASH_SECRET_MIN_LENGTH) throw new Error(`QUOTA_HASH_SECRET must be at least ${QUOTA_HASH_SECRET_MIN_LENGTH} characters`);
  return createHmac("sha256", secret).update(`google:${subject}`).digest("hex");
}
