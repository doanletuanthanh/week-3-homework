import { resolveAlias } from "./aliases";
import { diagnose } from "./diagnosis";
import { buildItems, commentSlots, recognizedCount, settle, topLockedItemId } from "./reveal-compute";
import type {
  CheckKind,
  CheckVerdict,
  CommentSlot,
  DraftClaim,
  LeadingTurn,
  ReplaySelection,
  RevealBasis,
  RevealClaim,
  RevealJson,
  RevealParts,
  SlotType,
  VerifierCheck,
} from "./reveal-types";
import { isValidRange, sliceTokens, type TokenRange } from "./tokens";
import { LABELS, type EngineState, type Label } from "./types";

/** A claim as the generator wrote it: every reference in it is untrusted. */
export type RawClaim = {
  slot: string;
  text: string;
  cited_turns: number[];
  item_id: string | null;
  canvas_range: number[] | null;
  suggested_question: string | null;
};

/** Comments that come as a pair: the learner's question and a better one. */
const NEEDS_SUGGESTION: ReadonlySet<SlotType> = new Set(["leading", "hypothetical_future", "heard_not_followed"]);

const sameRange = (a: TokenRange, b: TokenRange) => a[0] === b[0] && a[1] === b[1];

/** The ledger entry of the replay target's hook, when there is a target. */
function targetHook(state: EngineState, selection: ReplaySelection) {
  if (selection.level !== "primary") return null;
  return state.ledger.find((entry) => entry.itemId === selection.targetItemId) ?? null;
}

/**
 * Resolves every reference of the generator's claims; a claim with a broken one is dropped whole
 * (FR-21). A claim answers one slot code opened, cites only that slot's turns, and a slot gets
 * one claim. A claim about the replay target (its item, the turn of its hook, or the leading turn
 * of fallback 1) is marked `sealed`, whatever its text says. The habit card is sealed whenever
 * the target's ignored hook is one of the hooks its slot counts, whichever turns the claim cites:
 * its words are the generator's and may describe that hook. `basis` is settled.
 */
export function resolveClaims(raw: RawClaim[], context: { basis: RevealBasis; slots: CommentSlot[]; selection: ReplaySelection }): DraftClaim[] {
  const { basis, slots, selection } = context;
  const { scenario, canvasTokens } = basis;
  const hook = targetHook(basis.state, selection);
  const hookTurn = hook?.droppedAt ?? null;
  const bySlot = new Map<string, Omit<DraftClaim, "id">>();

  for (const claim of raw) {
    const slot = slots.find((candidate) => candidate.id === claim.slot?.trim());
    if (!slot || bySlot.has(slot.id)) continue;
    const text = claim.text?.trim();
    if (!text) continue;

    let citedTurns = [...new Set(claim.cited_turns)].sort((a, b) => a - b);
    if (citedTurns.some((turn) => !slot.turns.includes(turn))) continue;

    let itemId: string | null = null;
    if (claim.item_id !== null) {
      itemId = resolveAlias(scenario, "item", claim.item_id);
      if (itemId === null) continue;
    }

    let canvasRange: TokenRange | null = null;
    if (claim.canvas_range !== null) {
      if (!isValidRange(claim.canvas_range, canvasTokens.length)) continue;
      canvasRange = [claim.canvas_range[0], claim.canvas_range[1]];
    }
    if (slot.canvas) {
      // The note comment is about one note and one item: the ones code matched.
      if (canvasRange === null || !sameRange(canvasRange, slot.canvas.range)) continue;
      if (itemId !== null && itemId !== slot.canvas.itemId) continue;
      itemId = slot.canvas.itemId;
      if (!citedTurns.includes(slot.turns[0])) continue;
      // One note, one ignored hook: the question right after it is the only turn the comment is about.
      citedTurns = [slot.turns[0]];
    }
    // FR-20: every comment cites a turn or a stretch of the notes.
    if (citedTurns.length === 0 && canvasRange === null) continue;

    const suggestedQuestion = NEEDS_SUGGESTION.has(slot.type) ? claim.suggested_question?.trim() || null : null;
    if (NEEDS_SUGGESTION.has(slot.type) && suggestedQuestion === null) continue;
    // The better question rewrites the slot's first turn, so the claim must cite that turn: the
    // pair shown is then that turn's question and its rewrite, and sealing sees the turn.
    if (NEEDS_SUGGESTION.has(slot.type) && citedTurns[0] !== slot.turns[0]) continue;

    const sealed =
      selection.level === "primary"
        ? itemId === selection.targetItemId ||
          (hookTurn !== null && citedTurns.includes(hookTurn)) ||
          (slot.type === "habit" && hook !== null && hook.ignoredAt !== null && slot.turns.includes(hook.ignoredAt))
        : selection.level === "fallback1" && citedTurns.includes(selection.leadingTurn);

    bySlot.set(slot.id, { slot: slot.type, text, citedTurns, itemId, canvasRange, suggestedQuestion, sealed });
  }

  return slots.flatMap((slot) => (bySlot.has(slot.id) ? [bySlot.get(slot.id)!] : [])).map((claim, position) => ({ id: `C${position + 1}`, ...claim }));
}

