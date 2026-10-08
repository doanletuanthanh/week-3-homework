import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { moveSpendToLedger } from "@/db/repo/llm-calls";
import { addPlayedPersonas } from "@/db/repo/quota-tombstone";
import { deleteAuthAccount, deleteUserRow } from "@/db/repo/users";
import { sessions, users } from "@/db/schema";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";
import { quotaKeyOf } from "./quota";

/** `generating`: a scenario is being prepared for the learner; the account waits for it to finish. */
export type DeleteAccountResult = { ok: true } | { ok: false; error: "not_found" | "generating" };

/**
 * FR-66: removes the learner's account and everything stored about them, in one transaction, so
 * a failure removes nothing. What stays names nobody: the personas the account had played, under
 * a keyed hash of the Google account (so deleting and signing in again opens no second session);
 * the cost of its model calls, added to the day's ledger (so a daily cap reads the same total);
 * one event that an account was deleted; and the rows of the admin access log, without their ids.
 * Traces already sent to LangSmith are outside this and expire there.
 */
export async function deleteAccount(db: Database, user: Pick<AppUser, "id" | "isDemo">): Promise<DeleteAccountResult> {
  return db.transaction(async (tx): Promise<DeleteAccountResult> => {
    // Holds the account: a session cannot be created for it while it is being removed.
    const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    if (!account) return { ok: false, error: "not_found" };

    const own = await tx
      .select({ personaId: sessions.personaId, status: sessions.status, isDemo: sessions.isDemo })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    if (own.some((session) => session.status === "generating")) return { ok: false, error: "generating" };

    // The sessions the one-session rule counts: a demo or withdrawn session never did.
    const played = [...new Set(own.filter((session) => !session.isDemo && session.status !== "withdrawn").map((session) => session.personaId))];
    if (played.length > 0) {
      const key = await quotaKeyOf(tx, user.id);
      if (key === null) console.warn(JSON.stringify({ event: "account_deleted_without_quota_key" }));
      else await addPlayedPersonas(tx, key, played);
    }

    await moveSpendToLedger(tx, user.id);
    await recordEvent(tx, { userId: null, sessionId: null, isDemo: user.isDemo }, { name: "account_deleted", props: { sessions: own.length } });
    // Sessions go with the row, and with them turns, snapshots, branches and events; so do
    // pending actions and waitlist rows. Access-log rows stay, their ids set to null.
    await deleteUserRow(tx, user.id);
    await deleteAuthAccount(tx, user.id);
    return { ok: true };
  });
}
