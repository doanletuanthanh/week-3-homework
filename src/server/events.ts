import type { Executor } from "@/db/client";
import { events, type DeviceClass, type FailureCode, type Focus, type ModerationConstraint, type WaitlistContext } from "@/db/schema";
import type { ReplayLevel, ReplayResult } from "@/engine/replay-result";

/** FR-38 events the app writes. */
export type AppEvent =
  /** For a custom session, written when its scenario passed its checks: that is when it can be played. */
  | { name: "session_started"; props: { persona_id: string; topic_id: string; kind: "curated" | "custom"; scenario_version: number } }
  /** A topic passed moderation and its attempt started. The topic text is not in it. */
  | { name: "custom_topic_requested"; props: { focus: Focus; constraints: ModerationConstraint[] } }
  /** The attempt stopped running, however it ended. */
  | {
      name: "custom_topic_finished";
      props: { outcome: "passed" | "failed" | "system_error"; failure_code: FailureCode | null; cost_usd: number; duration_ms: number; runs: number };
    }
  /** "Kịch bản này có vấn đề" was pressed. */
  | { name: "custom_problem_reported"; props: Record<string, never> }
  | { name: "turn"; props: { turn_index: number; latency_ms: number } }
  /** Written by the freeze of the notes. `device_class` is null when no question was ever asked. */
  | { name: "session_ended"; props: { canvas_empty: boolean; device_class: DeviceClass | null } }
  /**
   * Written once the guess and the result both exist. `recognized` is the full NHẬN BIẾT, the
   * replay target included, and null when the notes could not be judged. `latency_ms` is how long
   * the learner waited for the result after sending the guess.
   */
  | {
      name: "reveal";
      props: {
        guess: number;
        told: number;
        recognized: number | null;
        total: number;
        revealed_count: number;
        replay_level: "primary" | "fallback1" | "none";
        latency_ms: number;
      };
    }
  | { name: "replay_started"; props: { level: ReplayLevel } }
  /** Written when a replay ends, however it ends. `turns` is how many replay questions were answered. */
  | { name: "replay_result"; props: { level: ReplayLevel; result: ReplayResult; turns: number } }
  /** "Tải về" was pressed on a finished session. One event per press. */
  | { name: "takeaway_downloaded"; props: Record<string, never> }
  /** Written when the learner joins a waitlist, not when they press again. */
  | { name: "waitlist_joined"; props: { context: WaitlistContext } }
  /** Written without a user: the account it reports no longer exists. `sessions` is how many it had. */
  | { name: "account_deleted"; props: { sessions: number } };

/**
 * Writes one event on the server, inside the caller's transaction when given one, so an event
 * exists exactly when the thing it reports was written. Demo sessions are left out of every
 * metric, so nothing is written for them.
 */
export async function recordEvent(
  db: Executor,
  subject: { userId: string | null; sessionId: string | null; isDemo: boolean },
  event: AppEvent,
): Promise<void> {
  if (subject.isDemo) return;
  await db.insert(events).values({ userId: subject.userId, sessionId: subject.sessionId, name: event.name, props: event.props });
}
