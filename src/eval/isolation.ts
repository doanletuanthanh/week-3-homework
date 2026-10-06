import type { BaseMessage } from "@langchain/core/messages";
import type { AnalysisContext, JudgeContext, PersonaContext } from "@/engine/contexts";
import type { EngineState } from "@/engine/types";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildPersonaMessages } from "@/llm/prompts/persona";
import { buildTurnJudgeMessages } from "@/llm/prompts/turn-judge";
import type { Scenario, ScenarioItem } from "@/scenario/schema";
import { containsTerm } from "@/scenario/text-normalize";

/** The context one in-session call is about to be rendered from. */
export type CallContext =
  | { call: "ANALYSIS"; context: AnalysisContext }
  | { call: "PERSONA"; context: PersonaContext }
  | { call: "REPLAY_JUDGE"; context: JudgeContext };

/** Everything of an item that only the engine may release: content, key phrases and its ids. */
export function sealedParts(item: ScenarioItem, prompt: string): string[] {
  return [
    ...(prompt.includes(item.content) ? [`content of ${item.id}`] : []),
    ...item.secret_terms.filter((term) => containsTerm(prompt, term)).map((term) => `secret term "${term}" of ${item.id}`),
    ...(prompt.includes(item.id) ? [`id ${item.id}`] : []),
    ...(prompt.includes(item.do_not_assert.id) ? [`do-not-assert id ${item.do_not_assert.id}`] : []),
    ...(prompt.includes(item.sample_question) ? [`sample question of ${item.id}`] : []),
  ];
}

const text = (messages: BaseMessage[]) => messages.map((message) => message.text).join("\n");

/**
 * The prompt of a call with the conversation taken out. What the learner and the persona said is
 * theirs, and a simulated learner may well type a word that happens to be a secret term; the
 * rule is about what the engine itself hands to the model.
 */
function engineProvidedPrompt(subject: CallContext): string {
  switch (subject.call) {
    case "ANALYSIS":
      return text(buildAnalysisMessages({ ...subject.context, transcript: [], question: { text: "", tokens: [] } }));
    case "PERSONA":
      return text(buildPersonaMessages({ ...subject.context, transcript: [], question: "" }));
    case "REPLAY_JUDGE":
      return text(buildTurnJudgeMessages({ ...subject.context, transcript: [] }));
  }
}

/**
 * What a call's context holds that it must not (PRD §12.2 item 3); empty when the call is clean.
 * `state` is the state the context was built from: the items it lists as open are the only ones
 * whose content may appear. The persona call may also carry the do-not-assert of one item at
 * most, and never of an item that is open.
 */
export function isolationViolations(scenario: Scenario, state: EngineState, subject: CallContext): string[] {
  const unlocked = new Set(state.unlocked.map((entry) => entry.itemId));
  const prompt = engineProvidedPrompt(subject);
  const found = scenario.items.filter((item) => !unlocked.has(item.id)).flatMap((item) => sealedParts(item, prompt));

  if (subject.call === "PERSONA") {
    const constraints = scenario.items.filter((item) => prompt.includes(item.do_not_assert.text));
    if (constraints.length > 1) found.push(`do-not-assert of ${constraints.length} items`);
    for (const item of constraints) {
      if (unlocked.has(item.id)) found.push(`do-not-assert of open item ${item.id}`);
    }
  }
  return found;
}

/** A call was about to receive sealed material. Never retried: it is a defect, not a model failure. */
export class IsolationError extends Error {
  constructor(
    readonly call: CallContext["call"],
    readonly turnIndex: number,
    readonly violations: string[],
  ) {
    super(`context isolation broken in ${call} at turn ${turnIndex}: ${violations.join("; ")}`);
    this.name = "IsolationError";
  }
}

/** Throws when the context of a call breaks isolation. Runs before the call is made. */
export function assertIsolated(scenario: Scenario, state: EngineState, subject: CallContext): void {
  const violations = isolationViolations(scenario, state, subject);
  // Call 1 is built from the state before its turn; the other two from the state of their turn.
  const turnIndex = subject.call === "ANALYSIS" ? state.turnIndex + 1 : state.turnIndex;
  if (violations.length > 0) throw new IsolationError(subject.call, turnIndex, violations);
}
