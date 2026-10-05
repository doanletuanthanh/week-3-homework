import type { Database } from "@/db/client";
import { createSession, findSessionForPersona, getScenarioByPersona, type SessionRow } from "@/db/repo/sessions";
import type { AppUser } from "./auth";

/**
 * Starts the learner's session with a persona, or returns the one they already have. Demo
 * accounts always get a new session. Returns null when the persona does not exist.
 *
 * Unpublished personas are playable by every learner (accepted plan deviation), so there is no
 * publish check here.
 */
export async function openSession(db: Database, user: AppUser, personaId: string): Promise<SessionRow | null> {
  const found = await getScenarioByPersona(db, personaId);
  if (!found) return null;

  if (!user.isDemo) {
    const existing = await findSessionForPersona(db, user.id, personaId);
    if (existing) return existing;
  }
  return createSession(db, { userId: user.id, scenario: found.scenario, isDemo: user.isDemo });
}
