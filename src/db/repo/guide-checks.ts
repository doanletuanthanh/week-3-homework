import { and, count, eq, gte, sql } from "drizzle-orm";
import { DAY_ZONE } from "@/config/limits";
import type { Executor } from "../client";
import { events, users } from "../schema";

/**
 * A guide check is counted by its `guide_checked` event, which is written before the model is
 * called, so the day's limit holds whatever runs at the same moment. A check that failed still
 * counts: its calls were paid for. The event holds counts only.
 */

type GuideCheckedProps = { idea: boolean; refused: boolean; failed: boolean; questions: number; flagged: number };

const TODAY_START = sql<Date>`(date_trunc('day', now() AT TIME ZONE ${DAY_ZONE}) AT TIME ZONE ${DAY_ZONE})`;

export async function countGuideChecksToday(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.name, "guide_checked"), gte(events.at, TODAY_START)));
  return row.total;
}

/**
 * Takes one of today's checks for the learner, under their row lock so two requests cannot both
 * take the last one. Null when none is left.
 */
export async function reserveGuideCheck(tx: Executor, userId: string, perDay: number, props: GuideCheckedProps): Promise<string | null> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  if ((await countGuideChecksToday(tx, userId)) >= perDay) return null;
  const [row] = await tx.insert(events).values({ userId, sessionId: null, name: "guide_checked", props }).returning({ id: events.id });
  return row.id;
}

export async function fillGuideCheck(db: Executor, eventId: string, props: GuideCheckedProps): Promise<void> {
  await db.update(events).set({ props }).where(eq(events.id, eventId));
}
