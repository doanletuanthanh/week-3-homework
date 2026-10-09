import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { createSession, findSessionForPersona, getPlayableScenario, type SessionRow } from "@/db/repo/sessions";
import type { AppUser } from "./auth";
import { canStartSession } from "./cost-cap";
import { recordEvent } from "./events";
import { listPlayedPersonas } from "@/db/repo/quota-tombstone";
import { quotaKeyOf } from "./quota";

/** Where the learner goes after asking for a session; the prep screen explains a refusal. */
export function sessionEntryPath(result: OpenSessionResult, personaId: string): string {
  if (result.ok) return `/sessions/${result.session.id}`;
  if (result.reason === "cap_reached") return `/prep/${encodeURIComponent(personaId)}?blocked=cap`;
  // The prep screen finds out for itself that the persona was played before, and says so.
  if (result.reason === "played_before") return `/prep/${encodeURIComponent(personaId)}`;
  return result.reason === "no_identity" ? sessionStartFailedPath(personaId) : "/";
}

/** Where the learner goes when creating the session failed: the prep screen, with the standard error. */
export function sessionStartFailedPath(personaId: string): string {
  return `/prep/${encodeURIComponent(personaId)}?blocked=error`;
}

export type OpenSessionResult =
  | { ok: true; session: SessionRow }
  /**
   * `cap_reached`: today's session budget is spent, so no new session starts (FR-37).
   * `played_before`: this Google account had its session with the persona, then deleted the account.
   * `no_identity`: the auth server holds no Google identity for the learner, so the one-session
   * rule cannot be checked against deleted accounts. No session starts without that check.
   */
  | { ok: false; reason: "not_found" | "cap_reached" | "played_before" | "no_identity" };

/**
 * Starts the learner's session with a persona, or returns the one they already have ("Tiếp tục").
 * Demo accounts always get a new session. An existing session is returned whatever the cost cap
 * says: the cap only blocks new sessions.
 *
 * Unpublished personas are playable by every learner (accepted plan deviation) until the
 * `require_published` config row is turned on.
 */
export async function openSession(db: Database, user: AppUser, personaId: string): Promise<OpenSessionResult> {
  if (!user.isDemo) {
    const existing = await findSessionForPersona(db, user.id, personaId);
    if (existing) return { ok: true, session: existing };
    const key = await quotaKeyOf(db, user.id);
    if (key === null) return { ok: false, reason: "no_identity" };
    if ((await listPlayedPersonas(db, key)).includes(personaId)) return { ok: false, reason: "played_before" };
  }

  const found = await getPlayableScenario(db, personaId, await getConfig(db, "require_published"), user.id);
  if (!found) return { ok: false, reason: "not_found" };
  if (!(await canStartSession(db, user.isDemo))) return { ok: false, reason: "cap_reached" };

  const { scenario } = found;
  const { session } = await createSession(db, { userId: user.id, scenario, isDemo: user.isDemo }, (tx, created) =>
    recordEvent(
      tx,
      { userId: user.id, sessionId: created.id, isDemo: user.isDemo },
      {
        name: "session_started",
        props: { persona_id: scenario.personaId, topic_id: scenario.topicId, kind: "curated", scenario_version: scenario.version },
      },
    ),
  );
  return { ok: true, session };
}
