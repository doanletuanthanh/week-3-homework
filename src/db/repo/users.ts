import { count, eq, sql } from "drizzle-orm";
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

/** A page of a list the operator reads. */
export type PageWindow = { offset: number; limit: number };

export type LearnerRow = {
  id: string;
  email: string;
  firstSeen: Date;
  /** The newest of: sign-up, a session started, a turn written (replays included), a custom-topic request. */
  lastSeen: Date;
  sessions: number;
  customAttempts: number;
  /** Model calls of the account's sessions and custom-topic requests, retries included. */
  spendUsd: number;
};

/**
 * Accounts with their activity, most recently seen first. Admin drafts are not a learner's
 * activity and are left out. A deleted account has no row: its spend is in `daily_spend` only.
 */
export async function listLearnerRows(db: Executor, filter: { userId?: string } & PageWindow): Promise<LearnerRow[]> {
  const rows = await db.execute<Omit<LearnerRow, "firstSeen" | "lastSeen"> & { firstSeen: string; lastSeen: string }>(sql`
    WITH own_sessions AS (
      SELECT user_id, count(*)::int AS n, max(started_at) AS last FROM session GROUP BY user_id
    ), own_turns AS (
      SELECT s.user_id, max(t.created_at) AS last FROM turn t JOIN session s ON s.id = t.session_id GROUP BY s.user_id
    ), own_attempts AS (
      SELECT user_id, count(*)::int AS n, max(created_at) AS last FROM generation_attempt WHERE persona_id IS NULL GROUP BY user_id
    ), own_spend AS (
      -- One owner per call, so a custom attempt's call that also names its session counts once.
      SELECT COALESCE(s.user_id, a.user_id) AS user_id, sum(c.cost_usd) AS usd
      FROM llm_call c
      LEFT JOIN session s ON s.id = c.session_id
      LEFT JOIN generation_attempt a ON a.id = c.attempt_id AND a.persona_id IS NULL
      GROUP BY 1
    )
    SELECT u.id, u.email,
           u.created_at AS "firstSeen",
           GREATEST(u.created_at, own_sessions.last, own_turns.last, own_attempts.last) AS "lastSeen",
           COALESCE(own_sessions.n, 0) AS "sessions",
           COALESCE(own_attempts.n, 0) AS "customAttempts",
           COALESCE(own_spend.usd, 0)::float8 AS "spendUsd"
    FROM "user" u
    LEFT JOIN own_sessions ON own_sessions.user_id = u.id
    LEFT JOIN own_turns ON own_turns.user_id = u.id
    LEFT JOIN own_attempts ON own_attempts.user_id = u.id
    LEFT JOIN own_spend ON own_spend.user_id = u.id
    ${filter.userId ? sql`WHERE u.id = ${filter.userId}` : sql``}
    ORDER BY "lastSeen" DESC, u.id
    LIMIT ${filter.limit} OFFSET ${filter.offset}
  `);
  // A raw query returns timestamps as text.
  return rows.map((row) => ({ ...row, firstSeen: new Date(row.firstSeen), lastSeen: new Date(row.lastSeen) }));
}

export async function countUsers(db: Executor): Promise<number> {
  const [row] = await db.select({ total: count() }).from(users);
  return row.total;
}
