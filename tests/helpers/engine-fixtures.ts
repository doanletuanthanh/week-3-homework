import { alias, type AliasKind } from "@/engine/aliases";
import type { TranscriptLine } from "@/engine/contexts";
import { planTurn, type TurnPlan } from "@/engine/plan-turn";
import { initialState, type EngineState, type RawAnalysis } from "@/engine/types";
import type { Scenario } from "@/scenario/schema";
import { readChiThu } from "./sealed-strings";

export const chiThu = readChiThu();

/** Alias of a chị Thu item as a prompt shows it, e.g. `a("hook", "paid-app")` is "H2". */
export const a = (kind: AliasKind, itemId: string) => alias(chiThu, kind, itemId);

export const NO_VERDICT = { hook_dropped: false, disclosed_item_ids: [], violations: [] };

/** A neutral Call 1 output: an open question about nothing in particular, with no verdict. */
export function rawAnalysis(overrides: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    prev_turn_verdict: NO_VERDICT,
    question_type: "other",
    label: "open",
    grounded_turn_id: null,
    introduced_span: null,
    hook_id: null,
    topic_tags: [],
    ...overrides,
  };
}

/** Plays turns through `planTurn` with hand-written Call 1 outputs, keeping state and transcript. */
export function engineSession(scenario: Scenario = chiThu) {
  let state: EngineState = initialState(scenario.openness_start);
  const transcript: TranscriptLine[] = [{ index: 0, learnerText: null, personaText: scenario.opening_line }];
  const plans: TurnPlan[] = [];

  return {
    get state() {
      return state;
    },
    transcript,
    plans,
    turn(overrides: Partial<RawAnalysis> = {}, question = "Chị kể thêm cho em nghe được không ạ?"): TurnPlan {
      const plan = planTurn({ scenario, state, analysis: rawAnalysis(overrides), transcript: [...transcript], question });
      state = plan.stateAfter;
      transcript.push({ index: plan.turnIndex, learnerText: question, personaText: `Câu trả lời ở lượt ${plan.turnIndex}.` });
      plans.push(plan);
      return plan;
    },
  };
}

export const unlockedIds = (state: EngineState) => state.unlocked.map((entry) => entry.itemId);

export const DROPPED = { hook_dropped: true, disclosed_item_ids: [], violations: [] };
export const told = (...itemIds: string[]) => ({ hook_dropped: true, disclosed_item_ids: itemIds.map((id) => a("item", id)), violations: [] });

/**
 * A 30-turn session that walks every path: surface, past story, a follow-up behind a
 * prerequisite, trust items once openness allows, hooks dropped, ignored and picked up late,
 * leading questions, and closing questions.
 */
export const THIRTY_TURN_SCRIPT: Partial<RawAnalysis>[] = [
  /* 1 */ { topic_tags: [a("tag", "money-home")], question_type: "open" },
  /* 2 */ { prev_turn_verdict: told("money-home"), label: "leading", introduced_span: [0, 2], topic_tags: [a("tag", "paid-app")] },
  /* 3 */ { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "tried-methods")], question_type: "closed" },
  /* 4 */ { prev_turn_verdict: told("tried-methods"), hook_id: a("hook", "paid-app"), label: "confirm_grounded", grounded_turn_id: 2 },
  /* 5 */ { prev_turn_verdict: told("paid-app"), topic_tags: [a("tag", "last-attempt")], question_type: "past_specific" },
  /* 6 */ { prev_turn_verdict: told("last-attempt"), label: "boundary_probe", grounded_turn_id: 5, hook_id: a("hook", "shame") },
  /* 7 */ { prev_turn_verdict: told("shame"), topic_tags: [a("tag", "installment")], label: "confirm_grounded", grounded_turn_id: 6 },
  /* 8 */ { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "installment")], label: "boundary_probe", grounded_turn_id: 7 },
  /* 9 */ { prev_turn_verdict: told("installment"), label: "open", question_type: "open" },
  /* 10 */ { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "roommate")], label: "confirm_grounded", grounded_turn_id: 9 },
  /* 11 */ { prev_turn_verdict: told("roommate"), topic_tags: [a("tag", "work-fatigue")], question_type: "hypothetical_future" },
  /* 12 */ { prev_turn_verdict: DROPPED, label: "leading", introduced_span: [1, 3], topic_tags: [a("tag", "small-spend")] },
  /* 13 */ { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "first-start")], question_type: "closed" },
  /* 14 */ { prev_turn_verdict: DROPPED, hook_id: a("hook", "work-fatigue"), label: "confirm_grounded", grounded_turn_id: 11 },
  /* 15 */ { prev_turn_verdict: told("work-fatigue"), topic_tags: [a("tag", "weekly-batch")], label: "leading", introduced_span: [0, 0] },
  /* 16 */ { prev_turn_verdict: DROPPED, hook_id: a("hook", "first-start"), question_type: "past_specific" },
  /* 17 */ { prev_turn_verdict: told("first-start") },
  /* 18 */ { topic_tags: [a("tag", "weekly-batch")], question_type: "open" },
  /* 19 */ { prev_turn_verdict: told("weekly-batch"), label: "open", question_type: "open" },
  ...Array.from({ length: 11 }, (): Partial<RawAnalysis> => ({ prev_turn_verdict: DROPPED, question_type: "other" })),
];

/** The items `THIRTY_TURN_SCRIPT` opens, as `turn:item`. */
export const THIRTY_TURN_UNLOCKS = [
  "1:money-home",
  "3:tried-methods",
  "4:paid-app",
  "5:last-attempt",
  "6:shame",
  "8:installment",
  "10:roommate",
  "14:work-fatigue",
  "16:first-start",
  "18:weekly-batch",
];
