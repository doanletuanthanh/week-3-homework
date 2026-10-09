import { z } from "zod";
import { MAX_QUESTION_CHARS, MAX_TURNS, TURN_TIME_BUDGET_MS } from "@/config/limits";
import type { Database } from "@/db/client";
import type { DeviceClass } from "@/db/schema";
import { claimTurn, findTurnByKey, releaseClaim, type ClaimRefusal } from "@/db/repo/turns";
import { runTurnGraph, type TurnGraphResult } from "@/graphs/turn-graph";
import { canStartSession } from "./cost-cap";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import type { AppUser } from "./auth";
import { postgresTurnStore } from "./turn-store";

/** Body of the turn API. Limits are enforced here, whatever the browser allowed. */
export const turnInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  /** One id per question, reused when the browser sends the same question again. */
  turnKey: z.uuid(),
  /** The turn the browser believes comes next; a stale tab is refused before any model call. */
  expectedIndex: z.number().int().min(1).max(MAX_TURNS),
});

export type TurnError =
  | "invalid_input"
  | "not_found"
  | "session_ended"
  | "turn_limit"
  | "in_flight"
  | "conflict"
  | "cap_reached"
  | "llm_failed";

/** The only things a turn reports: the persona text and the turn count, or an error state. */
export type TurnResult = { ok: true; personaText: string; turnIndex: number } | { ok: false; error: TurnError };

export type RunTurnOptions = {
  /** Receives the persona reply while it is generated. Not called for a stored reply. */
  onPersonaDelta?: (text: string) => void;
  /** The screen the question was asked on, as the browser reported it. Kept from the first turn that has it. */
  deviceClass?: DeviceClass;
  llmDeps?: Partial<CallModelDeps>;
  /** How long both model calls may take together. Tests shorten it. */
  timeBudgetMs?: number;
};

const REFUSAL: Record<ClaimRefusal, TurnError> = {
  not_found: "not_found",
  session_ended: "session_ended",
  turn_limit: "turn_limit",
  in_flight: "in_flight",
  wrong_index: "conflict",
};

/**
 * One learner question through the turn engine: Call 1, the unlock decision in code, Call 2,
 * then one transaction. A turn is written whole or not at all, and a failed model call writes no
 * turn (its cost is still in `llm_call`). At most one turn per session runs at a time: the claim
 * is taken before the first model call. Sending the same `turnKey` again returns the stored reply.
 */
export async function runTurn(
  db: Database,
  user: AppUser,
  sessionId: string,
  rawInput: unknown,
  options: RunTurnOptions = {},
): Promise<TurnResult> {
  const input = turnInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { text, turnKey, expectedIndex } = input.data;

  const stored = () => findTurnByKey(db, user.id, sessionId, turnKey);
  const already = await stored();
  if (already) return { ok: true, personaText: already.personaText, turnIndex: already.index };

  const claimed = await claimTurn(db, { userId: user.id, sessionId, expectedIndex, deviceClass: options.deviceClass });
  if (!claimed.ok) {
    // The first send may have been committed between the lookup above and the claim.
    const justStored = claimed.reason === "not_found" ? null : await stored();
    if (justStored) return { ok: true, personaText: justStored.personaText, turnIndex: justStored.index };
    return { ok: false, error: REFUSAL[claimed.reason] };
  }
  const { claim } = claimed;
  const { turnIndex } = claim;
  // FR-37: a custom session exists before anyone could check the day's cap for it, so the cap
  // stops it at its first question. The session stays as it is and can go on another day.
  if (turnIndex === 1 && claim.scenario.origin === "generated" && !(await canStartSession(db, claim.isDemo))) {
    await releaseClaim(db, sessionId, claim.token);
    return { ok: false, error: "cap_reached" };
  }
  const store = postgresTurnStore(db, { sessionId, userId: user.id, claim });

  const startedAt = Date.now();
  let result: TurnGraphResult;
  try {
    const basis = await store.loadState();
    result = await runTurnGraph(
      { ...basis, question: text },
      {
        scope: { scope: "session", sessionId, turnIndex },
        meta: { session_id: sessionId, turn_index: turnIndex },
        onPersonaDelta: options.onPersonaDelta,
        signal: AbortSignal.timeout(options.timeBudgetMs ?? TURN_TIME_BUDGET_MS),
        llmDeps: options.llmDeps,
      },
    );
  } catch (error) {
    await releaseClaim(db, sessionId, claim.token);
    if (!(error instanceof LlmCallError)) throw error;
    const cause = error.cause instanceof Error ? error.cause.message : String(error.cause);
    console.warn(JSON.stringify({ event: "turn_llm_failed", sessionId, turnIndex, role: error.role, attempts: error.attempts, cause }));
    return { ok: false, error: "llm_failed" };
  }

  const { analysis, plan, personaText } = result;
  const outcome = await store
    .commitTurn({ turnKey, question: text, personaText, analysis, plan, latencyMs: Date.now() - startedAt })
    .catch(async (error: unknown) => {
      await releaseClaim(db, sessionId, claim.token);
      throw error;
    });
  if (outcome === "session_ended") return { ok: false, error: "session_ended" };
  if (outcome === "claim_lost") return { ok: false, error: "conflict" };

  if (plan.verdict.violations.length > 0) {
    // FR-16: the flagged persona turn is the previous one; reveal leaves it out of the evidence.
    console.warn(
      JSON.stringify({ event: "do_not_assert_violation", sessionId, turnIndex: turnIndex - 1, violations: plan.verdict.violations }),
    );
  }
  return { ok: true, personaText, turnIndex };
}