const CLAIM_CHECK: Record<SlotType, CheckKind> = {
  praise: "praise",
  leading: "comment",
  hypothetical_future: "comment",
  heard_not_followed: "comment",
  habit: "habit",
};

/**
 * Everything the verifier must confirm before it is shown or counted (addendum §2.5), in a fixed
 * order, so the same frozen data always gives the same list and a stored answer finds its check.
 * `basis` is settled.
 */
export function buildChecks(basis: RevealBasis, claims: DraftClaim[]): VerifierCheck[] {
  const { state } = basis;
  const checks: Omit<VerifierCheck, "id">[] = [];
  const add = (kind: CheckKind, fields: Partial<Omit<VerifierCheck, "id" | "kind">>) =>
    checks.push({ kind, turn: null, itemId: null, claimId: null, text: "", ...fields });

  for (const entry of state.unlocked) add("unlock", { turn: entry.turn, itemId: entry.itemId });
  for (const entry of state.disclosed) add("disclosure", { turn: entry.turn, itemId: entry.itemId });
  for (const turn of basis.turns) {
    if (turn.analysis?.label !== "leading") continue;
    add("leading_novelty", { turn: turn.index, text: sliceTokens(turn.learnerTokens ?? [], turn.analysis.introduced_span) ?? "" });
  }
  const flagged = new Set(basis.turns.filter((turn) => turn.flagged).map((turn) => turn.index));
  for (const entry of state.ledger) {
    // A hook dropped in a flagged persona turn is evidence for nothing: nobody is asked about it.
    if (entry.ignoredAt !== null && !flagged.has(entry.droppedAt)) add("hook_ignored", { turn: entry.droppedAt, itemId: entry.itemId });
  }
  for (const claim of claims) {
    add(CLAIM_CHECK[claim.slot], { turn: claim.citedTurns[0] ?? null, itemId: claim.itemId, claimId: claim.id, text: claim.text });
  }
  for (const claim of claims) {
    if (claim.suggestedQuestion !== null) {
      add("suggested_question", { turn: claim.citedTurns[0] ?? null, claimId: claim.id, text: claim.suggestedQuestion });
    }
  }
  return checks.map((check, position) => ({ id: `V${position + 1}`, ...check }));
}

/** A verifier answer as the model wrote it. */
export type RawCheckVerdict = { claim_id: string; verdict: string; reason: string; label: string | null };

/** Keeps the verifier's first answer to each check that exists; anything else it wrote is dropped. */
export function resolveVerdicts(raw: RawCheckVerdict[], checks: VerifierCheck[]): CheckVerdict[] {
  const known = new Set(checks.map((check) => check.id));
  const verdicts = new Map<string, CheckVerdict>();
  for (const entry of raw) {
    const id = entry.claim_id?.trim();
    if (!known.has(id) || verdicts.has(id)) continue;
    const label = LABELS.includes(entry.label as Label) ? (entry.label as Label) : null;
    verdicts.set(id, { id, agree: entry.verdict === "agree", label, reason: entry.reason ?? "" });
  }
  return [...verdicts.values()];
}

/**
 * The frozen result of a reveal, from the frozen session and the processed output of the three
 * calls. Pure: the same input always gives the same result, so a run that resumes after a crash
 * assembles exactly what the first run would have. A missing part is a failed call.
 *
 * What the verifier decides (addendum §2.5): a claim, a praise, a suggested question or a leading
 * mark it did not agree with is not shown; an unlock or a disclosure it disagreed with keeps its
 * credit and is only counted.
 */
