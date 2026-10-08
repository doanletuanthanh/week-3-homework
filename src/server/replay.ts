import { z } from "zod";
import { MAX_QUESTION_CHARS, TURN_TIME_BUDGET_MS } from "@/config/limits";
import type { Database, Executor } from "@/db/client";
import {
  claimReplayTurn,
  commitReplayTurn,
  findReplayTurnByKey,
  loadReplay,
  loadReplayBasis,
  skipReplayBranch,
  startReplayBranch,
  stopReplayBranch,
  type BranchRow,
  type ReplayClaimRefusal,
  type ReplayTurnClaimed,
} from "@/db/repo/replay";
import { getSession, type SessionRow, type TurnRow } from "@/db/repo/sessions";
import { releaseClaim } from "@/db/repo/turns";
import { applyVerdict } from "@/engine/apply-verdict";
import { REPLAY_TURNS, decideReplay, type ReplayOutcome, type ReplayTurn } from "@/engine/replay-result";
import type { BrowserTurn } from "@/engine/seal";
import { tokenize } from "@/engine/tokens";
import { runTurnGraph, type ContextInspector, type TurnGraphResult, type TurnJudgement } from "@/graphs/turn-graph";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";
import { replayOutcomeOf, toReplayTurn } from "./replay-outcome";

const subjectOf = (session: SessionRow) => ({ userId: session.userId, sessionId: session.id, isDemo: session.isDemo });

const recordResult = (tx: Executor, session: SessionRow, branch: BranchRow, turnCount: number) =>
  recordEvent(tx, subjectOf(session), { name: "replay_result", props: { level: branch.fallbackLevel!, result: branch.result!, turns: turnCount } });

export type ReplayActionError = "not_found" | "not_offered" | "not_replaying" | "in_flight";
export type ReplayActionResult = { ok: true } | { ok: false; error: ReplayActionError };

/**
 * "Quay lại lượt N": starts the session's one replay at the moment its reveal chose. Asking again
 * while it runs succeeds and changes nothing.
 */
export async function startReplay(db: Database, user: AppUser, sessionId: string): Promise<ReplayActionResult> {
  const outcome = await startReplayBranch(db, { userId: user.id, sessionId }, (tx, session, branch) =>
    recordEvent(tx, subjectOf(session), { name: "replay_started", props: { level: branch.fallbackLevel! } }),
  );
  return outcome === "started" || outcome === "already_started" ? { ok: true } : { ok: false, error: outcome };
}

/** "Bỏ qua, cho tôi xem luôn": no replay is played, and nothing stays sealed. */
export async function skipReplay(db: Database, user: AppUser, sessionId: string): Promise<ReplayActionResult> {
  const outcome = await skipReplayBranch(db, { userId: user.id, sessionId }, (tx, session, branch) => recordResult(tx, session, branch, 0));
  return outcome === "skipped" || outcome === "already_ended" ? { ok: true } : { ok: false, error: outcome };
}

export type StopReplayResult = { ok: true; outcome: ReplayOutcome | null } | { ok: false; error: ReplayActionError };

/** "Dừng": ends the replay where it is. The answer carries what was held, which is now unsealed. */
export async function stopReplay(db: Database, user: AppUser, sessionId: string): Promise<StopReplayResult> {
  const found = await getSession(db, user.id, sessionId);
  if (!found) return { ok: false, error: "not_found" };
  const stopped = await stopReplayBranch(db, { userId: user.id, sessionId }, recordResult);
  if (stopped !== "stopped" && stopped !== "already_ended") return { ok: false, error: stopped };
  const replay = await loadReplay(db, sessionId);
  return { ok: true, outcome: replay ? replayOutcomeOf(found.scenario.content, replay) : null };
}

/** Body of the replay turn API. The same limits as a main turn. */
export const replayTurnInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  /** One id per question, reused when the browser sends the same question again. */
  turnKey: z.uuid(),
  /** The replay turn the browser believes comes next: 1 to 3. */
  expectedIndex: z.number().int().min(1).max(REPLAY_TURNS),
});

export type ReplayTurnError = "invalid_input" | "not_found" | "replay_ended" | "in_flight" | "conflict" | "llm_failed";

/**
 * What a replay turn reports: the persona text, the turn count, whether the judge could check the
 * turn, and, only from the turn that ends the replay, its outcome.
 */
export type ReplayTurnResult =
  | { ok: true; personaText: string; replayTurnIndex: number; unchecked: boolean; outcome: ReplayOutcome | null }
  | { ok: false; error: ReplayTurnError };

