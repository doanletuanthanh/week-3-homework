import { describe, expect, it } from "vitest";
import { diagnose } from "@/engine/diagnosis";
import type { CheckKind, RevealParts } from "@/engine/reveal-types";
import { DIAGNOSIS } from "@/strings/product-strings";
import { engineSession } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, generatedClaims, judgedNotes, playedSession, verifierFor } from "../helpers/reveal-fixtures";

describe("diagnose: the five branches of Màn 6 item 2", () => {
  it.each([
    ["primary", true, true, "heard_not_followed"],
    ["primary", true, false, "changed_topic"],
    ["primary", false, true, "try_from_here"],
    ["primary", false, false, "try_from_here"],
    ["fallback1", true, false, "added_own_idea"],
    ["fallback1", false, false, "try_differently"],
    // The notes play no part in fallback 1: it has no target item.
    ["fallback1", true, true, "added_own_idea"],
  ] as const)("%s, verifier agrees: %s, notes match the target: %s → %s", (level, verifierAgrees, notesMatchTarget, key) => {
    expect(diagnose({ level, verifierAgrees, notesMatchTarget })).toBe(key);
    expect(DIAGNOSIS[key]).toBeTruthy();
  });

  it("has no line when there is no replay", () => {
    expect(diagnose({ level: "none", verifierAgrees: true, notesMatchTarget: true })).toBeNull();
  });
});

/** The diagnosis a whole reveal ends with, for the primary fixture (target paid-app, hook at turn 2). */
function primaryDiagnosis(notes: string, change: (parts: RevealParts) => RevealParts) {
  const basis = basisOf(playedSession(), notes);
  const judge = notes === NOTES ? judgedNotes() : { ok: true as const, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches: [] };
  const parts: RevealParts = { judge, generator: generatedClaims(basis, judge) };
  return assemble(basis, change({ ...parts, verifier: verifierFor(basis, parts) })).diagnosisKey;
}

const disagreeing = (kind: CheckKind) => (parts: RevealParts) => ({
  ...parts,
  verifier: verifierFor(basisOf(playedSession(), NOTES), parts, (check) => check.kind === kind),
});

describe("the diagnosis of an assembled reveal: verifier agrees, disagrees, fails", () => {
  it("primary, verifier agrees the hook was ignored, the notes hold the target → heard, not followed", () => {
    expect(primaryDiagnosis(NOTES, (parts) => parts)).toBe("heard_not_followed");
  });

  it("primary, verifier agrees, the notes do not hold the target → changed topic", () => {
    expect(primaryDiagnosis("kế toán, ở trọ", (parts) => parts)).toBe("changed_topic");
  });

  it("primary, verifier agrees, empty notes → changed topic", () => {
    expect(primaryDiagnosis("", (parts) => parts)).toBe("changed_topic");
  });

  it("primary, verifier agrees, the end judge failed → changed topic", () => {
    expect(primaryDiagnosis(NOTES, (parts) => ({ ...parts, judge: { ok: false } }))).toBe("changed_topic");
  });

  it("primary, verifier disagrees that the hook was ignored → try from here", () => {
    expect(primaryDiagnosis(NOTES, disagreeing("hook_ignored"))).toBe("try_from_here");
  });

  it("primary, verifier failed → try from here", () => {
    expect(primaryDiagnosis(NOTES, (parts) => ({ ...parts, verifier: { ok: false } }))).toBe("try_from_here");
    expect(primaryDiagnosis(NOTES, (parts) => ({ ...parts, verifier: undefined }))).toBe("try_from_here");
  });

  it("primary, the verifier answered nothing about the hook → try from here", () => {
    expect(primaryDiagnosis(NOTES, (parts) => ({ ...parts, verifier: { ok: true, verdicts: [] } }))).toBe("try_from_here");
  });

  function fallbackDiagnosis(change: (parts: RevealParts) => RevealParts) {
    const session = engineSession();
    session.turn({});
    session.turn({ label: "leading", introduced_span: [1, 2] });
    const basis = basisOf(session);
    const parts: RevealParts = { judge: { ok: true, verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] }, matches: [] }, generator: generatedClaims(basis) };
    const reveal = assemble(basis, change({ ...parts, verifier: verifierFor(basis, parts) }));
    expect(reveal.replay).toEqual({ level: "fallback1", forkAfterTurn: 1, leadingTurn: 2 });
    return { key: reveal.diagnosisKey, basis, parts };
  }

  it("fallback 1, verifier agrees the added words were new → added own idea", () => {
    expect(fallbackDiagnosis((parts) => parts).key).toBe("added_own_idea");
  });

  it("fallback 1, verifier disagrees or failed → try differently", () => {
    const { basis, parts } = fallbackDiagnosis((unchanged) => unchanged);
    expect(fallbackDiagnosis(() => ({ ...parts, verifier: verifierFor(basis, parts, (check) => check.kind === "leading_novelty") })).key).toBe("try_differently");
    expect(fallbackDiagnosis((failed) => ({ ...failed, verifier: { ok: false } })).key).toBe("try_differently");
  });

  it("no replay moment → no diagnosis, and the heaviest locked item's sample question stands in", () => {
    const session = engineSession();
    session.turn({});
    const basis = basisOf(session);
    const reveal = assemble(basis, {});
    expect(reveal.replay).toEqual({ level: "none" });
    expect(reveal.diagnosisKey).toBeNull();
    expect(reveal.sampleItemId).toBe("paid-app");
  });
});
