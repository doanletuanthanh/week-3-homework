import { MAX_QUESTION_CHARS, MAX_TURNS } from "@/config/limits";
import type { Database } from "@/db/client";
import { appendTurn, getSession, listTurns } from "@/db/repo/sessions";
import { callModel, LlmCallError, type CallModelDeps } from "@/llm/call-model";
import { buildSkeletonPersonaMessages } from "@/llm/prompts/skeleton-persona";
import type { AppUser } from "./auth";

export type TurnError = "invalid_text" | "not_found" | "conflict" | "turn_limit" | "llm_failed";

export type TurnResult =
  | { ok: true; personaText: string; turnIndex: number }
  | { ok: false; error: TurnError };

/**
 * Walking-skeleton turn: one persona call, then the turn is written whole or not at all. A
 * failed model call writes no turn; its cost is still recorded by `callModel`.
 */
export async function runSkeletonTurn(
  db: Database,
  user: AppUser,
  sessionId: string,
  rawText: unknown,
  llmDeps?: Partial<CallModelDeps>,
): Promise<TurnResult> {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text.length === 0 || text.length > MAX_QUESTION_CHARS) return { ok: false, error: "invalid_text" };

  const found = await getSession(db, user.id, sessionId);
  if (!found) return { ok: false, error: "not_found" };

  const transcript = await listTurns(db, user.id, sessionId);
  // Turn 0 is the opening line, so the first learner turn is index 1.
  const turnIndex = transcript.length;
  if (turnIndex > MAX_TURNS) return { ok: false, error: "turn_limit" };

  let reply;
  try {
    reply = await callModel(
      "PERSONA",
      buildSkeletonPersonaMessages(found.scenario.content, transcript, text),
      { meta: { session_id: sessionId, turn_index: turnIndex }, scope: { scope: "session", sessionId } },
      llmDeps,
    );
  } catch (error) {
    if (error instanceof LlmCallError) return { ok: false, error: "llm_failed" };
    throw error;
  }

  const written = await appendTurn(db, {
    userId: user.id,
    sessionId,
    index: turnIndex,
    learnerText: text,
    personaText: reply.output,
    latencyMs: reply.latencyMs,
  });
  if (!written) return { ok: false, error: "conflict" };

  return { ok: true, personaText: reply.output, turnIndex };
}
