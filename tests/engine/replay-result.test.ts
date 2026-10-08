import { describe, expect, it } from "vitest";
import { REPLAY_TURNS, decideReplay, describeReplay, type ReplayTurn } from "@/engine/replay-result";
import { tokenize } from "@/engine/tokens";
import type { Label } from "@/engine/types";
import { chiThu } from "../helpers/engine-fixtures";

const itemOf = (id: string) => chiThu.items.find((item) => item.id === id)!;
const TARGET = "paid-app";

/** A replay turn in which nothing happened, with what the test changes about it. */
function turn(index: number, overrides: Partial<ReplayTurn> = {}): ReplayTurn {
  return {
    index,
    label: "open",
    introducedSpan: null,
    learnerTokens: tokenize("Chị kể thêm cho em nghe được không ạ?"),
    unlockedItemId: null,
    disclosedItemIds: [],
    judgeLabel: null,
    ...overrides,
  };
}

const primary = (turns: ReplayTurn[]) => decideReplay({ level: "primary", targetItemId: TARGET, turns });
const fallback = (turns: ReplayTurn[]) => decideReplay({ level: "fallback1", targetItemId: null, turns });
/** Turns with these Call 1 labels; a leading one is confirmed by the judge unless `judge` says otherwise. */
const labelled = (...labels: Label[]) => labels.map((label, position) => turn(position + 1, { label, judgeLabel: label === "leading" ? "leading" : "open" }));

describe("decideReplay: a primary replay (PRD §9.5)", () => {
  it("goes on while the target is not told and turns are left", () => {
    expect(primary([])).toBeNull();
    expect(primary([turn(3)])).toBeNull();
    expect(primary([turn(3), turn(4)])).toBeNull();
  });

  it.each([1, 2, 3])("is a success at replay turn %i, as soon as the judge confirms the target was told", (count) => {
    const before = Array.from({ length: count - 1 }, (_, position) => turn(3 + position));
    expect(primary([...before, turn(3 + count - 1, { unlockedItemId: TARGET, disclosedItemIds: [TARGET] })])).toBe("success");
  });

  it("is not a success when the target opened but no judge said the persona told it", () => {
    const opened = turn(3, { unlockedItemId: TARGET });
    expect(primary([opened])).toBeNull();
    expect(primary([opened, turn(4), turn(5)])).toBe("fail");
  });

  it("counts a turn whose judge failed as telling nothing", () => {
    const unchecked = turn(3, { unlockedItemId: TARGET, disclosedItemIds: null });
    expect(primary([unchecked])).toBeNull();
    expect(primary([unchecked, turn(4, { disclosedItemIds: null }), turn(5, { disclosedItemIds: null })])).toBe("fail");
  });

  it("is a success when the target is told in a later turn than the one that opened it", () => {
    expect(primary([turn(3, { unlockedItemId: TARGET }), turn(4, { disclosedItemIds: [TARGET] })])).toBe("success");
  });

  it("is a fail after three turns with nothing told", () => {
    expect(primary([turn(3), turn(4), turn(5)])).toBe("fail");
  });

  it("is partial after three turns when another item this replay opened was told, and the target was not", () => {
    const other = turn(4, { unlockedItemId: "tried-methods", disclosedItemIds: ["tried-methods"] });
    expect(primary([turn(3), other])).toBeNull();
    expect(primary([turn(3), other, turn(5)])).toBe("partial");
  });

  it("does not call it partial when the other item was opened but not told, or told but opened before the fork", () => {
    expect(primary([turn(3, { unlockedItemId: "tried-methods" }), turn(4), turn(5)])).toBe("fail");
    // `money-home` was open at the fork: telling it now is not something this replay opened.
    expect(primary([turn(3, { disclosedItemIds: ["money-home"] }), turn(4), turn(5)])).toBe("fail");
  });

  it("is a success, not partial, when both the target and another item were told", () => {
    const other = turn(3, { unlockedItemId: "tried-methods", disclosedItemIds: ["tried-methods"] });
    expect(primary([other, turn(4, { unlockedItemId: TARGET, disclosedItemIds: [TARGET] })])).toBe("success");
  });
});

