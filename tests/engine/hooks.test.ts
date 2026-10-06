import { describe, expect, it } from "vitest";
import { chooseHook, isClosingQuestion, updateLedger } from "@/engine/hooks";
import type { CheckedAnalysis, HookEntry } from "@/engine/types";
import { a, chiThu, engineSession, unlockedIds } from "../helpers/engine-fixtures";

const DROPPED = { hook_dropped: true, disclosed_item_ids: [], violations: [] };

const analysis = (overrides: Partial<CheckedAnalysis> = {}): CheckedAnalysis => ({
  question_type: "other",
  label: "open",
  grounded_turn_id: null,
  introduced_span: null,
  hook_item_id: null,
  tag_item_id: null,
  ...overrides,
});

const choose = (input: { unlocked?: string[]; ledger?: HookEntry[]; analysis?: CheckedAnalysis; justUnlocked?: string | null }) =>
  chooseHook({
    scenario: chiThu,
    unlockedIds: new Set(input.unlocked ?? []),
    ledger: input.ledger ?? [],
    analysis: input.analysis ?? analysis(),
    justUnlockedItemId: input.justUnlocked ?? null,
  });

const entry = (itemId: string, droppedAt: number, rest: Partial<HookEntry> = {}): HookEntry => ({
  itemId,
  droppedAt,
  pickedAt: null,
  ignoredAt: null,
  closedAt: null,
  ...rest,
});

describe("chooseHook", () => {
  it("selects nothing on a turn that touches no tag and is not a closing question", () => {
    expect(choose({ analysis: analysis({ question_type: "closed" }) })).toBeNull();
  });

  it("selects the hook of the item whose tag the turn touches", () => {
    expect(choose({ analysis: analysis({ tag_item_id: "work-fatigue", question_type: "closed" }) })).toBe("work-fatigue");
  });

  it("selects no hook for an item that is already open", () => {
    expect(choose({ unlocked: ["money-home"], analysis: analysis({ tag_item_id: "money-home", question_type: "closed" }) })).toBeNull();
  });

  it("selects no hook for an item whose prerequisite is still locked", () => {
    expect(choose({ analysis: analysis({ tag_item_id: "shame", question_type: "closed" }) })).toBeNull();
  });

  it("selects the hook of an item whose prerequisite was just opened", () => {
    expect(
      choose({
        unlocked: ["last-attempt"],
        justUnlocked: "last-attempt",
        analysis: analysis({ tag_item_id: "last-attempt", question_type: "past_specific" }),
      }),
    ).toBe("shame");
  });

  it("does not select a hook again once a verdict confirmed it as dropped", () => {
    expect(
      choose({ ledger: [entry("work-fatigue", 2)], analysis: analysis({ tag_item_id: "work-fatigue", question_type: "closed" }) }),
    ).toBeNull();
  });

  it("on a closing question, selects the heaviest eligible hook, then scenario order", () => {
    const closing = analysis({ question_type: "open" });
    // paid-app and installment both weigh 3; paid-app comes first in the scenario.
    expect(choose({ analysis: closing })).toBe("paid-app");
    expect(choose({ analysis: closing, ledger: [entry("paid-app", 1)] })).toBe("installment");
    // shame (weight 3) joins once its prerequisite is open.
    expect(choose({ analysis: closing, ledger: [entry("paid-app", 1), entry("installment", 2)], unlocked: ["last-attempt"] })).toBe("shame");
  });

  it("recognises a closing question only as open label, open type, no tag", () => {
    expect(isClosingQuestion(analysis({ question_type: "open" }))).toBe(true);
    expect(isClosingQuestion(analysis({ question_type: "closed" }))).toBe(false);
    expect(isClosingQuestion(analysis({ question_type: "open", tag_item_id: "money-home" }))).toBe(false);
    expect(isClosingQuestion(analysis({ question_type: "open", label: "confirm_grounded" }))).toBe(false);
  });
});

describe("hook lifecycle through whole turns", () => {
  it("a closing question drops a hook but opens no item", () => {
    const session = engineSession();
    const plan = session.turn({ label: "open", question_type: "open" }, "Có điều gì em chưa hỏi mà chị nghĩ em nên biết không?");
    expect(plan.hookToDrop).toBe("paid-app");
    expect(plan.unlockedItemId).toBeNull();
    expect(unlockedIds(session.state)).toEqual([]);
    expect(plan.personaContext.hookLine).toBe("Có lần chị định ghi lại nhưng rồi cũng bỏ.");
  });

  it("a hook with a negative verdict is not in the ledger and is selected again on the next eligible turn", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "paid-app")] });

    const second = session.turn({ topic_tags: [a("tag", "paid-app")] }); // verdict for turn 1: not dropped

    expect(second.previousState.ledger).toEqual([]);
    expect(second.hookToDrop).toBe("paid-app");
  });

  it("marks a hook ignored when the turn right after the drop does not pick it, and keeps it pickable", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "paid-app")] });
    const second = session.turn({ prev_turn_verdict: DROPPED, topic_tags: [a("tag", "money-home")] });

    expect(second.stateAfter.ledger).toEqual([entry("paid-app", 1, { ignoredAt: 2 })]);

    const third = session.turn({ hook_id: a("hook", "paid-app") });
    expect(third.analysis.hook_item_id).toBe("paid-app");
    expect(third.stateAfter.ledger).toEqual([entry("paid-app", 1, { ignoredAt: 2, pickedAt: 3 })]);
  });

  it("does not mark a hook ignored when it is picked on the very next turn", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "paid-app")] });
    const second = session.turn({ prev_turn_verdict: DROPPED, hook_id: a("hook", "paid-app") });
    expect(second.stateAfter.ledger).toEqual([entry("paid-app", 1, { pickedAt: 2 })]);
  });

  it("keeps the first pick-up turn when the hook is picked again later", () => {
    const ledger = updateLedger([entry("paid-app", 1, { pickedAt: 2 })], { turnIndex: 5, pickedItemId: "paid-app", unlockedItemId: null });
    expect(ledger[0].pickedAt).toBe(2);
  });

  it("closes a hook when its item opens by another path, and never touches a closed hook again", () => {
    // last-attempt (past story) has its hook dropped, then opens through its tag.
    const closed = updateLedger([entry("last-attempt", 1)], { turnIndex: 2, pickedItemId: null, unlockedItemId: "last-attempt" });
    expect(closed).toEqual([entry("last-attempt", 1, { ignoredAt: 2, closedAt: 2 })]);
    expect(updateLedger(closed, { turnIndex: 3, pickedItemId: "last-attempt", unlockedItemId: null })).toEqual(closed);
  });

  it("selects at most one hook per turn", () => {
    const session = engineSession();
    for (let turn = 0; turn < 6; turn += 1) {
      const plan = session.turn({ prev_turn_verdict: DROPPED, label: "open", question_type: "open" });
      expect(typeof plan.hookToDrop === "string" || plan.hookToDrop === null).toBe(true);
    }
    // Six closing questions with positive verdicts drop six different hooks, heaviest first.
    expect(session.plans.map((plan) => plan.hookToDrop)).toEqual([
      "paid-app",
      "installment",
      "last-attempt",
      "roommate",
      "small-spend",
      "work-fatigue",
    ]);
  });
});
