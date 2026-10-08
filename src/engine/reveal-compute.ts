import type { Scenario } from "@/scenario/schema";
import { resolveAlias } from "./aliases";
import { applyVerdict } from "./apply-verdict";
import type {
  CanvasMatch,
  CanvasMatchKind,
  CommentSlot,
  JudgePart,
  ReplaySelection,
  RevealBasis,
  RevealItem,
  RevealTurn,
  SlotType,
} from "./reveal-types";
import { isValidRange, sliceTokens } from "./tokens";
import { isGoodLabel, type EngineState } from "./types";

/** Praise and comments shown together, at most (FR-20). The habit card is not counted. */
export const MAX_COMMENTS = 3;

/** A canvas match as the end judge wrote it: untrusted until `resolveCanvasMatches` ran. */
export type RawCanvasMatch = { range: number[]; kind: "item" | "never_said"; item_id: string | null; reason: string };

/**
 * The session as every reveal number reads it: the last turn's state with the end judge's verdict
 * about that turn, and that turn flagged when the verdict found a violation. Settling a basis
 * that already holds the verdict changes nothing, so a run that resumes after the judge computes
 * from the same data as the run that made the call.
 */
export function settle(basis: RevealBasis, judge: JudgePart | undefined): RevealBasis {
  if (!judge?.ok) return basis;
  const last = basis.turns.at(-1);
  const violated = judge.verdict.violations.length > 0;
  return {
    ...basis,
    state: applyVerdict(basis.scenario, basis.state, judge.verdict).state,
    turns: basis.turns.map((turn) => (turn === last && violated ? { ...turn, flagged: true } : turn)),
  };
}

/** Items the transcript showed: their hook was dropped, or the persona told them (PRD §8.1). */
function revealedIds(state: EngineState): Set<string> {
  return new Set([...state.ledger.map((entry) => entry.itemId), ...state.disclosed.map((entry) => entry.itemId)]);
}

/**
 * Turns the judge's canvas matches into ones code stands behind: a range that is empty or outside
 * the notes is dropped, an item that does not exist is dropped, an item named twice counts once
 * (its first stretch), and no two stretches overlap. What an item match *is* comes from the
 * state, not from the judge: told, shown but not told, or never shown.
 */
export function resolveCanvasMatches(
  scenario: Pick<Scenario, "items">,
  state: EngineState,
  canvasTokens: string[],
  raw: RawCanvasMatch[],
): CanvasMatch[] {
  const told = new Set(state.disclosed.map((entry) => entry.itemId));
  const revealed = revealedIds(state);
  const kindOf = (itemId: string): CanvasMatchKind => (told.has(itemId) ? "told" : revealed.has(itemId) ? "unconfirmed" : "unrevealed");

  const resolved = raw.flatMap((match): CanvasMatch[] => {
    if (!isValidRange(match.range, canvasTokens.length)) return [];
    const range: CanvasMatch["range"] = [match.range[0], match.range[1]];
    if (match.kind === "never_said") return [{ range, kind: "never_said", itemId: null, reason: match.reason }];
    const itemId = resolveAlias(scenario, "item", match.item_id);
    return itemId === null ? [] : [{ range, kind: kindOf(itemId), itemId, reason: match.reason }];
  });

  const kept: CanvasMatch[] = [];
  // Array.sort is stable: of two stretches that start together, the judge's first one stays.
  for (const match of resolved.sort((a, b) => a.range[0] - b.range[0])) {
    const last = kept.at(-1);
    if (last && match.range[0] <= last.range[1]) continue;
    if (match.itemId !== null && kept.some((other) => other.itemId === match.itemId)) continue;
    kept.push(match);
  }
  return kept;
}

/** NHẬN BIẾT: distinct items in the notes that the transcript showed, told or not. */
export function recognizedCount(matches: CanvasMatch[], exceptItemId?: string): number {
  return matches.filter((match) => (match.kind === "told" || match.kind === "unconfirmed") && match.itemId !== exceptItemId).length;
}

const targetOf = (selection: ReplaySelection) => (selection.level === "primary" ? selection.targetItemId : null);

/** Every item with what became of it, in scenario order. `basis` is settled. */
export function buildItems(basis: RevealBasis, selection: ReplaySelection): RevealItem[] {
  const { state } = basis;
  const turnAt = new Map(basis.turns.map((turn) => [turn.index, turn]));
  const guarded = basis.turns.filter((turn) => turn.opennessDropped).map((turn) => turn.index);

  return basis.scenario.items.map((item) => {
    const toldAt = state.disclosed.find((entry) => entry.itemId === item.id)?.turn ?? null;
    const drop = state.ledger.find((entry) => entry.itemId === item.id);
    const hookTurn = drop ? turnAt.get(drop.droppedAt) : undefined;
    const next = drop ? turnAt.get(drop.droppedAt + 1) : undefined;
    const itemState: RevealItem["state"] = toldAt !== null ? "told" : item.id === targetOf(selection) ? "held" : "missed";
    return {
      id: item.id,
      content: item.content,
      path: item.path,
      state: itemState,
      toldTurn: toldAt,
      sampleQuestion: item.sample_question,
      // A flagged persona turn is evidence for nothing.
      hook:
        hookTurn && !hookTurn.flagged
          ? {
              turn: hookTurn.index,
              personaText: hookTurn.personaText,
              next: next?.learnerText ? { turn: next.index, learnerText: next.learnerText } : null,
            }
          : null,
      trustTurns: item.path === "trust" && itemState === "missed" ? guarded : [],
    };
  });
}

