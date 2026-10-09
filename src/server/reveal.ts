import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { REVEAL_HEARTBEAT_MS, REVEAL_STALE_MS } from "@/config/limits";
import type { Database, Executor } from "@/db/client";
import { claimRevealRun, finaliseReveal, loadMainBranch, saveRevealPart, storeGuess, touchRevealRun, type GuessOutcome } from "@/db/repo/reveal";
import { getSession, listTurns, type SessionRow } from "@/db/repo/sessions";
import { sessions } from "@/db/schema";
import { settle } from "@/engine/reveal-compute";
import type { RevealBasis, RevealParts } from "@/engine/reveal-types";
import { toBrowserReveal, toBrowserTranscript, type BrowserReveal, type BrowserTurn } from "@/engine/seal";
import { runRevealGraph } from "@/graphs/reveal-graph";
import type { CallModelDeps } from "@/llm/call-model";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadMainBranch>>>;

/** The frozen session as the reveal reads it. The guess is not read. */
export function toRevealBasis({ session, scenario, turns, snapshot }: Pick<Loaded, "session" | "scenario" | "turns" | "snapshot">): RevealBasis {
  return {
    scenario: scenario.content,
    turns: turns.map((turn) => ({
      index: turn.index,
      learnerText: turn.learnerText,
      learnerTokens: turn.learnerTokens,
      personaText: turn.personaText,
      analysis: turn.decisionJson?.analysis ?? null,
      unlockedItemId: turn.decisionJson?.unlockedItemId ?? null,
      opennessDropped: turn.decisionJson ? turn.decisionJson.opennessAfter < turn.decisionJson.opennessBefore : false,
      flagged: turn.flagged,
    })),
    state: {
      turnIndex: snapshot.index,
      unlocked: snapshot.unlocked,
      ledger: snapshot.ledger,
      disclosed: snapshot.disclosed,
      openness: snapshot.openness,
      selectedHook: turns.at(-1)!.hookSelected,
    },
    canvasTokens: session.canvasTokens ?? [],
    focus: session.focus,
  };
}

/**
 * Runs whenever the second of the two things a reveal screen needs has just been stored (the
 * guess, the result), inside that write's transaction. It writes the reveal event, and a session
 * with no replay moment is `done` there and then: nothing was held back for it.
 */
export async function finishIfComplete(tx: Executor, session: SessionRow): Promise<void> {
  const { guess, revealJson: reveal, revealReadyAt, revealedAt } = session;
  if (guess === null || reveal === null || revealReadyAt === null || revealedAt === null) return;

  await recordEvent(
    tx,
    { userId: session.userId, sessionId: session.id, isDemo: session.isDemo },
    {
      name: "reveal",
      props: {
        guess,
        told: reveal.counts.told,
        recognized: reveal.counts.recognizedFull,
        total: reveal.counts.total,
        revealed_count: reveal.counts.revealedCount,
        replay_level: reveal.replay.level,
        // How long the learner waited after pressing "Xem kết quả": zero when the result was there first.
        latency_ms: Math.max(0, revealReadyAt.getTime() - revealedAt.getTime()),
      },
    },
  );
  if (reveal.replay.level === "none") {
    await tx
      .update(sessions)
      .set({ status: "done", updatedAt: sql`now()` })
      .where(and(eq(sessions.id, session.id), eq(sessions.status, "revealed")));
  }
}

/** Thrown inside a run whose session was taken over by another runner. Nothing more is written. */
class RevealOwnershipLost extends Error {}

export type RunRevealOptions = { llmDeps?: Partial<CallModelDeps>; heartbeatMs?: number; staleMs?: number };
/** `not_claimed`: another runner holds the reveal, or it is finished, or the session is not ready for one. */
export type RunRevealOutcome = "finalised" | "not_claimed" | "lost";

/**
 * Computes and stores the reveal of an ended session. Safe to call from anywhere, any number of
 * times: only the runner that wins the claim does anything, each call's output is stored as it
 * completes, and a runner that lost the session to another writes nothing. A runner that starts
 * after an earlier one died resumes at the first call that has no stored output, so the three
 * logical calls are made once each. It needs no browser: closing the tab changes nothing.
 */
