import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { countSessionsForPersona, createSession, findLatestSessionForPersona, findOpenSessionForPersona, getPlayableScenario, type SessionRow } from "@/db/repo/sessions";
import type { AppUser } from "./auth";
import { canStartSession } from "./cost-cap";
import { recordEvent } from "./events";

/** Where the learner goes after asking for a session; the prep screen explains a refusal. */
export function sessionEntryPath(result: OpenSessionResult, personaId: string): string {
  if (result.ok) return `/sessions/${result.session.id}`;
  return result.reason === "cap_reached" ? `/prep/${encodeURIComponent(personaId)}?blocked=cap` : "/";
}

/** Where the learner goes when creating the session failed: the prep screen, with the standard error. */
export function sessionStartFailedPath(personaId: string): string {
  return `/prep/${encodeURIComponent(personaId)}?blocked=error`;
}

export type OpenSessionResult =
  | { ok: true; session: SessionRow }
  /** `cap_reached`: today's session budget is spent, so no new session starts (FR-37). */
  | { ok: false; reason: "not_found" | "cap_reached" };

/**
 * Opens the learner's unfinished session with a persona ("Tiếp tục"), or starts a new one from the
 * opening line: the first, or another once the last one is finished ("Luyện lại từ đầu"). Demo
 * accounts always get a new session. An unfinished session is returned whatever the cost cap says:
 * the cap only blocks new sessions, and it is the only bound on playing a persona again.
 *
 * Unpublished personas are playable by every learner (accepted plan deviation) until the
 * `require_published` config row is turned on.
 */
export async function openSession(db: Database, user: AppUser, personaId: string): Promise<OpenSessionResult> {
  if (!user.isDemo) {
    const open = await findOpenSessionForPersona(db, user.id, personaId);
    if (open) return { ok: true, session: open };
  }

  const found = await getPlayableScenario(db, personaId, await getConfig(db, "require_published"), user.id);
  if (!found) return { ok: false, reason: "not_found" };
  if (!(await canStartSession(db, user.isDemo))) return { ok: false, reason: "cap_reached" };

  const { scenario } = found;
  const custom = scenario.origin === "generated";
  // The focus of a custom topic orders its takeaway: playing it again keeps what the learner asked to practise.
  const focus = custom ? ((await findLatestSessionForPersona(db, user.id, personaId))?.focus ?? null) : null;
  const { session } = await createSession(db, { userId: user.id, scenario, isDemo: user.isDemo, focus }, async (tx, created) =>
    recordEvent(
      tx,
      { userId: user.id, sessionId: created.id, isDemo: user.isDemo },
      {
        name: "session_started",
        props: {
          persona_id: scenario.personaId,
          topic_id: scenario.topicId,
          kind: custom ? "custom" : "curated",
          scenario_version: scenario.version,
          // Counted inside the transaction, so this session is one of them.
          attempt: await countSessionsForPersona(tx, user.id, scenario.personaId),
        },
      },
    ),
  );
  return { ok: true, session };
}
