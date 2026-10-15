import type { Executor } from "@/db/client";
import { countAttemptRows, getLearnerAttempt, listAttemptRows, type AttemptListRow, type AttemptRow } from "@/db/repo/custom-topics";
import { countSessions, listLearnerSessions, type LearnerSessionRow } from "@/db/repo/sessions";
import { loadSessionTrace, logAdminAccess } from "@/db/repo/turns";
import { countUsers, listLearnerRows, type LearnerRow } from "@/db/repo/users";
import { ATTEMPT_OUTCOMES } from "@/db/schema";
import { assertAdmin, type AppUser } from "../auth";
import { isUuid } from "../uuid";
import { pageOf, pageWindow, type AdminPage } from "../admin-paging";
import { describeTrace, type TraceTurn } from "../session-trace";

/**
 * The admin's view of learner data: accounts, their sessions, a session's transcript, and the
 * custom-topic requests. Every read here is of learner data, so each one writes an
 * `admin_access_log` row (channel `console`) before it returns anything. Anyone but an admin gets 404.
 */

const log = (db: Executor, user: AppUser, entry: { action: string; userId?: string; sessionId?: string }) =>
  logAdminAccess(db, { adminEmail: user.email, channel: "console", ...entry });

/** Every account, most recently seen first. */
export async function listLearners(db: Executor, user: AppUser | null, page: number): Promise<AdminPage<LearnerRow>> {
  assertAdmin(user);
  await log(db, user, { action: "list_learners" });
  const [rows, total] = await Promise.all([listLearnerRows(db, pageWindow(page)), countUsers(db)]);
  return pageOf(rows, page, total);
}

export type LearnerDetail = { learner: LearnerRow; sessions: AdminPage<LearnerSessionRow> };

/** One account with a page of its sessions; null for an id that names no account. */
export async function getLearner(db: Executor, user: AppUser | null, userId: string, page: number): Promise<LearnerDetail | null> {
  assertAdmin(user);
  if (!isUuid(userId)) return null;
  const [learner] = await listLearnerRows(db, { userId, offset: 0, limit: 1 });
  if (!learner) return null;
  await log(db, user, { action: "read_learner", userId });
  const [rows, total] = await Promise.all([listLearnerSessions(db, userId, pageWindow(page)), countSessions(db, userId)]);
  return { learner, sessions: pageOf(rows, page, total) };
}

export type Transcript = { sessionId: string; userId: string; title: string; turns: TraceTurn[] };

/** A session turn by turn, as `pnpm il trace` prints it; null for an unknown session or one with no scenario yet. */
export async function getTranscript(db: Executor, user: AppUser | null, sessionId: string): Promise<Transcript | null> {
  assertAdmin(user);
  if (!isUuid(sessionId)) return null;
  const trace = await loadSessionTrace(db, sessionId);
  if (!trace) return null;
  // Logged before anything is shown, as the CLI does.
  await log(db, user, { action: "read_transcript", sessionId, userId: trace.session.userId });
  return { sessionId, userId: trace.session.userId, ...describeTrace(trace) };
}

/** The outcome a list is filtered by, from a URL; anything else lists every outcome. */
export const outcomeFilter = (raw: string | undefined): AttemptRow["outcome"] | undefined =>
  ATTEMPT_OUTCOMES.find((outcome) => outcome === raw);

/** Learner custom-topic requests, newest first, without their topic text. */
export async function listCustomAttempts(
  db: Executor,
  user: AppUser | null,
  filter: { outcome?: AttemptRow["outcome"]; page: number },
): Promise<AdminPage<AttemptListRow>> {
  assertAdmin(user);
  await log(db, user, { action: filter.outcome ? `list_custom_topics ${filter.outcome}` : "list_custom_topics" });
  const [rows, total] = await Promise.all([
    listAttemptRows(db, { outcome: filter.outcome, ...pageWindow(filter.page) }),
    countAttemptRows(db, filter.outcome),
  ]);
  return pageOf(rows, filter.page, total);
}

/** One request with the topic the learner typed; null for an unknown id or an admin draft. */
export async function getCustomAttempt(db: Executor, user: AppUser | null, attemptId: string) {
  assertAdmin(user);
  if (!isUuid(attemptId)) return null;
  const found = await getLearnerAttempt(db, attemptId);
  if (!found) return null;
  await log(db, user, { action: "read_custom_topic", userId: found.attempt.userId, sessionId: found.attempt.sessionId ?? undefined });
  return found;
}