describe("decideReplay: the replay of a leading question (PRD §9.5)", () => {
  it("always runs its three turns", () => {
    expect(fallback(labelled("confirm_grounded"))).toBeNull();
    expect(fallback(labelled("confirm_grounded", "boundary_probe"))).toBeNull();
    expect(fallback(labelled("leading", "leading"))).toBeNull();
  });

  it.each([
    [["confirm_grounded", "open", "open"], "success"],
    [["open", "open", "boundary_probe"], "success"],
    [["confirm_grounded", "boundary_probe", "confirm_grounded"], "success"],
    [["open", "open", "open"], "fail"],
    [["leading", "confirm_grounded", "confirm_grounded"], "fail"],
    [["confirm_grounded", "confirm_grounded", "leading"], "fail"],
  ] as [Label[], string][])("%j → %s", (labels, result) => {
    expect(fallback(labelled(...labels))).toBe(result);
  });

  it("the judge alone calling a question leading does not make it one", () => {
    const turns = labelled("confirm_grounded", "open", "open").map((entry) => ({ ...entry, judgeLabel: "leading" as const }));
    expect(fallback(turns)).toBe("success");
  });

  it.each([
    ["the judge found it open", "open"],
    ["the judge found it grounded", "confirm_grounded"],
    ["the judge failed on that turn", null],
  ] as [string, Label | null][])("a question Call 1 found leading does not count as leading when %s", (_name, judgeLabel) => {
    const unconfirmed = turn(1, { label: "leading", introducedSpan: [1, 3], judgeLabel });
    expect(fallback([unconfirmed, turn(2, { label: "confirm_grounded" }), turn(3)])).toBe("success");
    // It is not a good label either: with nothing else grounded the replay still fails.
    expect(fallback([unconfirmed, turn(2), turn(3)])).toBe("fail");
    expect(fallback([unconfirmed, unconfirmed, unconfirmed])).toBe("fail");
  });

  it("one confirmed leading question fails the replay, whatever the other two were", () => {
    const confirmed = turn(2, { label: "leading", introducedSpan: [1, 3], judgeLabel: "leading" });
    expect(fallback([turn(1, { label: "confirm_grounded" }), confirmed, turn(3, { label: "boundary_probe" })])).toBe("fail");
  });

  it("a failed three-turn replay always has a reason to show: a confirmed leading question, or no grounded one", () => {
    const labels: Label[] = ["open", "leading", "confirm_grounded", "boundary_probe"];
    const judges: (Label | null)[] = ["open", "leading", null];
    const options = labels.flatMap((label) => judges.map((judgeLabel) => ({ label, judgeLabel })));
    for (const first of options) for (const second of options) for (const third of options) {
      const turns = [first, second, third].map((entry, position) => turn(position + 1, { ...entry, introducedSpan: entry.label === "leading" ? [0, 1] : null }));
      if (fallback(turns) !== "fail") continue;
      const shown = describeReplay({ scenario: chiThu, level: "fallback1", result: "fail", forkAfterTurn: 0, targetItemId: null, turns, openItemIds: new Set() });
      if (shown.level !== "fallback1") throw new Error("wrong level");
      expect(shown.stillLeading !== null || shown.grounded === 0, JSON.stringify([first, second, third])).toBe(true);
    }
  });

  it("has exactly three turns", () => {
    expect(REPLAY_TURNS).toBe(3);
  });
});

