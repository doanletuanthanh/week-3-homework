import type { UnlockPath } from "@/scenario/schema";
import { recognizedCount } from "./reveal-compute";
import type { CanvasMatchKind, DiagnosisKey, RevealClaim, RevealJson, SlotType } from "./reveal-types";
import { tokenOffsets } from "./tokens";

/**
 * The only way reveal data reaches a browser. Default deny: a session that is `done` gets
 * everything; one that is `revealed` or `replaying` gets everything except what would tell the
 * learner the replay target (PRD Màn 6, sealing rules); any other status gets nothing. Pages and
 * route handlers send what these functions return, never the stored `reveal_json`.
 */

export type BrowserClaim = {
  id: string;
  type: SlotType;
  text: string;
  turns: number[];
  /** The learner's question of the first cited turn, word for word. */
  quote: string | null;
  /** A leading comment: the words the learner added in that question. */
  addedWords: string | null;
  canvasQuote: string | null;
  suggestedQuestion: string | null;
};

export type NoteSegment = {
  text: string;
  /** Set for a stretch that was matched; plain text has none. */
  match: { kind: CanvasMatchKind; itemContent: string | null; turn: number | null } | null;
};

export type BrowserRecognized = { state: "count"; value: number } | { state: "empty" } | { state: "ungraded" };

export type BrowserReveal = {
  /** `offer`: the replay is still ahead and its target is held back. `done`: nothing is held. */
  mode: "offer" | "done";
  guess: number;
  told: number;
  total: number;
  /** Items held back for the replay: 0 or 1. */
  held: number;
  missed: number;
  recognized: BrowserRecognized;
  replay:
    | {
        level: "primary" | "fallback1";
        /** The turn the replay starts at. */
        returnTurn: number;
        diagnosis: { key: DiagnosisKey; turn: number };
        /** The target item, once the session is `done`. */
        target: { content: string; sampleQuestion: string } | null;
      }
    | { level: "none"; sampleQuestion: string | null };
  toldItems: { content: string; turn: number }[];
  missedItems: {
    content: string;
    path: UnlockPath;
    sampleQuestion: string;
    hook: { turn: number; personaText: string; next: { turn: number; learnerText: string } | null } | null;
    trustTurns: number[];
  }[];
  /** The frozen notes cut into plain and matched stretches; null when the notes are empty. */
  notes: NoteSegment[] | null;
  takeaway: {
    praise: BrowserClaim | null;
    comments: BrowserClaim[];
    habit: BrowserClaim | null;
    /** Nothing to take home, and nothing held back either: the fixed empty line is shown. */
    emptyLine: boolean;
  };
};

export type BrowserTurn = {
  index: number;
  learnerText: string | null;
  personaText: string;
  /** Set when the question is shown as leading: where the added words sit in `learnerText`. */
  leading: { start: number; end: number } | null;
};

type Access = "open" | "sealed" | "none";

function accessOf(status: string): Access {
  if (status === "done") return "open";
  return status === "revealed" || status === "replaying" ? "sealed" : "none";
}

/** Turns whose marks would point at the replay moment: the target's hook turn, or the leading turn of fallback 1. */
function sealedTurns(reveal: RevealJson): number[] {
  const { replay } = reveal;
  if (replay.level === "fallback1") return [replay.leadingTurn];
  if (replay.level === "primary") return [replay.forkAfterTurn];
  return [];
}

function recognizedOf(reveal: RevealJson, exceptItemId?: string): BrowserRecognized {
  if (reveal.failed.judge) return { state: "ungraded" };
  if (reveal.canvasEmpty) return { state: "empty" };
  return { state: "count", value: recognizedCount(reveal.canvasMatches, exceptItemId) };
}

function notesOf(canvasText: string, reveal: RevealJson, heldItemId: string | null): NoteSegment[] | null {
  if (reveal.canvasEmpty) return null;
  const offsets = tokenOffsets(canvasText);
  const itemOf = new Map(reveal.items.map((item) => [item.id, item]));
  const segments: NoteSegment[] = [];
  let cursor = 0;
  for (const match of reveal.canvasMatches) {
    // The stretch that matches the held item is left as plain text.
    if (match.itemId !== null && match.itemId === heldItemId) continue;
    const start = offsets[match.range[0]]?.start;
    const end = offsets[match.range[1]]?.end;
    if (start === undefined || end === undefined || start < cursor) continue;
    if (start > cursor) segments.push({ text: canvasText.slice(cursor, start), match: null });
    const item = match.itemId === null ? undefined : itemOf.get(match.itemId);
    segments.push({
      text: canvasText.slice(start, end),
      match: { kind: match.kind, itemContent: item?.content ?? null, turn: match.kind === "told" ? (item?.toldTurn ?? null) : (item?.hook?.turn ?? null) },
    });
    cursor = end;
  }
  if (cursor < canvasText.length) segments.push({ text: canvasText.slice(cursor), match: null });
  return segments;
}

