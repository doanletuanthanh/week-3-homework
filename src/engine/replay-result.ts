import type { Scenario } from "@/scenario/schema";
import { sliceTokens, type TokenRange } from "./tokens";
import { isGoodLabel, type Label } from "./types";

/** Learner turns of a replay (PRD §9.4). */
export const REPLAY_TURNS = 3;

export const REPLAY_RESULTS = ["success", "partial", "fail", "stopped", "skipped"] as const;
/** How a replay ended (PRD §9.5). `skipped` has no turns; `stopped` may have some. */
export type ReplayResult = (typeof REPLAY_RESULTS)[number];

export type ReplayLevel = "primary" | "fallback1";

/** One finished replay turn, as the result reads it. */
export type ReplayTurn = {
  index: number;
  /** The label left after the code checks of Call 1. */
  label: Label;
  introducedSpan: TokenRange | null;
  learnerTokens: string[];
  unlockedItemId: string | null;
  /** Items the replay judge confirmed the persona told in this turn; null when the judge failed. */
  disclosedItemIds: string[] | null;
  /** Leading-question replay: the judge's own label for the question, after its span was checked. */
  judgeLabel: Label | null;
};

const toldIn = (turns: ReplayTurn[]) => new Set(turns.flatMap((turn) => turn.disclosedItemIds ?? []));

/**
 * Whether a replay has ended by itself after these turns, and how (PRD §9.5); null while it
 * goes on. Code only. An item counts as told only where the replay judge said so: a turn whose
 * judge failed tells nothing.
 *
 * - Primary: success as soon as the judge confirms the persona told the target. After the third
 *   turn without that: partial when the persona told another item this replay opened, else fail.
 * - Leading-question replay: always three turns; success when none is a confirmed leading
 *   question and at least one has a good label by Call 1.
 */
export function decideReplay(input: { level: ReplayLevel; targetItemId: string | null; turns: ReplayTurn[] }): ReplayResult | null {
  const { level, targetItemId, turns } = input;
  const finished = turns.length >= REPLAY_TURNS;

  if (level === "primary") {
    if (targetItemId !== null && toldIn(turns).has(targetItemId)) return "success";
    if (!finished) return null;
    return otherItemTold(turns, targetItemId) === null ? "fail" : "partial";
  }

  if (!finished) return null;
  return !turns.some(confirmedLeading) && turns.some((turn) => isGoodLabel(turn.label)) ? "success" : "fail";
}

/**
 * A replay question counts as leading only when Call 1 and the replay judge both found it so
 * (FR-19: "leading" is said only when the second check agrees). A judge that failed on the turn
 * confirmed nothing. This is for the replay's result alone: unlocking and openness read Call 1.
 */
const confirmedLeading = (turn: ReplayTurn) => turn.label === "leading" && turn.judgeLabel === "leading";

/** The first item other than the target that this replay opened and the judge confirmed told. */
function otherItemTold(turns: ReplayTurn[], targetItemId: string | null): string | null {
  const told = toldIn(turns);
  const opened = turns.map((turn) => turn.unlockedItemId).filter((id): id is string => id !== null && id !== targetItemId);
  return opened.find((id) => told.has(id)) ?? null;
}

/**
 * What the learner is shown about a finished replay (PRD Màn 7, and the result card of Màn 6).
 * It holds the target's content, so it exists only for a replay that has ended.
 */
export type ReplayOutcome =
  | {
      level: "primary";
      result: ReplayResult;
      target: { content: string; sampleQuestion: string };
      /** `partial`: the other item the learner opened. */
      otherItem: string | null;
    }
  | {
      level: "fallback1";
      result: ReplayResult;
      /** The leading turn of the main interview that was replayed. */
      leadingTurn: number;
      /** Replay questions with a good label. */
      grounded: number;
      /** The first replay question that Call 1 and the replay judge both found leading. */
      stillLeading: { turn: number; words: string } | null;
      /** The sample question of the most important item still locked. */
      sampleQuestion: string | null;
    };

/**
 * Builds the shown outcome of an ended replay from its stored turns. Pure, so opening a finished
 * session again shows the same thing and calls no model.
 */
export function describeReplay(input: {
  scenario: Pick<Scenario, "items">;
  level: ReplayLevel;
  result: ReplayResult;
  forkAfterTurn: number;
  targetItemId: string | null;
  turns: ReplayTurn[];
  /** Items open at the end of the main interview or of the replay. */
  openItemIds: ReadonlySet<string>;
}): ReplayOutcome {
  const { scenario, level, result, forkAfterTurn, targetItemId, turns, openItemIds } = input;
  const itemOf = (id: string | null) => scenario.items.find((item) => item.id === id);

  if (level === "primary") {
    const target = itemOf(targetItemId);
    if (!target) throw new Error("a primary replay has no target item");
    return {
      level,
      result,
      target: { content: target.content, sampleQuestion: target.sample_question },
      otherItem: result === "partial" ? (itemOf(otherItemTold(turns, targetItemId))?.content ?? null) : null,
    };
  }

  const leading = result === "success" ? undefined : turns.find(confirmedLeading);
  // Stable sort: equal weights keep scenario order.
  const [topLocked] = scenario.items.filter((item) => !openItemIds.has(item.id)).sort((a, b) => b.weight - a.weight);
  return {
    level,
    result,
    leadingTurn: forkAfterTurn + 1,
    grounded: turns.filter((turn) => isGoodLabel(turn.label)).length,
    stillLeading: leading ? { turn: leading.index, words: sliceTokens(leading.learnerTokens, leading.introducedSpan) ?? "" } : null,
    sampleQuestion: result === "success" ? null : (topLocked?.sample_question ?? null),
  };
}
