import type { Scenario } from "@/scenario/schema";
import { alias } from "./aliases";
import { opennessLevel, type OpennessLevel } from "./openness";
import { tokenize } from "./tokens";
import type { EngineState } from "./types";

/**
 * The isolation boundary. Each builder takes the whole scenario and returns only what one call
 * may see; prompts are rendered from these objects and from nothing else. A locked item
 * contributes its public parts at most (topic tag, hook line once chosen, neutral do-not-assert),
 * never its content, id, path, threshold or weight. The notes canvas is not an input of any builder.
 */

export type TranscriptLine = { index: number; learnerText: string | null; personaText: string };

type PersonaIdentity = { displayName: string; identity: string };

/** What a call needs to judge one persona turn: shared by Call 1 and the turn judge. */
export type VerdictMaterial = {
  persona: PersonaIdentity;
  surfaceFacts: string[];
  transcript: TranscriptLine[];
  /** The persona turn being judged. */
  judgedTurn: number;
  /** Open items, with whether a verdict already confirmed the persona told them. */
  unlockedItems: { alias: string; content: string; told: boolean }[];
  /** Hooks a verdict confirmed as dropped and that can still be picked up. */
  droppedHooks: { alias: string; line: string; droppedAt: number }[];
  /** The hook the persona was asked to drop in the judged turn. */
  selectedHook: { alias: string; line: string } | null;
  /** Neutral constraints of the items that were locked in the judged turn. */
  doNotAssert: { alias: string; text: string }[];
};

export type AnalysisContext = VerdictMaterial & {
  /** Public topic tags of every item. */
  topicTags: { alias: string; tag: string }[];
  turnIndex: number;
  question: { text: string; tokens: string[] };
};

export type JudgeContext = VerdictMaterial;

/** `state` is the stored snapshot of the turn being judged, before its verdict. */
function verdictMaterial(scenario: Scenario, state: EngineState, transcript: TranscriptLine[]): VerdictMaterial {
  const unlocked = new Set(state.unlocked.map((entry) => entry.itemId));
  const told = new Set(state.disclosed.map((entry) => entry.itemId));
  const hook = scenario.items.find((item) => item.id === state.selectedHook && !unlocked.has(item.id));

  return {
    persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity },
    surfaceFacts: scenario.surface_facts,
    transcript,
    judgedTurn: state.turnIndex,
    unlockedItems: scenario.items
      .filter((item) => unlocked.has(item.id))
      .map((item) => ({ alias: alias(scenario, "item", item.id), content: item.content, told: told.has(item.id) })),
    droppedHooks: state.ledger
      .filter((entry) => entry.closedAt === null && !unlocked.has(entry.itemId))
      .map((entry) => ({
        alias: alias(scenario, "hook", entry.itemId),
        line: scenario.items.find((item) => item.id === entry.itemId)!.hook_line,
        droppedAt: entry.droppedAt,
      })),
    selectedHook: hook ? { alias: alias(scenario, "hook", hook.id), line: hook.hook_line } : null,
    doNotAssert: scenario.items
      .filter((item) => !unlocked.has(item.id))
      .map((item) => ({ alias: alias(scenario, "doNotAssert", item.id), text: item.do_not_assert.text })),
  };
}

/** Call 1. `state` is snapshot t-1 as stored; the question is the learner line of turn t. */
export function buildAnalysisContext(
  scenario: Scenario,
  state: EngineState,
  transcript: TranscriptLine[],
  question: string,
): AnalysisContext {
  return {
    ...verdictMaterial(scenario, state, transcript),
    topicTags: scenario.items.map((item) => ({ alias: alias(scenario, "tag", item.id), tag: item.topic_tag })),
    turnIndex: state.turnIndex + 1,
    question: { text: question, tokens: tokenize(question) },
  };
}

/** The turn judge: Call 1 without a new learner question. Judges the turn `state` belongs to. */
export function buildJudgeContext(scenario: Scenario, state: EngineState, transcript: TranscriptLine[]): JudgeContext {
  return verdictMaterial(scenario, state, transcript);
}

export type PersonaItemMode = "tell_now" | "tell_when_fitting" | "already_told";

export type PersonaContext = {
  persona: PersonaIdentity & { voiceNotes: string };
  surfaceFacts: string[];
  transcript: TranscriptLine[];
  opennessLevel: OpennessLevel;
  /** Open items only. */
  items: { content: string; mode: PersonaItemMode }[];
  /** At most one hook line to drop this turn. */
  hookLine: string | null;
  /** The constraint of the one touched tag, and only while its item is locked. */
  doNotAssert: string | null;
  question: string;
};

/** Call 2. `stateAfter` is the state after this turn's unlock decision and hook choice. */
export function buildPersonaContext(
  scenario: Scenario,
  decision: { stateAfter: EngineState; justUnlockedItemId: string | null; tagItemId: string | null },
  transcript: TranscriptLine[],
  question: string,
): PersonaContext {
  const { stateAfter, justUnlockedItemId, tagItemId } = decision;
  const unlocked = new Set(stateAfter.unlocked.map((entry) => entry.itemId));
  const told = new Set(stateAfter.disclosed.map((entry) => entry.itemId));
  const lockedItem = (id: string | null) => scenario.items.find((item) => item.id === id && !unlocked.has(item.id));

  return {
    persona: {
      displayName: scenario.persona.display_name,
      identity: scenario.persona.identity,
      voiceNotes: scenario.persona.voice_notes,
    },
    surfaceFacts: scenario.surface_facts,
    transcript,
    opennessLevel: opennessLevel(stateAfter.openness),
    items: scenario.items
      .filter((item) => unlocked.has(item.id))
      .map((item) => ({
        content: item.content,
        mode: item.id === justUnlockedItemId ? "tell_now" : told.has(item.id) ? "already_told" : "tell_when_fitting",
      })),
    hookLine: lockedItem(stateAfter.selectedHook)?.hook_line ?? null,
    doNotAssert: lockedItem(tagItemId)?.do_not_assert.text ?? null,
    question,
  };
}