export function assembleReveal(unsettled: RevealBasis, selection: ReplaySelection, parts: RevealParts): RevealJson {
  const basis = settle(unsettled, parts.judge);
  const { scenario, state } = basis;
  const judge = parts.judge?.ok ? parts.judge : null;
  const generator = parts.generator?.ok ? parts.generator : null;
  const verifier = parts.verifier?.ok ? parts.verifier : null;

  const matches = judge?.matches ?? [];
  const drafts = generator?.claims ?? [];
  const checks = buildChecks(basis, drafts);
  const verdictOf = new Map((verifier?.verdicts ?? []).map((verdict) => [verdict.id, verdict]));
  // Default deny: only an explicit "agree" from a verifier that ran lets something through.
  const agreed = (check: VerifierCheck | undefined) => check !== undefined && verdictOf.get(check.id)?.agree === true;
  const find = (kind: CheckKind, where: Partial<VerifierCheck>) =>
    checks.find((check) => check.kind === kind && Object.entries(where).every(([key, value]) => check[key as keyof VerifierCheck] === value));

  const novel = (turn: number) => agreed(find("leading_novelty", { turn }));
  const ignoredAgreed = (itemId: string) => agreed(find("hook_ignored", { itemId }));
  const turnAt = new Map(basis.turns.map((turn) => [turn.index, turn]));

  const leading: LeadingTurn[] = basis.turns.flatMap((turn) => {
    const span = turn.analysis?.label === "leading" ? turn.analysis.introduced_span : null;
    if (!span) return [];
    return [{ turn: turn.index, span, spanText: sliceTokens(turn.learnerTokens ?? [], span) ?? "", novel: novel(turn.index) }];
  });

  // The questions that ignored a hook, as far as the verifier agreed they did.
  const ignoringTurns = new Set(state.ledger.filter((entry) => entry.ignoredAt !== null && ignoredAgreed(entry.itemId)).map((entry) => entry.ignoredAt!));
  const agreedIgnored = ignoringTurns.size;
  const claims: RevealClaim[] = drafts.map((draft) => {
    // A leading comment may only point at turns whose added words the verifier found new, and its
    // pair is about its first turn: when that one was not new, the comment is not shown at all.
    // The habit card likewise keeps only the turns the verifier agreed ignored a hook.
    const citedTurns =
      draft.slot === "leading" ? draft.citedTurns.filter(novel) : draft.slot === "habit" ? draft.citedTurns.filter((turn) => ignoringTurns.has(turn)) : draft.citedTurns;
    const suggestion = find("suggested_question", { claimId: draft.id });
    const suggestionOk = suggestion === undefined || (agreed(suggestion) && verdictOf.get(suggestion.id)?.label !== "leading");
    const evidenceOk =
      draft.slot === "leading"
        ? draft.citedTurns.length > 0 && novel(draft.citedTurns[0])
        : draft.slot === "heard_not_followed"
          ? draft.itemId !== null && ignoredAgreed(draft.itemId)
          : draft.slot === "habit"
            ? agreedIgnored >= scenario.habit_threshold && citedTurns.length > 0
            : true;
    return {
      ...draft,
      citedTurns,
      quote: turnAt.get(citedTurns[0])?.learnerText ?? null,
      canvasQuote: draft.canvasRange ? sliceTokens(basis.canvasTokens, draft.canvasRange) : null,
      shown: agreed(checks.find((check) => check.claimId === draft.id && check.kind !== "suggested_question")) && suggestionOk && evidenceOk,
    };
  });

  const target = selection.level === "primary" ? selection.targetItemId : null;
  const diagnosisKey = diagnose({
    level: selection.level,
    verifierAgrees: selection.level === "primary" ? ignoredAgreed(selection.targetItemId) : selection.level === "fallback1" && novel(selection.leadingTurn),
    notesMatchTarget: target !== null && matches.some((match) => match.itemId === target),
  });

  const stats: RevealJson["verifierChecks"] = verifier ? {} : null;
  if (stats) {
    for (const check of checks) {
      const verdict = verdictOf.get(check.id);
      if (!verdict) continue;
      const entry = (stats[check.kind] ??= { agree: 0, disagree: 0 });
      if (verdict.agree) entry.agree += 1;
      else entry.disagree += 1;
    }
  }

  return {
    replay: selection,
    failed: { judge: judge === null, generator: generator === null, verifier: verifier === null },
    counts: {
      told: state.disclosed.length,
      total: scenario.items.length,
      revealedCount: new Set([...state.ledger, ...state.disclosed].map((entry) => entry.itemId)).size,
      recognizedFull: judge ? recognizedCount(matches) : null,
    },
    canvasEmpty: basis.canvasTokens.length === 0,
    items: buildItems(basis, selection),
    canvasMatches: matches,
    leading,
    slotCount: commentSlots(basis, selection, matches).length,
    claims,
    diagnosisKey,
    sampleItemId: selection.level === "none" ? topLockedItemId(scenario, state) : null,
    verifierChecks: stats,
  };
}
