import { cookies } from "next/headers";
import { PENDING_ACTION_TTL_MS } from "@/config/limits";
import { getDb } from "@/db/client";
import { consumePendingAction, createPendingAction } from "@/db/repo/pending-actions";
import type { PendingActionPayload } from "@/db/schema";
import type { AppUser } from "./auth";
import { openSession, sessionEntryPath } from "./sessions";
import { isUuid } from "./uuid";

const COOKIE = "il_pending";

/**
 * Remembers a write the learner asked for before sign-in or consent. Only the single-use token
 * leaves the server, in an httpOnly cookie; no URL carries the action.
 */
export async function storePendingAction(user: AppUser | null, payload: PendingActionPayload): Promise<void> {
  const token = await createPendingAction(getDb(), { userId: user?.id ?? null, payload });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_ACTION_TTL_MS / 1000,
  });
}

/**
 * Performs the learner's pending action, at most once, and returns where to go next; null when
 * there is nothing to resume. Call only from a POST (server action).
 */
export async function resumePendingAction(user: AppUser): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  cookieStore.delete(COOKIE);

  if (!isUuid(token)) return null;
  const db = getDb();
  const payload = await consumePendingAction(db, { token, userId: user.id });
  if (!payload) return null;

  switch (payload.kind) {
    case "start_session": {
      const result = await openSession(db, user, payload.personaId);
      return result.ok || result.reason !== "not_found" ? sessionEntryPath(result, payload.personaId) : null;
    }
  }
}
