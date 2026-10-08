import { describe, expect, it } from "vitest";
import { selectReplay } from "@/engine/select-replay";
import type { HookEntry, RawAnalysis } from "@/engine/types";
import { DROPPED, a, chiThu, engineSession, told } from "../helpers/engine-fixtures";
import { basisOf, selectionOf } from "../helpers/reveal-fixtures";

/** Plays hand-written Call 1 outputs through the engine rules and selects the replay moment from what they left. */
function select(script: Partial<RawAnalysis>[]) {
  const session = engineSession();
  for (const analysis of script) session.turn(analysis);
  return { selection: selectionOf(basisOf(session)), state: session.state };
}

const tag = (itemId: string) => [a("tag", itemId)];

describe("selectReplay: three fixed transcripts (PRD §9.2)", () => {
  it("primary: forks after the turn that dropped an ignored hook of a locked follow-up item", () => {
    const { selection, state } = select([
      { topic_tags: tag("paid-app") },
      { prev_turn_verdict: DROPPED, topic_tags: tag("small-spend") },
      { prev_turn_verdict: DROPPED },
    ]);

    expect(state.ledger).toMatchObject([
      { itemId: "paid-app", droppedAt: 1, ignoredAt: 2 },
      { itemId: "small-spend", droppedAt: 2, ignoredAt: 3 },
    ]);
    // paid-app weighs 3, small-spend 2.
    expect(selection).toEqual({ level: "primary", forkAfterTurn: 1, targetItemId: "paid-app" });
  });

  it("fallback 1: with no ignored hook, forks just before the earliest leading question", () => {
    const { selection } = select([
      {},
      { label: "leading", introduced_span: [0, 2] },
      {},
      { label: "leading", introduced_span: [1, 1] },
    ]);
    expect(selection).toEqual({ level: "fallback1", forkAfterTurn: 1, leadingTurn: 2 });
  });

  it("fallback 2: with neither, there is no replay", () => {
    expect(select([{ topic_tags: tag("money-home") }, { prev_turn_verdict: told("money-home") }, {}]).selection).toEqual({ level: "none" });
  });

  it("gives the same answer every time", () => {
    const script: Partial<RawAnalysis>[] = [{ topic_tags: tag("paid-app") }, { prev_turn_verdict: DROPPED }, { label: "leading", introduced_span: [0, 0] }];
    expect(select(script).selection).toEqual(select(script).selection);
  });
});

