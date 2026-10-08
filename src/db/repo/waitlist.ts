import { and, eq } from "drizzle-orm";
import type { Executor } from "../client";
import { waitlist, type WaitlistContext } from "../schema";

/** FR-32: records the request once; asking again changes nothing. */
export async function joinWaitlist(db: Executor, userId: string, context: WaitlistContext): Promise<void> {
  await db.insert(waitlist).values({ userId, context }).onConflictDoNothing();
}

export async function isOnWaitlist(db: Executor, userId: string, context: WaitlistContext): Promise<boolean> {
  const [row] = await db.select({ userId: waitlist.userId }).from(waitlist).where(and(eq(waitlist.userId, userId), eq(waitlist.context, context)));
  return row !== undefined;
}