/** What a browser may see of a session's reveal; null when it may see none of it yet. */
export function toBrowserReveal(input: { status: string; guess: number | null; canvasText: string; reveal: RevealJson | null }): BrowserReveal | null {
  const { status, guess, canvasText, reveal } = input;
  const access = accessOf(status);
  if (access === "none" || reveal === null || guess === null) return null;
  const open = access === "open";

  const { replay } = reveal;
  const held = reveal.items.find((item) => item.state === "held") ?? null;
  const hidden = open ? [] : sealedTurns(reveal);
  const visible = (claim: RevealClaim) => claim.shown && (open || !claim.sealed);
  const spanOf = new Map(reveal.leading.filter((turn) => turn.novel).map((turn) => [turn.turn, turn.spanText]));

  const toClaim = (claim: RevealClaim): BrowserClaim => ({
    id: claim.id,
    type: claim.slot,
    text: claim.text,
    turns: claim.citedTurns,
    quote: claim.quote,
    addedWords: claim.slot === "leading" ? (spanOf.get(claim.citedTurns[0]) ?? null) : null,
    canvasQuote: claim.canvasQuote,
    suggestedQuestion: claim.suggestedQuestion,
  });
  const shown = reveal.claims.filter(visible);
  const comments = shown.filter((claim) => claim.slot !== "praise" && claim.slot !== "habit").map(toClaim);
  const habit = shown.find((claim) => claim.slot === "habit");
  const praise = shown.find((claim) => claim.slot === "praise");
  const withheld = reveal.claims.some((claim) => claim.shown && !visible(claim));

  const missed = reveal.items.filter((item) => item.state === "missed");
  const sampleItem = reveal.items.find((item) => item.id === reveal.sampleItemId);

  return {
    mode: open ? "done" : "offer",
    guess,
    told: reveal.counts.told,
    total: reveal.counts.total,
    held: held ? 1 : 0,
    missed: missed.length,
    recognized: recognizedOf(reveal, open ? undefined : held?.id),
    replay:
      replay.level === "none"
        ? { level: "none", sampleQuestion: sampleItem?.sampleQuestion ?? null }
        : {
            level: replay.level,
            returnTurn: replay.forkAfterTurn + 1,
            diagnosis: { key: reveal.diagnosisKey!, turn: replay.level === "primary" ? replay.forkAfterTurn : replay.leadingTurn },
            target: open && held ? { content: held.content, sampleQuestion: held.sampleQuestion } : null,
          },
    toldItems: reveal.items.filter((item) => item.state === "told").map((item) => ({ content: item.content, turn: item.toldTurn! })),
    missedItems: missed.map((item) => ({
      content: item.content,
      path: item.path,
      sampleQuestion: item.sampleQuestion,
      hook: item.hook,
      trustTurns: item.trustTurns.filter((turn) => !hidden.includes(turn)),
    })),
    notes: notesOf(canvasText, reveal, open ? null : (held?.id ?? null)),
    takeaway: {
      praise: praise ? toClaim(praise) : null,
      comments,
      habit: habit ? toClaim(habit) : null,
      emptyLine: comments.length === 0 && !habit && !withheld,
    },
  };
}

/**
 * The main transcript for a browser. Leading marks appear only once the reveal may be seen, only
 * on questions whose added words the verifier found new, and never on the turn the replay is about
 * while the session is not `done`. Before the reveal it is the two speakers' words and no more.
 */
export function toBrowserTranscript(
  turns: { index: number; learnerText: string | null; personaText: string }[],
  reveal: RevealJson | null,
  status: string,
): BrowserTurn[] {
  const access = reveal === null ? "none" : accessOf(status);
  const hidden = access === "sealed" && reveal ? sealedTurns(reveal) : [];
  const marked = access === "none" || !reveal ? [] : reveal.leading.filter((turn) => turn.novel && !hidden.includes(turn.turn));
  const spans = new Map(marked.map((turn) => [turn.turn, turn.span]));

  return turns.map((turn) => {
    const span = spans.get(turn.index);
    const offsets = span && turn.learnerText !== null ? tokenOffsets(turn.learnerText) : [];
    const first = span ? offsets[span[0]] : undefined;
    const last = span ? offsets[span[1]] : undefined;
    return {
      index: turn.index,
      learnerText: turn.learnerText,
      personaText: turn.personaText,
      leading: first && last ? { start: first.start, end: last.end } : null,
    };
  });
}

/** The result line of a session in a list: numbers exist for a `done` session only. */
export function toBrowserResult(status: string, reveal: RevealJson | null): { told: number; total: number; recognized: BrowserRecognized } | null {
  if (accessOf(status) !== "open" || reveal === null) return null;
  return { told: reveal.counts.told, total: reveal.counts.total, recognized: recognizedOf(reveal) };
}