export type RunReplayTurnOptions = {
  /** Receives the persona reply while it is generated. Not called for a stored reply. */
  onPersonaDelta?: (text: string) => void;
  /** Called when the reply is complete and the judge starts. */
  onJudging?: () => void;
  llmDeps?: Partial<CallModelDeps>;
  /** Sees the context of each of the three calls before it is made. */
  onContext?: ContextInspector;
  /** How long the three model calls may take together. Tests shorten it. */
  timeBudgetMs?: number;
};

const REFUSAL: Record<ReplayClaimRefusal, ReplayTurnError> = {
  not_found: "not_found",
  replay_ended: "replay_ended",
  in_flight: "in_flight",
  wrong_index: "conflict",
  key_used: "invalid_input",
};

/** The answer for a replay question that was already answered and stored. */
async function storedReplayTurn(db: Database, user: AppUser, sessionId: string, turnKey: string): Promise<ReplayTurnResult | null> {
  const turn = await findReplayTurnByKey(db, user.id, sessionId, turnKey);
  if (!turn) return null;
  const [found, replay] = await Promise.all([getSession(db, user.id, sessionId), loadReplay(db, sessionId)]);
  if (!found || !replay) return null;
  // The outcome goes with the turn that ended the replay, and with no other.
  const last = replay.turns.at(-1)?.index === turn.index;
  return {
    ok: true,
    personaText: turn.personaText,
    replayTurnIndex: turn.index - replay.branch.forkAfterTurn!,
    unchecked: turn.verdictJson === null,
    outcome: last ? replayOutcomeOf(found.scenario.content, replay) : null,
  };
}

/**
 * One learner question on the replay branch: Call 1, the unlock decision in code, Call 2, then
 * the judge, then one transaction. The branch starts from the snapshot at the fork and reads
 * nothing later of the main interview. The verdict about the reply comes from the judge alone;
 * when the judge fails the turn still counts, with nothing told. The turn that makes the replay
 * a success, or the third turn, ends it: the result is written and the session becomes `done`
 * in the same transaction. No cost cap is consulted: a replay that started runs to its end.
 */
export async function runReplayTurn(
  db: Database,
  user: AppUser,
  sessionId: string,
  rawInput: unknown,
  options: RunReplayTurnOptions = {},
): Promise<ReplayTurnResult> {
  const input = replayTurnInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { text, turnKey, expectedIndex } = input.data;

  const already = await storedReplayTurn(db, user, sessionId, turnKey);
  if (already) return already;

  const claimed = await claimReplayTurn(db, { userId: user.id, sessionId, expectedIndex, turnKey });
  if (!claimed.ok) {
    // The first send may have been committed between the lookup above and the claim.
    const justStored = claimed.reason === "not_found" ? null : await storedReplayTurn(db, user, sessionId, turnKey);
    return justStored ?? { ok: false, error: REFUSAL[claimed.reason] };
  }
  const { claim } = claimed;
  const { branch, turnIndex } = claim;
  const scenario = claim.scenario.content;
  const level = branch.fallbackLevel!;

  const startedAt = Date.now();
  let earlier: TurnRow[];
  let graph: TurnGraphResult;
  try {
    const basis = await loadReplayBasis(db, claim);
    earlier = basis.replayTurns;
    const turnsSoFar = [...basis.shared, ...basis.replayTurns];
    graph = await runTurnGraph(
      {
        scenario,
        state: {
          turnIndex: basis.snapshot.index,
          unlocked: basis.snapshot.unlocked,
          ledger: basis.snapshot.ledger,
          disclosed: basis.snapshot.disclosed,
          openness: basis.snapshot.openness,
          selectedHook: turnsSoFar.at(-1)!.hookSelected,
        },
        transcript: turnsSoFar.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText })),
        question: text,
      },
      {
        scope: { scope: "session", sessionId, branchId: branch.id, turnIndex },
        meta: { session_id: sessionId, turn_index: turnIndex, branch: "replay" },
        onPersonaDelta: options.onPersonaDelta,
        onJudging: options.onJudging,
        signal: AbortSignal.timeout(options.timeBudgetMs ?? TURN_TIME_BUDGET_MS),
        llmDeps: options.llmDeps,
        onContext: options.onContext,
        priorityItemId: branch.targetItemId ?? undefined,
        judge: { labelQuestion: level === "fallback1" },
      },
    );
  } catch (error) {
    await releaseClaim(db, sessionId, claim.token);
    if (!(error instanceof LlmCallError)) throw error;
    const cause = error.cause instanceof Error ? error.cause.message : String(error.cause);
    console.warn(JSON.stringify({ event: "replay_turn_llm_failed", sessionId, turnIndex, role: error.role, attempts: error.attempts, cause }));
    return { ok: false, error: "llm_failed" };
  }

  return finishReplayTurn(db, { sessionId, claim, earlier, graph, text, turnKey, startedAt }).catch(async (error: unknown) => {
    // Whatever went wrong after the calls, the session is given back at once.
    await releaseClaim(db, sessionId, claim.token);
    throw error;
  });
}

