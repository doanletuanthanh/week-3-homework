import { describe, expect, it } from "vitest";
import { decideUnlock } from "@/engine/unlock";
import { initialState, type CheckedAnalysis, type EngineState } from "@/engine/types";
import { a, chiThu, engineSession, unlockedIds } from "../helpers/engine-fixtures";

const DROPPED = { hook_dropped: true, disclosed_item_ids: [], violations: [] };
const paidAppTag = { topic_tags: [a("tag", "paid-app")] };
const paidAppHook = a("hook", "paid-app");

/** Turn 1 touches the paid-app tag, so the engine asks the persona to drop that hook. */
function sessionWithHookSelected() {
  const session = engineSession();
  const plan = session.turn(paidAppTag);
  expect(plan.hookToDrop).toBe("paid-app");
  expect(plan.unlockedItemId).toBeNull();
  return session;
}

describe("unlock gate: follow-up path", () => {
  it("does not open while the hook has no drop verdict", () => {
    const session = sessionWithHookSelected();

    // The learner follows up perfectly, but no verdict says the persona dropped the hook.
    const plan = session.turn({ hook_id: paidAppHook, label: "confirm_grounded", grounded_turn_id: 1 });

    expect(plan.unlockedItemId).toBeNull();
    expect(plan.analysis.hook_item_id).toBeNull();
    expect(unlockedIds(session.state)).toEqual([]);
  });

  it("opens at t+1 when the verdict for turn t says the hook was dropped", () => {
    const session = sessionWithHookSelected();

    const plan = session.turn({
      prev_turn_verdict: DROPPED,
      hook_id: paidAppHook,
      label: "confirm_grounded",
      grounded_turn_id: 1,
    });

    expect(plan.unlockedItemId).toBe("paid-app");
    expect(plan.stateAfter.unlocked).toEqual([{ itemId: "paid-app", turn: 2 }]);
    expect(plan.stateAfter.ledger).toEqual([
      { itemId: "paid-app", droppedAt: 1, pickedAt: 2, ignoredAt: null, closedAt: 2 },
    ]);
  });

  it("still opens when the hook is picked up several turns late", () => {
    const session = sessionWithHookSelected();
    session.turn({ prev_turn_verdict: DROPPED }); // turn 2: asks about something else
    session.turn(); // turn 3
    expect(session.state.ledger).toEqual([
      { itemId: "paid-app", droppedAt: 1, pickedAt: null, ignoredAt: 2, closedAt: null },
    ]);

    const plan = session.turn({ hook_id: paidAppHook, label: "boundary_probe", grounded_turn_id: 1 });

    expect(plan.unlockedItemId).toBe("paid-app");
    expect(plan.stateAfter.ledger).toEqual([
      { itemId: "paid-app", droppedAt: 1, pickedAt: 4, ignoredAt: 2, closedAt: 4 },
    ]);
  });

  it("does not open when grounded_turn_id is not the turn that dropped the hook", () => {
    const session = sessionWithHookSelected();
    session.turn({ prev_turn_verdict: DROPPED });

    const plan = session.turn({ hook_id: paidAppHook, label: "confirm_grounded", grounded_turn_id: 2 });

    expect(plan.unlockedItemId).toBeNull();
    // The pick-up itself is still recorded: the hook was picked, the rule just did not hold.
    expect(plan.stateAfter.ledger[0]).toMatchObject({ pickedAt: 3, closedAt: null });
  });

  it("does not open on a label that is not good, even with the right hook and turn", () => {
    for (const label of ["open", "leading"] as const) {
      const session = sessionWithHookSelected();
      const plan = session.turn({
        prev_turn_verdict: DROPPED,
        hook_id: paidAppHook,
        label,
        grounded_turn_id: 1,
        introduced_span: [0, 1],
      });
      expect(plan.unlockedItemId).toBeNull();
    }
  });

  it("does not open when a good label lost its evidence and was downgraded", () => {
    const session = sessionWithHookSelected();
    const plan = session.turn({ prev_turn_verdict: DROPPED, hook_id: paidAppHook, label: "confirm_grounded", grounded_turn_id: 0 });
    expect(plan.analysis.label).toBe("open");
    expect(plan.unlockedItemId).toBeNull();
  });

  it("cannot be picked up again once its item is open", () => {
    const session = sessionWithHookSelected();
    session.turn({ prev_turn_verdict: DROPPED, hook_id: paidAppHook, label: "confirm_grounded", grounded_turn_id: 1 });

    const plan = session.turn({ hook_id: paidAppHook, label: "confirm_grounded", grounded_turn_id: 1 });

    expect(plan.analysis.hook_item_id).toBeNull();
    expect(plan.unlockedItemId).toBeNull();
  });
});