export async function runReveal(db: Database, sessionId: string, options: RunRevealOptions = {}): Promise<RunRevealOutcome> {
  const claim = await claimRevealRun(db, sessionId, options.staleMs);
  if (!claim) return "not_claimed";
  const { token } = claim;

  const lost = new AbortController();
  const heartbeat = setInterval(() => {
    touchRevealRun(db, sessionId, token)
      .then((ours) => {
        if (!ours) lost.abort(new RevealOwnershipLost());
      })
      .catch((error: unknown) => console.error(error));
  }, options.heartbeatMs ?? REVEAL_HEARTBEAT_MS);

  try {
    const loaded = await loadMainBranch(db, sessionId);
    if (!loaded) return "lost";
    const basis = toRevealBasis(loaded);
    const stored = loaded.session.revealParts;
    // Every allowed runner died: a call that never finished is a failed call.
    const failed = { ok: false as const };
    const parts: RevealParts = claim.exhausted
      ? { judge: stored.judge ?? failed, generator: stored.generator ?? failed, verifier: stored.verifier ?? failed }
      : stored;

    const { reveal } = await runRevealGraph(
      { basis, parts },
      {
        scope: { scope: "session", sessionId },
        meta: { session_id: sessionId },
        signal: lost.signal,
        llmDeps: options.llmDeps,
        onPart: async (part) => {
          // The opening line is authored: with no learner turn there is no persona turn to give a verdict.
          const judged = part.judge?.ok && basis.state.turnIndex > 0 ? part.judge : null;
          const settled = judged ? settle(basis, judged).state : null;
          const saved = await saveRevealPart(db, {
            sessionId,
            token,
            parts: part,
            lastTurn:
              judged && settled
                ? { branchId: loaded.branchId, index: basis.state.turnIndex, verdict: judged.verdict, ledger: settled.ledger, disclosed: settled.disclosed }
                : undefined,
          });
          if (!saved) throw new RevealOwnershipLost();
          if (judged && judged.verdict.violations.length > 0) {
            // FR-16, for the one persona turn no Call 1 judged.
            console.warn(
              JSON.stringify({ event: "do_not_assert_violation", sessionId, turnIndex: basis.state.turnIndex, violations: judged.verdict.violations }),
            );
          }
        },
      },
    );
    return (await finaliseReveal(db, { sessionId, token, reveal }, finishIfComplete)) ? "finalised" : "lost";
  } catch (error) {
    if (error instanceof RevealOwnershipLost) return "lost";
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/** True when a session should have a reveal and no live runner is working on one. */
export function revealRunIsDue(session: SessionRow, now: Date = new Date(), staleMs: number = REVEAL_STALE_MS): boolean {
  if (session.canvasFrozenAt === null || session.revealReadyAt !== null) return false;
  if (session.status !== "interviewing" && session.status !== "revealed") return false;
  return session.revealRunToken === null || session.revealHeartbeatAt === null || now.getTime() - session.revealHeartbeatAt.getTime() > staleMs;
}

export const guessInputSchema = z.object({ guess: z.number().int().min(0) });

export type GuessError = "invalid_input" | "not_found" | "not_ended";
export type GuessResult = { ok: true } | { ok: false; error: GuessError };

const GUESS_ERROR: Record<Exclude<GuessOutcome, "stored" | "already_stored">, GuessError> = {
  not_found: "not_found",
  not_ended: "not_ended",
  out_of_range: "invalid_input",
};

/**
 * "Xem kết quả": stores the guess and moves the session to `revealed`. The guess goes to the
 * session row and nowhere else: no model call reads it. Sending it again succeeds and changes nothing.
 */
export async function submitGuess(db: Database, user: AppUser, sessionId: string, rawInput: unknown): Promise<GuessResult> {
  const input = guessInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const outcome = await storeGuess(db, { userId: user.id, sessionId, guess: input.data.guess }, finishIfComplete);
  if (outcome === "stored" || outcome === "already_stored") return { ok: true };
  return { ok: false, error: GUESS_ERROR[outcome] };
}

export type RevealView =
  | { found: false }
  /** `due`: no live runner is computing it, so the caller should start one. */
  | { found: true; ready: false; due: boolean }
  | { found: true; ready: true; reveal: BrowserReveal };

/**
 * The learner's own reveal as a browser may see it. Not ready until the guess is stored and the
 * result exists: before that, nothing of the reveal leaves the server.
 */
export async function getRevealView(db: Database, user: AppUser, sessionId: string): Promise<RevealView> {
  const found = await getSession(db, user.id, sessionId);
  if (!found) return { found: false };
  const { session } = found;
  const reveal = toBrowserReveal({ status: session.status, guess: session.guess, canvasText: session.canvasText, reveal: session.revealJson });
  return reveal ? { found: true, ready: true, reveal } : { found: true, ready: false, due: revealRunIsDue(session) };
}

/**
 * "Tải về" was pressed. The sheet can be taken away only from a finished session, so only then
 * is the event written. `not_found` covers a session of someone else.
 */
export async function recordTakeawayDownload(db: Database, user: AppUser, sessionId: string): Promise<"recorded" | "not_done" | "not_found"> {
  const found = await getSession(db, user.id, sessionId);
  if (!found) return "not_found";
  if (found.session.status !== "done") return "not_done";
  await recordEvent(db, { userId: user.id, sessionId, isDemo: found.session.isDemo }, { name: "takeaway_downloaded", props: {} });
  return "recorded";
}

/** The learner's own main transcript as a browser may see it right now; null when the session is not theirs. */
export async function getTranscriptView(db: Database, user: AppUser, sessionId: string): Promise<BrowserTurn[] | null> {
  const found = await getSession(db, user.id, sessionId);
  if (!found) return null;
  const { session } = found;
  // Marks exist only once the learner has guessed: the reveal is not readable before that.
  const reveal = session.guess === null ? null : session.revealJson;
  return toBrowserTranscript(await listTurns(db, user.id, sessionId), reveal, session.status);
}
