import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { PENDING_ACTION_TTL_MS } from "@/config/limits";
import type { Executor } from "../client";
import { pendingActions, type PendingActionPayload } from "../schema";

/** Stores the action and returns its single-use token. Expired actions are removed on the way, so the table stays small. */
export async function createPendingAction(
  db: Executor,
  input: { userId: string | null; payload: PendingActionPayload },
): Promise<string> {
  await db.delete(pendingActions).where(lt(pendingActions.expiresAt, new Date()));
  const [row] = await db
    .insert(pendingActions)
    .values({ ...input, expiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS) })
    .returning({ id: pendingActions.id });
  return row.id;
}

/**
 * Deletes the action and returns its payload, or null when the token is unknown, expired,
 * already used, or was created by a different signed-in learner. The delete is the claim,
 * so two concurrent requests cannot both receive the payload.
 */
export async function consumePendingAction(
  db: Executor,
  input: { token: string; userId: string },
): Promise<PendingActionPayload | null> {
  const [row] = await db
    .delete(pendingActions)
    .where(
      and(
        eq(pendingActions.id, input.token),
        gt(pendingActions.expiresAt, new Date()),
        or(isNull(pendingActions.userId), eq(pendingActions.userId, input.userId)),
      ),
    )
    .returning({ payload: pendingActions.payload });
  return row?.payload ?? null;
}
