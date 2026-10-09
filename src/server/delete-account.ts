import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accountCommittedToday, countAttemptsToday, deleteCustomContent, sweepStaleAttempts } from "@/db/repo/custom-topics";
import { moveSpendToLedger } from "@/db/repo/llm-calls";
import { addCustomUsage, addPlayedPersonas } from "@/db/repo/quota-tombstone";
import { deleteAuthAccount, deleteUserRow } from "@/db/repo/users";
import { sessions, users } from "@/db/schema";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";
import { quotaKeyOf } from "./quota";

/** `generating`: a scenario is being prepared for the learner; the account waits for it to finish. */
export type DeleteAccountResult = { ok: true } | { ok: false; error: "not_found" | "generating" };

/**
 * FR-66: removes the learner's account and everything stored about them, in one transaction, so
 * a failure removes nothing. What stays names nobody: the personas the account had played and
 * what it used of the custom-topic limits, under a keyed hash of the Google account (so deleting
 * and signing in again opens no second session and resets no limit);
 * the cost of its model calls, added to the day's ledger (so a daily cap reads the same total);
 * one event that an account was deleted; and the rows of the admin access log, without their ids.
 * Traces already sent to LangSmith are outside this and expire there.
 */
export async function deleteAccount(db: Database, user: Pick<AppUser, "id" | "isDemo">): Promise<DeleteAccountResult> {
  return db.transaction(async (tx): Promise<DeleteAccountResult> => {
    // Holds the account: a session cannot be created for it while it is being removed.
    const [account] = await tx
      .select({ id: users.id, freeCustomUsed: users.freeCustomUsed, customFailedCount: users.customFailedCount })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!account) return { ok: false, error: "not_found" };
    // An attempt whose runner is gone must not hold the account: it is closed before the check
    // below, even when it had runs left. The learner is leaving; nobody will come back for it.
    await sweepStaleAttempts(tx, user.id, { abandon: true });

    const own = await tx
      .select({ personaId: sessions.personaId, status: sessions.status, isDemo: sessions.isDemo })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    if (own.some((session) => session.status === "generating")) return { ok: false, error: "generating" };

    // The sessions the one-session rule counts: a demo or withdrawn session never did.
    // A custom persona is deleted with the account, so there is nothing to play twice: only authored ones are kept.
    const played = [
      ...new Set(
        own
          .filter((session) => !session.isDemo && session.status !== "withdrawn")
          .flatMap((session) => (session.personaId === null || session.personaId.startsWith("custom-") ? [] : [session.personaId])),
      ),
    ];
    const today = await countAttemptsToday(tx, user.id);
    const usage = {
      freeCustomUsed: account.freeCustomUsed,
      failedCount: account.customFailedCount,
      attemptsToday: today.attempts,
      refusalsToday: today.refusals,
      spendTodayUsd: await accountCommittedToday(tx, user.id),
    };
    // Spend alone counts too: attempts that ended as system errors are no attempts, but they used the account's share.
    const usedCustom = usage.freeCustomUsed || usage.failedCount > 0 || usage.attemptsToday > 0 || usage.refusalsToday > 0 || usage.spendTodayUsd > 0;
    if (played.length > 0 || usedCustom) {
      const key = await quotaKeyOf(tx, user.id);
      if (key === null) console.warn(JSON.stringify({ event: "account_deleted_without_quota_key" }));
      else {
        if (played.length > 0) await addPlayedPersonas(tx, key, played);
        if (usedCustom) await addCustomUsage(tx, key, usage);
      }
    }

    await moveSpendToLedger(tx, user.id);
    await recordEvent(tx, { userId: null, sessionId: null, isDemo: user.isDemo }, { name: "account_deleted", props: { sessions: own.length } });
    // Sessions go first, and with them turns, snapshots, branches and events: a custom scenario
    // cannot be removed while a session plays it. Then the learner's custom topics with their
    // scenarios. Generation attempts, pending actions and waitlist rows go with the row.
    // Access-log rows stay, their ids set to null.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await deleteCustomContent(tx, user.id);
    await deleteUserRow(tx, user.id);
    await deleteAuthAccount(tx, user.id);
    return { ok: true };
  });
}
