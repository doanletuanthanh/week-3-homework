import { describe, expect, it } from "vitest";
import { resolveAliases } from "@/engine/aliases";
import { applyVerdict } from "@/engine/apply-verdict";
import { checkAnalysis } from "@/engine/check-analysis";
import { initialState, type EngineState, type HookEntry } from "@/engine/types";
import { a, chiThu, engineSession, rawAnalysis, unlockedIds } from "../helpers/engine-fixtures";

const QUESTION = "Chị có muốn một app nhắc chị tiết kiệm không?"; // 10 tokens

function check(overrides: Parameters<typeof rawAnalysis>[0], state: Partial<EngineState> = {}, turnIndex = 5) {
  const { resolved, corrections: aliasCorrections } = resolveAliases(chiThu, rawAnalysis(overrides));
  const { checked, corrections } = checkAnalysis(resolved, {
    state: { ...initialState(4), turnIndex: turnIndex - 1, ...state },
    turnIndex,
    learnerTokenCount: 10,
  });
  return { checked, corrections: [...aliasCorrections, ...corrections] };
}

const dropped = (itemId: string, droppedAt: number, closedAt: number | null = null): HookEntry => ({
  itemId,
  droppedAt,
  pickedAt: null,
  ignoredAt: null,
  closedAt,
});

describe("checkAnalysis: good labels need a real persona turn", () => {
  it("keeps a good label whose grounded_turn_id is an earlier persona turn", () => {
    const { checked, corrections } = check({ label: "confirm_grounded", grounded_turn_id: 4 });
    expect(checked).toMatchObject({ label: "confirm_grounded", grounded_turn_id: 4 });
    expect(corrections).toEqual([]);
  });

  it.each([
    ["null", null],
    ["turn 0, the authored opening line", 0],
    ["the current turn", 5],
    ["a later turn", 9],
    ["a negative turn", -1],
    ["a fraction", 2.5],
    ["NaN", Number.NaN],
  ])("downgrades a good label to open when grounded_turn_id is %s", (_name, grounded) => {
    for (const label of ["confirm_grounded", "boundary_probe"] as const) {
      const { checked, corrections } = check({ label, grounded_turn_id: grounded as number | null });
      expect(checked).toMatchObject({ label: "open", grounded_turn_id: null });
      expect(corrections).toEqual([expect.objectContaining({ field: "label", from: label, to: "open" })]);
    }
  });

  it("downgrades every good label at turn 1, where no persona turn can be cited yet", () => {
    expect(check({ label: "boundary_probe", grounded_turn_id: 0 }, {}, 1).checked.label).toBe("open");
    expect(check({ label: "boundary_probe", grounded_turn_id: 1 }, {}, 1).checked.label).toBe("open");
  });

  it("leaves openness unchanged when a good label is downgraded", () => {
    const session = engineSession();
    session.turn();
    const plan = session.turn({ label: "confirm_grounded", grounded_turn_id: 0 });
    expect(plan.analysis.label).toBe("open");
    expect([plan.opennessBefore, plan.opennessAfter]).toEqual([4, 4]);
  });
});

describe("checkAnalysis: leading needs the added words", () => {
  it("keeps leading with a span inside the learner's question", () => {
    const { checked, corrections } = check({ label: "leading", introduced_span: [4, 8] });
    expect(checked).toMatchObject({ label: "leading", introduced_span: [4, 8], grounded_turn_id: null });
    expect(corrections).toEqual([]);
  });

  it.each([
    ["null", null],
    ["empty", []],
    ["a single index", [4]],
    ["end before start", [8, 4]],
    ["past the last token", [4, 10]],
    ["a negative start", [-2, 3]],
    ["fractions", [1.2, 3]],
  ])("downgrades leading to open when introduced_span is %s", (_name, span) => {
    const { checked, corrections } = check({ label: "leading", introduced_span: span });
    expect(checked).toMatchObject({ label: "open", introduced_span: null });
    expect(corrections).toEqual([expect.objectContaining({ field: "label", from: "leading", to: "open" })]);
  });

  it("does not lower openness for a leading label that was downgraded", () => {
    const session = engineSession();
    const plan = session.turn({ label: "leading", introduced_span: [4, 99] }, QUESTION);
    expect(plan.analysis.label).toBe("open");
    expect(plan.opennessAfter).toBe(4);
  });
});

