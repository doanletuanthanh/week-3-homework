import type { ProgressSource } from "@/db/repo/sessions";
import type { Label } from "@/engine/types";

export type { ProgressSource };

/** What one session shows, in counts. */
export type SessionFacts = {
  sessionId: string;
  personaId: string;
  personaName: string;
  revealedAt: Date;
  told: number;
  total: number;
  /** Questions labelled `leading`. */
  leading: number;
  /** Items whose hook the persona dropped, with a question after it, and that were never told. */
  ignoredHints: number;
  /** The first leading question, preferring one the verifier agreed added new words. */
  leadingExample: string | null;
  /** The first question built on what the persona said. */
  groundedExample: string | null;
};

export type Trend = "better" | "same" | "worse";
export type Line = { key: "told" | "leading" | "ignored"; before: number; after: number; trend: Trend };

export type Comparison =
  | { kind: "single"; latest: SessionFacts }
  | { kind: "pair"; samePersona: boolean; before: SessionFacts; after: SessionFacts; lines: Line[]; pair: { before: string; after: string } | null };

const GROUNDED: ReadonlySet<Label> = new Set(["confirm_grounded", "boundary_probe"]);

/** Pure: computed from stored data only, no model call. */
export function factsOf(source: ProgressSource): SessionFacts {
  const { questions, reveal } = source;
  const labelled = (label: (value: Label) => boolean) => questions.filter((question) => question.analysis !== null && label(question.analysis.label));
  const leading = labelled((label) => label === "leading");
  const novelTurns = new Set(reveal.leading.filter((entry) => entry.novel).map((entry) => entry.turn));
  const novel = leading.find((question) => novelTurns.has(question.turn));
  return {
    sessionId: source.sessionId,
    personaId: source.personaId,
    personaName: source.personaName,
    revealedAt: source.revealedAt,
    told: reveal.counts.told,
    total: reveal.counts.total,
    leading: leading.length,
    // A hook dropped in the last reply had no question after it: nothing to follow up.
    ignoredHints: reveal.items.filter((item) => item.hook !== null && item.hook.next !== null && item.state !== "told").length,
    leadingExample: (novel ?? leading[0])?.text ?? null,
    groundedExample: labelled((label) => GROUNDED.has(label))[0]?.text ?? null,
  };
}

/** Higher is better for what the persona told, lower for the two habits. */
const trendOf = (before: number, after: number, higherIsBetter: boolean): Trend =>
  before === after ? "same" : after > before === higherIsBetter ? "better" : "worse";

/** Told as a share, so two personas with different numbers of items compare fairly. */
const toldShare = (facts: SessionFacts) => (facts.total > 0 ? facts.told / facts.total : 0);

/**
 * The newest session against a baseline: the previous one with the same persona, else the
 * learner's first session with a result. Null when there is no session; a single session when the
 * newest is also the first.
 */
export function compareProgress(newest: ProgressSource | null, previous: ProgressSource | null, first: ProgressSource | null): Comparison | null {
  if (!newest) return null;
  const baseline = previous ?? (first && first.sessionId !== newest.sessionId ? first : null);
  const after = factsOf(newest);
  if (!baseline) return { kind: "single", latest: after };
  const before = factsOf(baseline);
  const toldTrend = trendOf(toldShare(before), toldShare(after), true);
  return {
    kind: "pair",
    samePersona: baseline.personaId === newest.personaId,
    before,
    after,
    lines: [
      { key: "told", before: before.told, after: after.told, trend: toldTrend },
      { key: "leading", before: before.leading, after: after.leading, trend: trendOf(before.leading, after.leading, false) },
      { key: "ignored", before: before.ignoredHints, after: after.ignoredHints, trend: trendOf(before.ignoredHints, after.ignoredHints, false) },
    ],
    pair: before.leadingExample && after.groundedExample ? { before: before.leadingExample, after: after.groundedExample } : null,
  };
}
