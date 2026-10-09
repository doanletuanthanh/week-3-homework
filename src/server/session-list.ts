import type { Database } from "@/db/client";
import { sweepStaleAttempts } from "@/db/repo/custom-topics";
import { countSessions, listSessionRows, type SessionListRow } from "@/db/repo/sessions";
import type { SESSION_STATUSES } from "@/db/schema";
import { toBrowserResult, type BrowserRecognized } from "@/engine/seal";
import { capitalizeFirst } from "@/scenario/persona-card";
import type { AppUser } from "./auth";
import { dayOf } from "./session-view";

/** Sessions shown at first, and added by each "Tải thêm" (PRD Màn 9). */
export const SESSION_PAGE_SIZE = 20;

/** The label a session carries in "Buổi của tôi" (PRD §7). */
export type SessionListState = "preparing" | "failed_eval" | "in_progress" | "done" | "withdrawn";

const STATE_OF: Record<(typeof SESSION_STATUSES)[number], SessionListState> = {
  generating: "preparing",
  failed_eval: "failed_eval",
  interviewing: "in_progress",
  revealed: "in_progress",
  replaying: "in_progress",
  done: "done",
  withdrawn: "withdrawn",
};

/** What stands where a custom session has no persona or topic title to show. */
export const CUSTOM_TOPIC_LABEL = "Chủ đề tự tạo";

/** One row of "Buổi của tôi", as it is sent to the browser. */
export type SessionListItem = {
  id: string;
  /** For a custom session with no scenario (being prepared, or never passed): the topic the learner typed. */
  personaName: string;
  topicTitle: string;
  /** The day the session started, as "dd/mm". */
  date: string;
  state: SessionListState;
  /** The two numbers of the main interview. Null unless the session is `done` (FR-39). */
  result: { told: number; total: number; recognized: BrowserRecognized } | null;
};

/**
 * The only path from a stored session to a row of the list. It decides what a status may show:
 * the numbers exist for a `done` session and for no other, so a list never tells a learner how a
 * session they have not finished is going.
 */
export function toListItem(row: SessionListRow): SessionListItem {
  const { day, month } = dayOf(row.startedAt);
  return {
    id: row.id,
    personaName: row.displayName === null ? (row.customTopicText ?? CUSTOM_TOPIC_LABEL) : capitalizeFirst(row.displayName),
    topicTitle: row.displayName === null ? CUSTOM_TOPIC_LABEL : (row.topicTitle ?? CUSTOM_TOPIC_LABEL),
    date: `${day}/${month}`,
    state: STATE_OF[row.status],
    result: toBrowserResult(row.status, row.revealJson),
  };
}

export type SessionListPage = {
  items: SessionListItem[];
  /** Where the next page starts; null when this page holds the last session. */
  nextOffset: number | null;
  total: number;
};

/**
 * The learner's own sessions, newest first, one page at a time. A custom session whose runner
 * died is closed first, so the list never shows "Đang chuẩn bị" for something nobody is preparing.
 */
export async function listSessions(db: Database, user: Pick<AppUser, "id">, offset: number = 0): Promise<SessionListPage> {
  await sweepStaleAttempts(db, user.id);
  const [rows, total] = await Promise.all([
    listSessionRows(db, user.id, { offset, limit: SESSION_PAGE_SIZE }),
    countSessions(db, user.id),
  ]);
  const end = offset + rows.length;
  return { items: rows.map(toListItem), nextOffset: end < total ? end : null, total };
}
