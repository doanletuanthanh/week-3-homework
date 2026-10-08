import { and, eq } from "drizzle-orm";
import type { Executor } from "../client";
import { waitlist, type WaitlistContext } from "../schema";

/** FR-32: records the request once; asking again changes nothing. True when this call added the row. */
export async function joinWaitlist(db: Executor, userId: string, context: WaitlistContext): Promise<boolean> {
  const added = await db.insert(waitlist).values({ userId, context }).onConflictDoNothing().returning({ userId: waitlist.userId });
  return added.length > 0;
}

export async function isOnWaitlist(db: Executor, userId: string, context: WaitlistContext): Promise<boolean> {
  const [row] = await db.select({ userId: waitlist.userId }).from(waitlist).where(and(eq(waitlist.userId, userId), eq(waitlist.context, context)));
  return row !== undefined;
}