describe("unlock gate: surface, past-story and trust paths", () => {
  it("opens a surface item when its tag is touched without leading", () => {
    const plan = engineSession().turn({ topic_tags: [a("tag", "money-home")], question_type: "closed" });
    expect(plan.unlockedItemId).toBe("money-home");
  });

  it("does not open a surface item on a leading question", () => {
    const plan = engineSession().turn({ topic_tags: [a("tag", "money-home")], label: "leading", introduced_span: [0, 1] });
    expect(plan.unlockedItemId).toBeNull();
  });

  it("opens a past-story item only on a specific-past question about its tag", () => {
    const tag = { topic_tags: [a("tag", "last-attempt")] };
    expect(engineSession().turn({ ...tag, question_type: "open" }).unlockedItemId).toBeNull();
    expect(engineSession().turn({ ...tag, question_type: "hypothetical_future" }).unlockedItemId).toBeNull();
    expect(engineSession().turn({ ...tag, question_type: "past_specific", label: "leading", introduced_span: [0, 0] }).unlockedItemId).toBeNull();
    expect(engineSession().turn({ ...tag, question_type: "past_specific" }).unlockedItemId).toBe("last-attempt");
  });

  it("opens a past-story item through its dropped hook as well as through its tag", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "last-attempt")] }); // not past_specific: hook selected instead
    expect(session.state.selectedHook).toBe("last-attempt");

    const plan = session.turn({ prev_turn_verdict: DROPPED, hook_id: a("hook", "last-attempt"), question_type: "past_specific" });

    expect(plan.unlockedItemId).toBe("last-attempt");
  });

  it("does not open a trust item while openness is below its threshold", () => {
    const session = engineSession();
    const plan = session.turn({ topic_tags: [a("tag", "installment")] }); // openness 4, threshold 6
    expect(plan.unlockedItemId).toBeNull();
    expect(plan.rules).toContainEqual({ itemId: "installment", path: "trust", outcome: "not_satisfied" });
  });

  it("evaluates rules on the state before the turn: openness earned this turn does not count yet", () => {
    const session = engineSession();
    session.turn(); // turn 1
    session.turn({ label: "confirm_grounded", grounded_turn_id: 1 }); // 4 -> 5
    expect(session.state.openness).toBe(5);

    // This turn raises openness to 6, the threshold, but the rule reads 5.
    const reaching = session.turn({ label: "boundary_probe", grounded_turn_id: 2, topic_tags: [a("tag", "installment")] });
    expect([reaching.opennessBefore, reaching.opennessAfter]).toEqual([5, 6]);
    expect(reaching.unlockedItemId).toBeNull();

    const next = session.turn({ topic_tags: [a("tag", "installment")] });
    expect(next.opennessBefore).toBe(6);
    expect(next.unlockedItemId).toBe("installment");
  });

  it("does not open a trust item on a leading question even above the threshold", () => {
    const state: EngineState = { ...initialState(9), turnIndex: 3 };
    const analysis: CheckedAnalysis = {
      question_type: "other",
      label: "leading",
      grounded_turn_id: null,
      introduced_span: [0, 1],
      hook_item_id: null,
      tag_item_id: "installment",
    };
    expect(decideUnlock({ scenario: chiThu, state, analysis }).unlockedItemId).toBeNull();
  });
});

