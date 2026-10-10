import { eq, sql } from "drizzle-orm";
import type { Executor } from "../client";
import { users, type RoleFilter } from "../schema";

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

/**
 * As `upsertUser`, but only while the sign-in account exists; null when it does not. The check
 * and the write are one statement, so a token that outlived its account can neither create a row
 * nor be served from one, whatever else is running at the same moment.
 */
export async function upsertUserOfAccount(db: Executor, input: { id: string; email: string }): Promise<UserRow | null> {
  const written = await db.execute<{ id: string }>(sql`
    INSERT INTO "user" (id, email)
    SELECT ${input.id}::uuid, ${input.email}
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = ${input.id}::uuid)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id
  `);
  if (written.length === 0) return null;
  const [row] = await db.select().from(users).where(eq(users.id, input.id));
  return row ?? null;
}

export async function acknowledgeNotice(db: Executor, userId: string, version: number): Promise<void> {
  await db
    .update(users)
    .set({ visibilityAckVersion: version, visibilityAckAt: new Date() })
    .where(eq(users.id, userId));
}

/** Remembers the library filter on the account; null clears it. */
export async function setRoleFilter(db: Executor, userId: string, role: RoleFilter | null): Promise<void> {
  await db.update(users).set({ roleFilter: role }).where(eq(users.id, userId));
}

export async function findUserByEmail(db: Executor, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return row ?? null;
}

/** Removes the app row; sessions, pending actions, events and waitlist rows go with it. */
export async function deleteUserRow(db: Executor, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/** Removes the sign-in account itself, with its identities and login sessions. */
export async function deleteAuthAccount(db: Executor, userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM auth.users WHERE id = ${userId}`);
}
