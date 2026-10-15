import { SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { CallModelDeps } from "@/llm/call-model";
import { PERSONA_GUARD_RULES } from "@/llm/prompts/persona";
import type { Scenario } from "@/scenario/schema";
import { validateScenario, type ViolationCode } from "@/scenario/validate";
import { LEAK_FIXTURES, LOOSE_VOICE, UNRELATED_QUESTION } from "./mutant-fixtures";
import { opensOnce } from "./thresholds";
import type { QaReport } from "./types";

/**
 * Known-bad versions of a curated persona, built to prove that the lean eval catches them. They
 * are test fixtures, not detectors: each operator changes a scenario in one known way and says
 * which threshold row must fail because of it. A mutant caught by another row counts as a miss.
 */
export type Mutant = {
  operator: OperatorKey;
  scenario: Scenario;
  /** The item the change aims at; null when it touches no single item. */
  targetItemId: string | null;
  /** Set when the change is to a prompt rather than to the scenario. */
  rewriteMessages?: CallModelDeps["rewriteMessages"];
};

export type Operator = {
  /** `structural` mutants are caught by `validate` and cost nothing; `model` mutants need the agent's calls. */
  family: "structural" | "model";
  /** Whether a miss fails the calibration. An `info` operator is measured and reported only. */
  gating: boolean;
  /** Key of the threshold row the mutant must fail. */
  trips: string;
  /** For a structural mutant: the `validate` rule that must fire. */
  violation?: ViolationCode;
  /**
   * Whether the report pins the failure on the change itself, in typed report data: the row
   * alone could fail for an unrelated, flaky reason. Checked together with `trips`.
   */
  confirms: (report: QaReport, mutant: Pick<Mutant, "scenario" | "targetItemId">) => boolean;
  /** The mutant of a scenario, or null when the operator does not apply to it. */
  apply: (scenario: Scenario) => Omit<Mutant, "operator"> | null;
};

export const OPERATOR_KEYS = [
  "leak-in-identity",
  "leak-in-hook",
  "leak-in-surface-fact",
  "weak-sample",
  "orphan-item",
  "trust-unreachable",
  "loose-voice",
  "prompt-weakened",
] as const;
export type OperatorKey = (typeof OPERATOR_KEYS)[number];

const copy = (scenario: Scenario): Scenario => structuredClone(scenario);

/** The mutant of a persona that has a leak fixture, with the fixture's item changed by `change`. */
function withLeak(change: (scenario: Scenario, fixture: (typeof LEAK_FIXTURES)[string]) => void): Operator["apply"] {
  return (scenario) => {
    const fixture = LEAK_FIXTURES[scenario.persona_id];
    if (!fixture) return null;
    const mutated = copy(scenario);
    change(mutated, fixture);
    return { scenario: mutated, targetItemId: fixture.itemId };
  };
}

/** Call 2's system prompt with its guard rules taken out; a rule that is no longer there is an error, not a silent no-op. */
function withoutGuardRules(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (!SystemMessage.isInstance(message)) return message;
    let text = message.text;
    for (const rule of PERSONA_GUARD_RULES) {
      if (!text.includes(rule)) throw new Error("prompt-weakened: a persona guard rule is no longer in the prompt");
      text = text.replace(`${rule}\n`, "");
    }
    return new SystemMessage(text);
  });
}


/** The planner named the target as told outright by a public field. */
const publicContentLeak: Operator["confirms"] = (report, mutant) =>
  report.publicLeaks.some((leak) => leak.kind === "content" && leak.itemId === mutant.targetItemId);

/** A reply told or raised the target before it was open; with no target, any such reply. */
const replyLeak: Operator["confirms"] = (report, mutant) => report.leaks.some((leak) => mutant.targetItemId === null || leak.itemId === mutant.targetItemId);

/** The floor's sample-question check of the target missed on every run it got. */
const floorMiss: Operator["confirms"] = (report, mutant) =>
  report.observations.some(
    (observation) =>
      observation.action.tool === "check_unlock" && observation.action.source === "floor" && observation.action.itemId === mutant.targetItemId && !opensOnce(observation),
  );

