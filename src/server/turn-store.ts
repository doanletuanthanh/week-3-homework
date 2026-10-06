import { MAX_TURNS } from "@/config/limits";
import type { Database } from "@/db/client";
import { commitTurn, loadBranch, type CommitOutcome, type TurnClaimed } from "@/db/repo/turns";
import type { TranscriptLine } from "@/engine/contexts";
import type { TurnPlan } from "@/engine/plan-turn";
import { tokenize } from "@/engine/tokens";
import type { EngineState, RawAnalysis } from "@/engine/types";
import type { Scenario } from "@/scenario/schema";
import { recordEvent } from "./events";

export type TurnBasis = { scenario: Scenario; state: EngineState; transcript: TranscriptLine[] };

/** Everything one finished turn adds. */
export type FinishedTurn = {
  turnKey: string;
  question: string;
  personaText: string;
  analysis: RawAnalysis;
  plan: TurnPlan;
  latencyMs: number;
};

/**
 * Where a turn reads its starting point and writes its result. The engine and the graph never
 * touch storage themselves, so the same turn runs against Postgres in the app and against
 * memory in evaluation episodes.
 */
export interface TurnStore {
  /** Scenario, snapshot t-1 and turns 0 to t-1. */
  loadState(): Promise<TurnBasis>;
  /** Writes the turn whole, or reports why nothing was written. */
  commitTurn(turn: FinishedTurn): Promise<CommitOutcome>;
}

/** The store of one claimed turn of a learner's session. */
export function postgresTurnStore(db: Database, target: { sessionId: string; userId: string; claim: TurnClaimed }): TurnStore {
  const { sessionId, userId, claim } = target;
  const { branchId, turnIndex } = claim;

  return {
    async loadState() {
      const { turns, snapshot } = await loadBranch(db, branchId, turnIndex - 1);
      const last = turns.at(-1)!;
      return {
        scenario: claim.scenario.content,
        state: {
          turnIndex: snapshot.index,
          unlocked: snapshot.unlocked,
          ledger: snapshot.ledger,
          disclosed: snapshot.disclosed,
          openness: snapshot.openness,
          selectedHook: last.hookSelected,
        },
        transcript: turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText })),
      };
    },

    commitTurn({ turnKey, question, personaText, analysis, plan, latencyMs }) {
      return commitTurn(
        db,
        {
          sessionId,
          token: claim.token,
          turn: {
            sessionId,
            branchId,
            index: turnIndex,
            turnKey,
            learnerText: question,
            learnerTokens: tokenize(question),
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
            hookSelected: plan.hookToDrop,
            latencyMs,
          },
          snapshot: {
            sessionId,
            branchId,
            index: turnIndex,
            unlocked: plan.stateAfter.unlocked,
            ledger: plan.stateAfter.ledger,
            disclosed: plan.stateAfter.disclosed,
            openness: plan.stateAfter.openness,
          },
          previous: {
            verdictJson: plan.verdict,
            flagged: plan.verdict.violations.length > 0,
            ledger: plan.previousState.ledger,
            disclosed: plan.previousState.disclosed,
          },
          endsSession: turnIndex === MAX_TURNS,
        },
        (tx) =>
          recordEvent(tx, { userId, sessionId, isDemo: claim.isDemo }, { name: "turn", props: { turn_index: turnIndex, latency_ms: latencyMs } }),
      );
    },
  };
}