describe("checkAnalysis: hook_id and topic tags", () => {
  it("accepts a hook that a verdict confirmed as dropped and whose item is still locked", () => {
    const { checked } = check({ hook_id: a("hook", "paid-app") }, { ledger: [dropped("paid-app", 3)] });
    expect(checked.hook_item_id).toBe("paid-app");
  });

  it("drops a hook_id whose hook has no drop verdict", () => {
    const { checked, corrections } = check({ hook_id: a("hook", "paid-app") });
    expect(checked.hook_item_id).toBeNull();
    expect(corrections).toEqual([expect.objectContaining({ field: "hook_id", from: "paid-app", to: null })]);
  });

  it("drops a hook_id whose hook closed because its item opened", () => {
    const { checked } = check({ hook_id: a("hook", "paid-app") }, { ledger: [dropped("paid-app", 2, 3)] });
    expect(checked.hook_item_id).toBeNull();
  });

  it.each(["H0", "H99", "paid-app", "h2", "H2; DROP TABLE", "", "T2", "I2"])(
    "drops hook_id %j, which names no hook of the scenario",
    (hookId) => {
      const { resolved, corrections } = resolveAliases(chiThu, rawAnalysis({ hook_id: hookId }));
      expect(resolved.hook_item_id).toBeNull();
      expect(corrections).toEqual([expect.objectContaining({ field: "hook_id", from: hookId, to: null })]);
    },
  );

  it("drops tags that are not in the scenario and keeps only the first of the rest", () => {
    const { checked, corrections } = check({
      topic_tags: ["T99", "vay mượn và nợ", a("tag", "money-home"), a("tag", "installment")],
    });
    expect(checked.tag_item_id).toBe("money-home");
    expect(corrections.map((correction) => correction.field)).toEqual(["topic_tags", "topic_tags", "topic_tags"]);
  });

  it("has no tag when the model returned none", () => {
    expect(check({ topic_tags: [] }).checked.tag_item_id).toBeNull();
  });
});

describe("applyVerdict", () => {
  const stateAt = (overrides: Partial<EngineState>): EngineState => ({ ...initialState(4), turnIndex: 3, ...overrides });

  it("records a hook as dropped only when that turn had it selected and the verdict is positive", () => {
    const selected = stateAt({ selectedHook: "paid-app" });
    expect(applyVerdict(chiThu, selected, { hook_dropped: true, disclosed_item_ids: [], violations: [] }).state.ledger).toEqual([
      dropped("paid-app", 3),
    ]);
    expect(applyVerdict(chiThu, selected, { hook_dropped: false, disclosed_item_ids: [], violations: [] }).state.ledger).toEqual([]);

    const none = applyVerdict(chiThu, stateAt({}), { hook_dropped: true, disclosed_item_ids: [], violations: [] });
    expect(none.state.ledger).toEqual([]);
    expect(none.applied.hook_dropped).toBe(false);
  });

  it("does not record a drop for a hook whose item is already open, or that is already on the ledger", () => {
    const positive = { hook_dropped: true, disclosed_item_ids: [], violations: [] };
    const open = stateAt({ selectedHook: "paid-app", unlocked: [{ itemId: "paid-app", turn: 3 }] });
    expect(applyVerdict(chiThu, open, positive)).toMatchObject({ state: { ledger: [] }, applied: { hook_dropped: false } });

    const known = stateAt({ selectedHook: "paid-app", ledger: [dropped("paid-app", 1)] });
    expect(applyVerdict(chiThu, known, positive)).toMatchObject({ state: { ledger: [dropped("paid-app", 1)] }, applied: { hook_dropped: false } });
  });

  it("counts an item as told only when it is open and was not told before", () => {
    const state = stateAt({
      unlocked: [
        { itemId: "tried-methods", turn: 1 },
        { itemId: "money-home", turn: 2 },
      ],
      disclosed: [{ itemId: "tried-methods", turn: 2 }],
    });
    const { state: after, applied } = applyVerdict(chiThu, state, {
      hook_dropped: false,
      disclosed_item_ids: ["tried-methods", "money-home", "money-home", "installment", "khong-co"],
      violations: [],
    });
    expect(applied.disclosed_item_ids).toEqual(["money-home"]);
    expect(after.disclosed).toEqual([
      { itemId: "tried-methods", turn: 2 },
      { itemId: "money-home", turn: 3 },
    ]);
  });

  it("keeps a violation only for the do-not-assert of an item locked at that turn", () => {
    const state = stateAt({ unlocked: [{ itemId: "money-home", turn: 2 }] });
    const { applied } = applyVerdict(chiThu, state, {
      hook_dropped: false,
      disclosed_item_ids: [],
      violations: ["dna-installment", "dna-money-home", "dna-khong-co", "dna-installment"],
    });
    expect(applied.violations).toEqual(["dna-installment"]);
  });

  it("applies nothing to turn 0, the authored opening line", () => {
    const start = { ...initialState(4), selectedHook: "paid-app" };
    const { state, applied } = applyVerdict(chiThu, start, {
      hook_dropped: true,
      disclosed_item_ids: ["money-home"],
      violations: ["dna-installment"],
    });
    expect(state).toEqual(start);
    expect(applied).toEqual({ hook_dropped: false, disclosed_item_ids: [], violations: [] });
  });

  it("does not record a hook as dropped, or an item as told, when the verdict is missing its positives", () => {
    const session = engineSession();
    session.turn({ topic_tags: [a("tag", "money-home")] }); // opens money-home (surface)
    session.turn({ topic_tags: [a("tag", "paid-app")] }); // selects the paid-app hook
    const plan = session.turn(); // verdict: nothing dropped, nothing told

    expect(unlockedIds(plan.stateAfter)).toEqual(["money-home"]);
    expect(plan.previousState.ledger).toEqual([]);
    expect(plan.previousState.disclosed).toEqual([]);
    expect(plan.verdict).toEqual({ hook_dropped: false, disclosed_item_ids: [], violations: [] });
  });
});