/** Applies the judge's verdict, decides whether the replay has ended, and writes the turn. */
async function finishReplayTurn(
  db: Database,
  input: { sessionId: string; claim: ReplayTurnClaimed; earlier: TurnRow[]; graph: TurnGraphResult; text: string; turnKey: string; startedAt: number },
): Promise<ReplayTurnResult> {
  const { sessionId, claim, earlier, graph, text, turnKey, startedAt } = input;
  const { branch, turnIndex, replayTurn } = claim;
  const scenario = claim.scenario.content;
  const level = branch.fallbackLevel!;
  const { analysis, plan, personaText } = graph;
  const judgement: TurnJudgement = graph.judgement ?? { ok: false };
  // Only what code accepts of the judge's verdict is applied, by the rules of a main turn.
  const judged = judgement.ok ? applyVerdict(scenario, plan.stateAfter, judgement.verdict) : null;
  const state = judged?.state ?? plan.stateAfter;
  const learnerTokens = tokenize(text);

  const turns: ReplayTurn[] = [
    ...earlier.map(toReplayTurn),
    {
      index: turnIndex,
      label: plan.analysis.label,
      introducedSpan: plan.analysis.introduced_span,
      learnerTokens,
      unlockedItemId: plan.unlockedItemId,
      disclosedItemIds: judged?.applied.disclosed_item_ids ?? null,
      judgeLabel: judgement.ok ? judgement.label : null,
    },
  ];
  const result = decideReplay({ level, targetItemId: branch.targetItemId, turns });

  const committed = await commitReplayTurn(
    db,
    {
      sessionId,
      token: claim.token,
      branchId: branch.id,
      turn: {
        sessionId,
        branchId: branch.id,
        index: turnIndex,
        turnKey,
        learnerText: text,
        learnerTokens,
        personaText,
        personaTokens: tokenize(personaText),
        analysisJson: analysis,
        decisionJson: {
          analysis: plan.analysis,
          corrections: plan.corrections,
          rules: plan.rules,
          unlockedItemId: plan.unlockedItemId,
          opennessBefore: plan.opennessBefore,
          opennessAfter: plan.opennessAfter,
        },
        verdictJson: judged?.applied ?? null,
        hookSelected: plan.hookToDrop,
        flagged: (judged?.applied.violations.length ?? 0) > 0,
        judgeLabel: judgement.ok ? judgement.label : null,
        latencyMs: Date.now() - startedAt,
      },
      snapshot: { sessionId, branchId: branch.id, index: turnIndex, unlocked: state.unlocked, ledger: state.ledger, disclosed: state.disclosed, openness: state.openness },
      result,
    },
    async (tx, session) => {
      if (result !== null) await recordResult(tx, session, { ...branch, result }, replayTurn);
    },
  );
  if (committed === "replay_ended") return { ok: false, error: "replay_ended" };
  if (committed === "claim_lost") return { ok: false, error: "conflict" };

  if (judged && judged.applied.violations.length > 0) {
    console.warn(JSON.stringify({ event: "do_not_assert_violation", sessionId, branch: "replay", turnIndex, violations: judged.applied.violations }));
  }
  const ended = result === null ? null : await loadReplay(db, sessionId);
  return { ok: true, personaText, replayTurnIndex: replayTurn, unchecked: !judgement.ok, outcome: ended ? replayOutcomeOf(scenario, ended) : null };
}

/**
 * The turns of the learner's own replay, for the result page of a session that is `done`. Empty
 * while the replay runs (its screen has them already) and when no replay was played; null when
 * the session is not theirs.
 */
export async function getReplayTranscriptView(db: Database, user: AppUser, sessionId: string): Promise<BrowserTurn[] | null> {
  const found = await getSession(db, user.id, sessionId);
  if (!found) return null;
  if (found.session.status !== "done") return [];
  const replay = await loadReplay(db, sessionId);
  return (replay?.turns ?? []).map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText, leading: null }));
}
