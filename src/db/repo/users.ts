import { eq } from "drizzle-orm";
import type { Executor } from "../client";
import { users } from "../schema";

export type UserRow = typeof users.$inferSelect;

/** Creates the app row on first sign-in and keeps the email in step with the auth account. */
export async function upsertUser(db: Executor, input: { id: string; email: string }): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values(input)
    .onConflictDoUpdate({ target: users.id, set: { email: input.email } })
    .returning();
  return row;
}

export async function acknowledgeNotice(db: Executor, userId: string, version: number): Promise<void> {
  await db
    .update(users)
    .set({ visibilityAckVersion: version, visibilityAckAt: new Date() })
    .where(eq(users.id, userId));
}