describe("selectReplay: tie-breaks and exclusions", () => {
  it("prefers the heavier item even when its hook was dropped later", () => {
    const { selection } = select([
      { topic_tags: tag("small-spend") },
      { prev_turn_verdict: DROPPED, topic_tags: tag("paid-app") },
      { prev_turn_verdict: DROPPED },
    ]);
    expect(selection).toEqual({ level: "primary", forkAfterTurn: 2, targetItemId: "paid-app" });
  });

  it("at equal weight takes the hook that was dropped first", () => {
    const { selection } = select([
      { topic_tags: tag("work-fatigue") },
      { prev_turn_verdict: DROPPED, topic_tags: tag("small-spend") },
      { prev_turn_verdict: DROPPED },
    ]);
    expect(selection).toEqual({ level: "primary", forkAfterTurn: 1, targetItemId: "work-fatigue" });
  });

  it("at equal weight and equal turn takes scenario order", () => {
    const entry = (itemId: string): HookEntry => ({ itemId, droppedAt: 4, pickedAt: null, ignoredAt: 5, closedAt: null });
    const turns = [{ index: 5, label: "open" as const }];
    // small-spend comes before work-fatigue in the scenario; both weigh 2.
    for (const ledger of [
      [entry("work-fatigue"), entry("small-spend")],
      [entry("small-spend"), entry("work-fatigue")],
    ]) {
      expect(selectReplay({ scenario: chiThu, ledger, unlocked: [], turns })).toMatchObject({ targetItemId: "small-spend" });
    }
  });

  it("does not replay a hook that was picked up at once", () => {
    const { selection, state } = select([
      { topic_tags: tag("paid-app") },
      { prev_turn_verdict: DROPPED, hook_id: a("hook", "paid-app"), label: "open" },
    ]);
    expect(state.ledger).toMatchObject([{ itemId: "paid-app", pickedAt: 2, ignoredAt: null }]);
    expect(selection).toEqual({ level: "none" });
  });

  it("does not replay an ignored hook whose item opened later", () => {
    const { selection, state } = select([
      { topic_tags: tag("paid-app") },
      { prev_turn_verdict: DROPPED },
      { hook_id: a("hook", "paid-app"), label: "confirm_grounded", grounded_turn_id: 1 },
    ]);
    expect(state.unlocked).toEqual([{ itemId: "paid-app", turn: 3 }]);
    expect(state.ledger).toMatchObject([{ itemId: "paid-app", ignoredAt: 2, closedAt: 3 }]);
    expect(selection).toEqual({ level: "none" });
  });

  it("does not replay the ignored hook of a trust or surface item", () => {
    const { selection, state } = select([
      // Openness 4 is under installment's threshold, so the tag opens nothing and its hook is dropped.
      { topic_tags: tag("installment") },
      { prev_turn_verdict: DROPPED, label: "leading", introduced_span: [0, 1], topic_tags: tag("money-home") },
      { prev_turn_verdict: DROPPED },
    ]);
    expect(state.ledger).toMatchObject([
      { itemId: "installment", ignoredAt: 2 },
      { itemId: "money-home", ignoredAt: 3 },
    ]);
    expect(selection).toEqual({ level: "fallback1", forkAfterTurn: 1, leadingTurn: 2 });
  });

  it("never replays from a persona turn that broke a do-not-assert: the next candidate is taken", () => {
    const entry = (itemId: string, droppedAt: number): HookEntry => ({ itemId, droppedAt, pickedAt: null, ignoredAt: droppedAt + 1, closedAt: null });
    // paid-app (weight 3) would win, but its hook was dropped in turn 1, which was flagged.
    const ledger = [entry("paid-app", 1), entry("small-spend", 2), entry("work-fatigue", 3)];
    const turns = (flagged: number[], leading: number[] = []) =>
      [1, 2, 3, 4].map((index) => ({ index, label: leading.includes(index) ? ("leading" as const) : ("open" as const), flagged: flagged.includes(index) }));
    const select = (flagged: number[], leading: number[] = []) => selectReplay({ scenario: chiThu, ledger, unlocked: [], turns: turns(flagged, leading) });

    expect(select([])).toEqual({ level: "primary", forkAfterTurn: 1, targetItemId: "paid-app" });
    expect(select([1])).toEqual({ level: "primary", forkAfterTurn: 2, targetItemId: "small-spend" });
    expect(select([1, 2])).toEqual({ level: "primary", forkAfterTurn: 3, targetItemId: "work-fatigue" });
    // Every hook turn flagged: on to the leading question, then to no replay.
    expect(select([1, 2, 3], [4])).toEqual({ level: "fallback1", forkAfterTurn: 3, leadingTurn: 4 });
    expect(select([1, 2, 3])).toEqual({ level: "none" });
    // A flag on the turn that ignored the hook changes nothing: only the turn that dropped it counts.
    expect(select([2]).level === "primary" && select([2])).toMatchObject({ targetItemId: "paid-app" });
  });

  it("reads the flags from the stored turns when the reveal selects", () => {
    const session = engineSession();
    session.turn({ topic_tags: tag("paid-app") });
    session.turn({ prev_turn_verdict: DROPPED, topic_tags: tag("small-spend") });
    session.turn({ prev_turn_verdict: DROPPED });
    const basis = basisOf(session);
    const flagged = { ...basis, turns: basis.turns.map((turn) => (turn.index === 1 ? { ...turn, flagged: true } : turn)) };
    expect(selectionOf(basis)).toMatchObject({ targetItemId: "paid-app" });
    expect(selectionOf(flagged)).toEqual({ level: "primary", forkAfterTurn: 2, targetItemId: "small-spend" });
  });

  it("does not count a hook dropped in the last turn as ignored: nobody had a turn to pick it up", () => {
    const ledger: HookEntry[] = [{ itemId: "paid-app", droppedAt: 1, pickedAt: null, ignoredAt: null, closedAt: null }];
    expect(selectReplay({ scenario: chiThu, ledger, unlocked: [], turns: [{ index: 1, label: "open" }] })).toEqual({ level: "none" });
  });

  it("reads the label code left, so a leading label without evidence is not a leading turn", () => {
    expect(select([{ label: "leading", introduced_span: [40, 41] }]).selection).toEqual({ level: "none" });
  });
});