describe("describeReplay: what the learner is shown", () => {
  const describePrimary = (result: "success" | "partial" | "fail" | "stopped" | "skipped", turns: ReplayTurn[]) =>
    describeReplay({ scenario: chiThu, level: "primary", result, forkAfterTurn: 2, targetItemId: TARGET, turns, openItemIds: new Set(["money-home"]) });

  it.each(["success", "fail", "stopped", "skipped"] as const)("primary %s: the target's content and its sample question, and no other item", (result) => {
    expect(describePrimary(result, [turn(3)])).toEqual({
      level: "primary",
      result,
      target: { content: itemOf(TARGET).content, sampleQuestion: itemOf(TARGET).sample_question },
      otherItem: null,
    });
  });

  it("primary partial: names the other item the learner opened", () => {
    const turns = [turn(3, { unlockedItemId: "tried-methods", disclosedItemIds: ["tried-methods"] }), turn(4), turn(5)];
    expect(describePrimary("partial", turns)).toMatchObject({ result: "partial", otherItem: itemOf("tried-methods").content, target: { content: itemOf(TARGET).content } });
  });

  it("refuses a primary replay that has no target", () => {
    expect(() => describeReplay({ scenario: chiThu, level: "primary", result: "fail", forkAfterTurn: 2, targetItemId: null, turns: [], openItemIds: new Set() })).toThrow(
      "no target",
    );
  });

  const leadingQuestion = tokenize("Chắc tại chị lười nên mới bỏ đúng không ạ?");
  const describeFallback = (result: "success" | "fail" | "stopped" | "skipped", turns: ReplayTurn[], open: string[] = []) =>
    describeReplay({ scenario: chiThu, level: "fallback1", result, forkAfterTurn: 0, targetItemId: null, turns, openItemIds: new Set(open) });

  it("fallback 1 success: how many of the three questions rested on the persona's words, and no sample question", () => {
    expect(describeFallback("success", labelled("confirm_grounded", "open", "boundary_probe"))).toEqual({
      level: "fallback1",
      result: "success",
      leadingTurn: 1,
      grounded: 2,
      stillLeading: null,
      sampleQuestion: null,
    });
  });

  it("fallback 1 fail: quotes the first question that was still leading, when the replay judge found it leading too", () => {
    const turns = [
      turn(1, { label: "leading", introducedSpan: [1, 3], learnerTokens: leadingQuestion, judgeLabel: "open" }),
      turn(2, { label: "leading", introducedSpan: [1, 3], learnerTokens: leadingQuestion, judgeLabel: "leading" }),
      turn(3, { label: "leading", introducedSpan: [0, 0], learnerTokens: leadingQuestion, judgeLabel: "leading" }),
    ];
    expect(describeFallback("fail", turns)).toMatchObject({ result: "fail", stillLeading: { turn: 2, words: "tại chị lười" } });
  });

  it("fallback 1 fail: says nothing about a leading question the judge did not confirm, or could not check", () => {
    const disagreed = turn(1, { label: "leading", introducedSpan: [1, 3], learnerTokens: leadingQuestion, judgeLabel: "open" });
    const unchecked = turn(2, { label: "leading", introducedSpan: [1, 3], learnerTokens: leadingQuestion, judgeLabel: null, disclosedItemIds: null });
    expect(describeFallback("fail", [disagreed, unchecked, turn(3)]).level === "fallback1").toBe(true);
    expect(describeFallback("fail", [disagreed, unchecked, turn(3)])).toMatchObject({ stillLeading: null });
    // The judge alone calling a question leading does not make it one: Call 1's checked label did not.
    expect(describeFallback("fail", [turn(1, { judgeLabel: "leading" }), turn(2), turn(3)])).toMatchObject({ stillLeading: null });
  });

  it("fallback 1 fail, stop and skip: the sample question of the most important item still locked", () => {
    // paid-app, shame and installment share the highest weight: scenario order decides.
    expect(describeFallback("fail", labelled("open", "open", "open"))).toMatchObject({ sampleQuestion: itemOf("paid-app").sample_question });
    expect(describeFallback("stopped", [], ["paid-app"])).toMatchObject({ sampleQuestion: itemOf("shame").sample_question, grounded: 0 });
    expect(describeFallback("skipped", [], ["paid-app", "shame"])).toMatchObject({ sampleQuestion: itemOf("installment").sample_question });
    expect(describeFallback("fail", [], chiThu.items.map((item) => item.id))).toMatchObject({ sampleQuestion: null });
  });

  it("names the leading turn of the main interview that was replayed", () => {
    expect(describeReplay({ scenario: chiThu, level: "fallback1", result: "fail", forkAfterTurn: 6, targetItemId: null, turns: [], openItemIds: new Set() })).toMatchObject({
      leadingTurn: 7,
    });
  });
});