describe("unlock gate: prerequisite, single unlock and priority", () => {
  const analysis = (overrides: Partial<CheckedAnalysis>): CheckedAnalysis => ({
    question_type: "other",
    label: "open",
    grounded_turn_id: null,
    introduced_span: null,
    hook_item_id: null,
    tag_item_id: null,
    ...overrides,
  });
  const droppedHook = (itemId: string, droppedAt: number) => ({ itemId, droppedAt, pickedAt: null, ignoredAt: null, closedAt: null });

  it("needs a good label for a follow-up even when the hook and the cited turn are right", () => {
    // Checked analyses never carry a cited turn with another label; the rule holds on its own anyway.
    const state: EngineState = { ...initialState(4), turnIndex: 3, ledger: [droppedHook("paid-app", 2)] };
    for (const label of ["open", "leading"] as const) {
      const result = decideUnlock({ scenario: chiThu, state, analysis: analysis({ label, grounded_turn_id: 2, hook_item_id: "paid-app" }) });
      expect(result.unlockedItemId).toBeNull();
    }
    const good = decideUnlock({ scenario: chiThu, state, analysis: analysis({ label: "boundary_probe", grounded_turn_id: 2, hook_item_id: "paid-app" }) });
    expect(good.unlockedItemId).toBe("paid-app");
  });

  it("does not consider an item whose prerequisite is locked", () => {
    // `shame` needs `last-attempt`. Even a perfect follow-up on a (forged) dropped hook does not open it.
    const state: EngineState = { ...initialState(4), turnIndex: 3, ledger: [droppedHook("shame", 2)] };
    const result = decideUnlock({
      scenario: chiThu,
      state,
      analysis: analysis({ label: "confirm_grounded", grounded_turn_id: 2, hook_item_id: "shame" }),
    });
    expect(result.unlockedItemId).toBeNull();
    expect(result.runs).toContainEqual({ itemId: "shame", path: "follow_up", outcome: "prerequisite_locked" });
  });

  it("considers it once the prerequisite is open", () => {
    const state: EngineState = {
      ...initialState(4),
      turnIndex: 3,
      unlocked: [{ itemId: "last-attempt", turn: 1 }],
      ledger: [droppedHook("shame", 2)],
    };
    const result = decideUnlock({
      scenario: chiThu,
      state,
      analysis: analysis({ label: "confirm_grounded", grounded_turn_id: 2, hook_item_id: "shame" }),
    });
    expect(result.unlockedItemId).toBe("shame");
  });

  it("opens one item when two rules hold, the heavier one", () => {
    // Tag of last-attempt (past story, weight 2) and hook of paid-app (follow-up, weight 3) in one question.
    const state: EngineState = { ...initialState(4), turnIndex: 3, ledger: [droppedHook("paid-app", 2)] };
    const result = decideUnlock({
      scenario: chiThu,
      state,
      analysis: analysis({
        label: "confirm_grounded",
        grounded_turn_id: 2,
        question_type: "past_specific",
        hook_item_id: "paid-app",
        tag_item_id: "last-attempt",
      }),
    });
    expect(result.runs.filter((run) => run.outcome === "satisfied").map((run) => run.itemId)).toEqual(["paid-app", "last-attempt"]);
    expect(result.unlockedItemId).toBe("paid-app");
  });

  it("opens the replay target first when it is among the items that could open", () => {
    const state: EngineState = { ...initialState(4), turnIndex: 3, ledger: [droppedHook("paid-app", 2)] };
    const both = analysis({
      label: "confirm_grounded",
      grounded_turn_id: 2,
      question_type: "past_specific",
      hook_item_id: "paid-app",
      tag_item_id: "last-attempt",
    });
    expect(decideUnlock({ scenario: chiThu, state, analysis: both, priorityItemId: "last-attempt" }).unlockedItemId).toBe("last-attempt");
    // A target whose rule does not hold changes nothing.
    expect(decideUnlock({ scenario: chiThu, state, analysis: both, priorityItemId: "installment" }).unlockedItemId).toBe("paid-app");
  });

  it("records one rule run for every locked item, and none for open items", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "money-home")] });
    const plan = session.turn();
    expect(plan.rules.map((run) => run.itemId)).toEqual(chiThu.items.map((item) => item.id).filter((id) => id !== "money-home"));
  });
});
