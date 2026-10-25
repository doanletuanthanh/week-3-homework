import { CONTEXT_WINDOW_EXCHANGES, MEMORY_LIMITS } from "@/config/limits";
import type { TranscriptLine } from "./contexts";
import type { MemoryEntry, RawAnalysis } from "./types";

/**
 * Bounded context. Both turn calls see the last `CONTEXT_WINDOW_EXCHANGES` exchanges word for
 * word and older ones as the gists Call 1 wrote for them, one turn before they left the window.
 * An older exchange with no gist (a row written before memory, an empty answer) stays word for
 * word: correct, only less cheap.
 */

/** What older exchanges a call is handed: one gist per exchange, and the details the persona gave. */
export type SessionMemory = { earlier: { turn: number; gist: string }[]; claims: string[] };

export const NO_MEMORY: SessionMemory = { earlier: [], claims: [] };

/** The exchange Call 1 of turn `turnIndex` remembers: the oldest one of its window, or none. */
export function memoryTurnFor(turnIndex: number): number | null {
  const turn = turnIndex - CONTEXT_WINDOW_EXCHANGES;
  return turn >= 1 ? turn : null;
}

const clip = (text: string, chars: number) => text.trim().slice(0, chars).trim();

/**
 * Call 1's memory as code keeps it: only when an exchange was named, cut to the limits, with
 * empty strings dropped. Nothing is kept when nothing is left.
 */
export function acceptMemory(raw: RawAnalysis["memory"] | undefined, turn: number | null): MemoryEntry | null {
  if (turn === null || raw === undefined) return null;
  const gist = clip(raw.gist, MEMORY_LIMITS.gistChars);
  const claims = raw.claims
    .map((claim) => clip(claim, MEMORY_LIMITS.claimChars))
    .filter((claim) => claim !== "")
    .slice(0, MEMORY_LIMITS.claimsPerTurn);
  return gist === "" && claims.length === 0 ? null : { turn, gist, claims };
}

/**
 * Splits turns 0 to t-1 into what a call reads word for word and what it reads as memory. The
 * window is the last W exchanges, plus any older exchange that has no gist. The authored opening
 * line (turn 0) is dropped once it is out of the window. Claims are deduplicated by their trimmed
 * text and the newest `claimsKept` are kept, oldest first. With no entries at all (a session from
 * before memory, or one not past the window yet) the transcript is read whole, as it always was.
 */
export function splitContext(transcript: TranscriptLine[], entries: MemoryEntry[]): { window: TranscriptLine[]; memory: SessionMemory } {
  if (entries.length === 0) return { window: transcript, memory: NO_MEMORY };
  const firstInWindow = (transcript.at(-1)?.index ?? 0) - CONTEXT_WINDOW_EXCHANGES + 1;
  const older = [...entries].filter((entry) => entry.turn < firstInWindow).sort((a, b) => a.turn - b.turn);
  const gists = new Map(older.filter((entry) => entry.gist.trim() !== "").map((entry) => [entry.turn, entry.gist.trim()]));

  const window: TranscriptLine[] = [];
  const earlier: SessionMemory["earlier"] = [];
  for (const line of transcript) {
    const gist = gists.get(line.index);
    if (line.index >= firstInWindow) window.push(line);
    else if (gist !== undefined) earlier.push({ turn: line.index, gist });
    else if (line.index !== 0) window.push(line);
  }

  const seen = new Set<string>();
  const newestFirst: string[] = [];
  for (const claim of older.flatMap((entry) => entry.claims).reverse()) {
    const text = claim.trim();
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    newestFirst.push(text);
  }
  return { window, memory: { earlier, claims: newestFirst.slice(0, MEMORY_LIMITS.claimsKept).reverse() } };
}