/** The most important item still locked: highest weight, then scenario order. */
export function topLockedItemId(scenario: Pick<Scenario, "items">, state: EngineState): string | null {
  const open = new Set(state.unlocked.map((entry) => entry.itemId));
  const [top] = scenario.items.filter((item) => !open.has(item.id)).sort((a, b) => b.weight - a.weight);
  return top?.id ?? null;
}

type Candidate = Omit<CommentSlot, "id">;

/** Fewest turns a slot of this type still needs to be worth a comment. */
const MIN_TURNS: Record<SlotType, number> = { praise: 1, leading: 1, hypothetical_future: 2, heard_not_followed: 1, habit: 1 };

/**
 * The comments code triggers from the ledger and the checked labels (addendum §3.3). The
 * generator writes their words and nothing else: it cannot add a comment or cite another turn.
 * Order: the grounded praise, then the faults by how many turns show them (ties: the earliest
 * turn first), three at most, each turn in one comment only; then the habit card. `basis` is settled.
 */
export function commentSlots(basis: RevealBasis, selection: ReplaySelection, matches: CanvasMatch[]): CommentSlot[] {
  const { scenario, state } = basis;
  const flagged = new Set(basis.turns.filter((turn) => turn.flagged).map((turn) => turn.index));
  const learnerTurns = basis.turns.filter((turn): turn is RevealTurn & { analysis: NonNullable<RevealTurn["analysis"]> } => turn.analysis !== null);
  const weightOf = new Map(scenario.items.map((item) => [item.id, item.weight]));
  const indexes = (turns: RevealTurn[]) => turns.map((turn) => turn.index);

  // Praise: the good question that opened the heaviest item, else the earliest good question.
  const good = learnerTurns.filter(
    (turn) => isGoodLabel(turn.analysis.label) && turn.analysis.grounded_turn_id !== null && !flagged.has(turn.analysis.grounded_turn_id),
  );
  const openedWeight = (turn: RevealTurn) => (turn.unlockedItemId ? weightOf.get(turn.unlockedItemId)! : 0);
  const [best] = [...good].sort((a, b) => openedWeight(b) - openedWeight(a) || a.index - b.index);

  const leading = learnerTurns.filter((turn) => turn.analysis.label === "leading");
  const hypothetical = learnerTurns.filter((turn) => turn.analysis.question_type === "hypothetical_future");

  // A hook the persona dropped and the very next question did not pick up.
  const ignored = state.ledger.filter((entry) => entry.ignoredAt !== null && !flagged.has(entry.droppedAt));
  const noted = ignored
    .flatMap((entry) => {
      const match = matches.find((candidate) => candidate.itemId === entry.itemId);
      // The replay target is left to the fixed diagnosis line.
      return match && entry.itemId !== targetOf(selection) ? [{ entry, match }] : [];
    })
    .sort((a, b) => weightOf.get(b.entry.itemId)! - weightOf.get(a.entry.itemId)! || a.match.range[0] - b.match.range[0]);

  const faults: Candidate[] = [
    {
      type: "leading",
      turns: indexes(leading),
      spans: leading.map((turn) => ({ turn: turn.index, text: sliceTokens(turn.learnerTokens ?? [], turn.analysis.introduced_span) ?? "" })),
    },
    { type: "hypothetical_future", turns: indexes(hypothetical) },
    ...(noted.length > 0
      ? [
          {
            type: "heard_not_followed" as const,
            // The cited note's turn first: a claim must cite it.
            turns: noted.map(({ entry }) => entry.ignoredAt!),
            canvas: {
              range: noted[0].match.range,
              text: sliceTokens(basis.canvasTokens, noted[0].match.range) ?? "",
              itemId: noted[0].entry.itemId,
            },
          },
        ]
      : []),
  ];
  const ordered: Candidate[] = [
    ...(best ? [{ type: "praise" as const, turns: [best.index] }] : []),
    // Array.sort is stable: equal counts and turns keep the order above.
    ...faults.sort((a, b) => b.turns.length - a.turns.length || Math.min(...a.turns) - Math.min(...b.turns)),
  ];

  const used = new Set<number>();
  const comments: Candidate[] = [];
  for (const candidate of ordered) {
    if (comments.length === MAX_COMMENTS) break;
    const turns = candidate.turns.filter((turn) => !used.has(turn));
    if (turns.length < MIN_TURNS[candidate.type]) continue;
    // The note comment is about one ignored hook: without that turn there is nothing to say.
    if (candidate.type === "heard_not_followed" && turns[0] !== candidate.turns[0]) continue;
    for (const turn of turns) used.add(turn);
    comments.push({ ...candidate, turns, spans: candidate.spans?.filter((span) => turns.includes(span.turn)) });
  }

  const habit: Candidate[] =
    ignored.length >= scenario.habit_threshold ? [{ type: "habit", turns: ignored.map((entry) => entry.ignoredAt!).sort((a, b) => a - b) }] : [];
  return [...comments, ...habit].map((slot, position) => ({ id: `S${position + 1}`, ...slot }));
}
