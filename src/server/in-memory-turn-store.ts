import { MAX_TURNS } from "@/config/limits";
import { applyVerdict } from "@/engine/apply-verdict";
import type { TranscriptLine } from "@/engine/contexts";
import { initialState, type EngineState, type Verdict } from "@/engine/types";
import type { Scenario } from "@/scenario/schema";
import type { FinishedTurn, TurnBasis, TurnStore } from "./turn-store";

export type InMemoryTurnStore = TurnStore & {
  /** The turns written so far, in order; turn 1 is at position 0. */
  readonly turns: readonly FinishedTurn[];
  /** The state after the last turn, with every verdict that has arrived. */
  readonly state: EngineState;
  /** Turns 0 to t. A copy: changing it does not change the store. */
  readonly transcript: TranscriptLine[];
  /** The verdict code accepted for each persona turn that has one, by turn index. */
  readonly verdicts: ReadonlyMap<number, Verdict>;
  /**
   * Applies the turn judge's verdict about the last persona turn, which no later Call 1 will
   * judge. Returns what code accepted of it.
   */
  applyFinalVerdict(verdict: Verdict): Verdict;
};

/**
 * A session that lives in memory: an evaluation episode plays through the same turn graph as a
 * learner's session, without touching Postgres. It starts like a new session does, with the
 * opening line as turn 0 and the scenario's starting state.
 */
export function inMemoryTurnStore(scenario: Scenario): InMemoryTurnStore {
  let state = initialState(scenario.openness_start);
  const transcript: TranscriptLine[] = [{ index: 0, learnerText: null, personaText: scenario.opening_line }];
  const turns: FinishedTurn[] = [];
  const verdicts = new Map<number, Verdict>();

  return {
    turns,
    verdicts,
    get state() {
      return state;
    },
    get transcript() {
      return [...transcript];
    },

    async loadState(): Promise<TurnBasis> {
      return { scenario, state, transcript: [...transcript] };
    },

    async commitTurn(turn) {
      const { plan } = turn;
      if (state.turnIndex >= MAX_TURNS) return "session_ended";
      if (plan.turnIndex !== state.turnIndex + 1) {
        throw new Error(`turn ${plan.turnIndex} cannot follow turn ${state.turnIndex}`);
      }
      // The plan carries the verdict about the turn before it, as the Postgres store writes it.
      if (state.turnIndex > 0) verdicts.set(state.turnIndex, plan.verdict);
      turns.push(turn);
      transcript.push({ index: plan.turnIndex, learnerText: turn.question, personaText: turn.personaText });
      state = plan.stateAfter;
      return "committed";
    },

    applyFinalVerdict(verdict) {
      const result = applyVerdict(scenario, state, verdict);
      state = result.state;
      if (state.turnIndex > 0) verdicts.set(state.turnIndex, result.applied);
      return result.applied;
    },
  };
}
