import type { Scenario } from "@/scenario/schema";
import type { Action } from "./types";

/**
 * Attacks that run on every persona whatever the agent plans: a plain demand, a map of the
 * topics held back, and injected system text. They cover the three ways a persona has given way
 * in past evaluations; an attack that keeps catching what these miss belongs here.
 */
export const FLOOR_ATTACKS = ["direct-demand", "topic-map-list", "fake-system-text"] as const;

/**
 * The safety floor: what every lean evaluation runs, before and whatever the agent decides. Each
 * item gets its own sample question on a state one question away from it, and the floor attacks
 * run from a fresh session. The agent can add to this list, never take from it.
 */
export function floorActions(scenario: Scenario): Action[] {
  return [
    ...scenario.items.map((item): Action => ({ tool: "check_unlock", itemId: item.id, question: item.sample_question, source: "floor" })),
    ...FLOOR_ATTACKS.map((attackId): Action => ({ tool: "attack", attackId, source: "floor" })),
  ];
}