/** `validate` fires the operator's rule on the mutant. */
const violates =
  (code: ViolationCode): Operator["confirms"] =>
  (_, mutant) =>
    validateScenario(mutant.scenario).violations.some((violation) => violation.code === code);

export const OPERATORS: Record<OperatorKey, Operator> = {
  "leak-in-identity": {
    family: "model",
    gating: true,
    trips: "no_public_leak",
    confirms: publicContentLeak,
    apply: withLeak((scenario, fixture) => {
      scenario.persona.identity = `${scenario.persona.identity} ${fixture.about}`;
    }),
  },
  "leak-in-hook": {
    family: "model",
    gating: true,
    trips: "no_public_leak",
    confirms: publicContentLeak,
    apply: withLeak((scenario, fixture) => {
      scenario.items.find((item) => item.id === fixture.itemId)!.hook_line = fixture.told;
    }),
  },
  "leak-in-surface-fact": {
    family: "model",
    gating: true,
    trips: "no_leaks",
    confirms: replyLeak,
    apply: withLeak((scenario, fixture) => {
      scenario.surface_facts.push(fixture.told);
    }),
  },
  "weak-sample": {
    family: "model",
    gating: true,
    trips: "floor_unlocks",
    confirms: floorMiss,
    apply: (scenario) => {
      const mutated = copy(scenario);
      const item = mutated.items.find((entry) => entry.path === "surface");
      if (!item) return null;
      item.sample_question = UNRELATED_QUESTION;
      return { scenario: mutated, targetItemId: item.id };
    },
  },
  "orphan-item": {
    family: "structural",
    gating: true,
    trips: "validate",
    violation: "prerequisite_cycle",
    confirms: violates("prerequisite_cycle"),
    apply: (scenario) => {
      const mutated = copy(scenario);
      const item = mutated.items.find((entry) => entry.prerequisite_id !== undefined);
      if (!item) return null;
      // Its prerequisite now waits for it: neither can ever open.
      mutated.items.find((entry) => entry.id === item.prerequisite_id)!.prerequisite_id = item.id;
      return { scenario: mutated, targetItemId: item.id };
    },
  },
  "trust-unreachable": {
    family: "structural",
    gating: true,
    trips: "validate",
    violation: "trust_threshold_unreachable",
    confirms: violates("trust_threshold_unreachable"),
    apply: (scenario) => {
      const mutated = copy(scenario);
      const item = mutated.items.find((entry) => entry.path === "trust");
      if (!item) return null;
      item.trust_threshold = mutated.openness_start;
      return { scenario: mutated, targetItemId: item.id };
    },
  },
  "loose-voice": {
    family: "model",
    gating: false,
    trips: "no_leaks",
    confirms: replyLeak,
    apply: (scenario) => {
      if (!LEAK_FIXTURES[scenario.persona_id]) return null;
      const mutated = copy(scenario);
      mutated.persona.voice_notes = LOOSE_VOICE;
      return { scenario: mutated, targetItemId: null };
    },
  },
  "prompt-weakened": {
    family: "model",
    gating: false,
    trips: "no_leaks",
    confirms: replyLeak,
    apply: (scenario) =>
      LEAK_FIXTURES[scenario.persona_id]
        ? { scenario: copy(scenario), targetItemId: null, rewriteMessages: (role, messages) => (role === "PERSONA" ? withoutGuardRules(messages) : messages) }
        : null,
  },
};

/** Every mutant of a scenario, operator by operator, skipping operators that do not apply to it. */
export function mutantsOf(scenario: Scenario, operators: readonly OperatorKey[] = OPERATOR_KEYS): Mutant[] {
  return operators.flatMap((operator) => {
    const mutant = OPERATORS[operator].apply(scenario);
    return mutant ? [{ operator, ...mutant }] : [];
  });
}

