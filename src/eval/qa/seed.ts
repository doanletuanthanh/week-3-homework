import type { TranscriptLine } from "@/engine/contexts";
import { initialState, type EngineState } from "@/engine/types";
import { OPENNESS_MAX, type Scenario } from "@/scenario/schema";

/**
 * The learner turn before an item's hook line in a seeded transcript. It asks about the item's
 * public topic, as live: a hook is chosen when the question touches its topic, so the hook line
 * always follows talk of that topic. Without it, a sample question that builds on the topic reads
 * as the learner adding words of their own.
 */
export const seedOpener = (topicTag: string) => `Mình kể thêm cho em nghe về ${topicTag} được không ạ?`;

export type ProbeBasis = { state: EngineState; transcript: TranscriptLine[] };

/** A new session: the opening line and the scenario's starting state, as a learner gets it. */
export function freshBasis(scenario: Scenario): ProbeBasis {
  return {
    state: initialState(scenario.openness_start),
    transcript: [{ index: 0, learnerText: null, personaText: scenario.opening_line }],
  };
}

/** The item's prerequisite, its prerequisite, and so on; `validate` guarantees there is no cycle. */
function prerequisiteChain(scenario: Scenario, itemId: string): string[] {
  const chain: string[] = [];
  for (let id = scenario.items.find((item) => item.id === itemId)?.prerequisite_id; id !== undefined; ) {
    chain.push(id);
    id = scenario.items.find((item) => item.id === id)?.prerequisite_id;
  }
  return chain;
}

/**
 * A session one question away from the item: its prerequisites open and told, openness at the
 * item's trust threshold, and the persona's last reply its hook line, which the persona had been
 * asked to say. The next Call 1 judges that reply as it would in a session, so a follow-up item
 * reaches the ledger the way it does live. Openness is set, not earned: it stands for earlier good
 * turns the transcript does not hold.
 */
export function itemBasis(scenario: Scenario, itemId: string): ProbeBasis {
  const item = scenario.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`unknown item "${itemId}"`);
  const opened = prerequisiteChain(scenario, itemId).map((id) => ({ itemId: id, turn: 1 }));
  const basis: ProbeBasis = {
    state: {
      turnIndex: 1,
      unlocked: opened,
      ledger: [],
      disclosed: opened,
      openness: Math.max(scenario.openness_start, item.trust_threshold ?? 0),
      selectedHook: itemId,
    },
    transcript: [
      { index: 0, learnerText: null, personaText: scenario.opening_line },
      { index: 1, learnerText: seedOpener(item.topic_tag), personaText: item.hook_line },
    ],
  };
  const problems = stateProblems(scenario, basis.state);
  if (problems.length > 0) throw new Error(`seeded state for "${itemId}" is not one the engine could hold: ${problems.join("; ")}`);
  return basis;
}

/**
 * What makes a seeded state one the engine could not hold: an open item behind a locked
 * prerequisite, a told item that is not open, a hook for an item that is open, openness out of range.
 */
export function stateProblems(scenario: Scenario, state: EngineState): string[] {
  const open = new Set(state.unlocked.map((entry) => entry.itemId));
  const known = new Set(scenario.items.map((item) => item.id));
  const problems: string[] = [];
  for (const id of open) {
    const prerequisite = scenario.items.find((item) => item.id === id)?.prerequisite_id;
    if (!known.has(id)) problems.push(`unknown open item ${id}`);
    if (prerequisite !== undefined && !open.has(prerequisite)) problems.push(`${id} is open before its prerequisite ${prerequisite}`);
  }
  for (const entry of state.disclosed) if (!open.has(entry.itemId)) problems.push(`${entry.itemId} is told but not open`);
  if (state.selectedHook !== null && open.has(state.selectedHook)) problems.push(`hook of open item ${state.selectedHook}`);
  if (state.openness < 0 || state.openness > OPENNESS_MAX) problems.push(`openness ${state.openness} out of range`);
  return problems;
}
