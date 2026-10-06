import type { Executor } from "@/db/client";
import { events } from "@/db/schema";

/** FR-38 events this slice writes so far. Later phases add theirs. */
export type AppEvent =
  | { name: "session_started"; props: { persona_id: string; topic_id: string; kind: "curated"; scenario_version: number } }
  | { name: "turn"; props: { turn_index: number; latency_ms: number } };

/**
 * Writes one event on the server, inside the caller's transaction when given one, so an event
 * exists exactly when the thing it reports was written. Demo sessions are left out of every
 * metric, so nothing is written for them.
 */
export async function recordEvent(
  db: Executor,
  subject: { userId: string; sessionId: string; isDemo: boolean },
  event: AppEvent,
): Promise<void> {
  if (subject.isDemo) return;
  await db.insert(events).values({ userId: subject.userId, sessionId: subject.sessionId, name: event.name, props: event.props });
}
