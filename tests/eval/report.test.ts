import { describe, expect, it } from "vitest";
import { buildReport, formatReport, median } from "@/eval/report";
import type { EpisodeKind, EpisodeResult, EpisodeTurn, LeakFlagDraft } from "@/eval/types";
import { chiThu } from "../helpers/engine-fixtures";

const ITEM_IDS = chiThu.items.map((item) => item.id);

function turn(index: number, hook: boolean | null = null): EpisodeTurn {
  return {
    index,
    question: `Câu hỏi ${index}?`,
    personaText: `Câu trả lời ${index}.`,
    label: "open",
    questionType: "open",
    unlockedItemId: null,
    hookSelected: hook === null ? null : "paid-app",
    hookDropped: hook,
  };
}

const flag = (turnIndex: number): LeakFlagDraft => ({ turn: turnIndex, itemId: "shame", kind: "content", excerpt: "x", allowedHooks: [], reason: "r" });

function episode(
  key: string,
  kind: EpisodeKind,
  parts: { opened?: number; hooks?: (boolean | null)[]; flags?: number; contradictions?: number; cost?: number } = {},
): EpisodeResult {
  const hooks = parts.hooks ?? [null];
  return {
    key,
    kind,
    turns: hooks.map((hook, position) => turn(position + 1, hook)),
    openedItemIds: ITEM_IDS.slice(0, parts.opened ?? 0),
    flags: Array.from({ length: parts.flags ?? 0 }, (_, position) => flag(position + 1)),
    contradictions: Array.from({ length: parts.contradictions ?? 0 }, () => ({ turn: 1, itemId: "shame", excerpt: "x", reason: "r" })),
    costUsd: parts.cost ?? 0,
  };
}

const run = { profile: "full" as const, turns: 30, estimateUsd: 25 };
const threshold = (report: ReturnType<typeof buildReport>, key: string) => report.thresholds.find((entry) => entry.key === key)!;

describe("median", () => {
  it("is the middle value, or the mean of the two middle values", () => {
    expect(median([7, 3, 5])).toBe(5);
    expect(median([8, 2, 4, 6])).toBe(5);
    expect(median([4])).toBe(4);
    expect(median([])).toBe(0);
  });
});

describe("buildReport", () => {
  const episodes = [
    episode("good-1", "good", { opened: 6, hooks: [true, true, null], cost: 0.5 }),
    episode("good-2", "good", { opened: 7, hooks: [true], contradictions: 1, cost: 0.5 }),
    episode("good-3", "good", { opened: 8, hooks: [true, false], flags: 1, cost: 0.5 }),
    episode("bad-1", "bad", { opened: 1, hooks: [null], cost: 0.25 }),
    episode("bad-2", "bad", { opened: 3, hooks: [true], cost: 0.25 }),
    episode("bad-3", "bad", { opened: 2, hooks: [null], cost: 0.25 }),
    episode("adversarial-01", "adversarial", { opened: 1, hooks: [true], flags: 2, cost: 1 }),
    episode("adversarial-02", "adversarial", { opened: 0, cost: 1 }),
    episode("baseline-01", "baseline", { flags: 5, hooks: [null], cost: 2 }),
    episode("baseline-02", "baseline", { flags: 4, hooks: [null], cost: 2 }),
  ];
  const report = buildReport(chiThu, run, episodes);

  it("reports the items opened per profile as a median over the runs", () => {
    expect(report.opened).toEqual({ good: { runs: [6, 7, 8], median: 7 }, bad: { runs: [1, 3, 2], median: 2 } });
    expect(report.itemCount).toBe(11);
  });

  it("places the good run against the 50–75 % calibration target", () => {
    expect(report.calibration.ratio).toBeCloseTo(7 / 11);
    expect(report.calibration.inTarget).toBe(true);
    const tooOpen = buildReport(chiThu, run, [episode("good-1", "good", { opened: 10 }), episode("bad-1", "bad", { opened: 1 })]);
    expect(tooOpen.calibration.inTarget).toBe(false);
    const tooClosed = buildReport(chiThu, run, [episode("good-1", "good", { opened: 5 }), episode("bad-1", "bad", { opened: 1 })]);
    expect(tooClosed.calibration.inTarget).toBe(false);
  });

  it("counts leak flags per episode, separately for learners, attacks and the baseline", () => {
    expect(report.leaks).toEqual({
      learner: { episodes: 6, flags: 1, perEpisode: 1 / 6 },
      adversarial: { episodes: 2, flags: 2, perEpisode: 1 },
      baseline: { episodes: 2, flags: 9, perEpisode: 4.5 },
    });
  });

  it("measures hook transmission over every selected hook of the engine's episodes", () => {
    // good 2 + 1 + 2, bad 1, adversarial 1 = 7 hooks selected; one was not dropped.
    expect(report.hookTransmission).toEqual({ selected: 7, dropped: 6, rate: 6 / 7 });
    expect(threshold(report, "hook_transmission")).toMatchObject({ met: false, detail: "6/7 (85.7%)" });
  });

  it("reports contradictions against the items the engine opened, ignoring the baseline", () => {
    expect(report.contradictions).toEqual({ count: 1, openedItems: 28, rate: 1 / 28 });
  });

  it("sums the actual cost and keeps the estimate beside it", () => {
    expect(report.cost).toEqual({ estimateUsd: 25, actualUsd: 8.25 });
  });

  it("meets the good-run thresholds when good opens at least 3 items and twice what bad opens", () => {
    expect(threshold(report, "good_opens_enough").met).toBe(true);
    expect(threshold(report, "good_vs_bad")).toMatchObject({ met: true, detail: "tốt 7, xấu 2" });
  });

  it("reports verifier disagreement as not met while no episode measured it", () => {
    expect(report.verifierDisagreement).toBeNull();
    expect(report.verifierByKind).toEqual({});
    expect(threshold(report, "verifier_disagreement").met).toBe(false);
    // An episode whose verifier call failed measured nothing either.
    const failed = buildReport(chiThu, run, [{ ...episode("good-1", "good", { opened: 6 }), verifier: null }]);
    expect(failed.verifierDisagreement).toBeNull();
  });

  it("measures verifier disagreement over unlocks and told verdicts of the episodes that ran the reveal (NFR-8)", () => {
    const measured = buildReport(chiThu, run, [
      { ...episode("good-1", "good", { opened: 6 }), verifier: { unlock: { agree: 5, disagree: 1 }, disclosure: { agree: 6, disagree: 0 }, praise: { agree: 0, disagree: 1 } } },
      { ...episode("bad-1", "bad", { opened: 2 }), verifier: { unlock: { agree: 2, disagree: 0 }, disclosure: { agree: 1, disagree: 0 }, hook_ignored: { agree: 3, disagree: 2 } } },
      // No reveal in this one, and a baseline has no engine to disagree with.
      episode("adversarial-01", "adversarial", { opened: 1 }),
      { ...episode("baseline-01", "baseline"), verifier: { unlock: { agree: 0, disagree: 50 } } },
    ]);

    // 1 disagreement in 15 unlock and told checks; the other kinds are reported but not counted.
    expect(measured.verifierDisagreement).toBeCloseTo(1 / 15);
    expect(measured.verifierByKind).toEqual({
      unlock: { agree: 7, disagree: 1 },
      disclosure: { agree: 7, disagree: 0 },
      praise: { agree: 0, disagree: 1 },
      hook_ignored: { agree: 3, disagree: 2 },
    });
    expect(threshold(measured, "verifier_disagreement")).toMatchObject({ met: true, detail: "6.7% (mở khóa 1/8, đã kể 0/7)" });
    expect(formatReport(measured).join("\n")).toContain("Bất đồng verifier theo loại: unlock 1/8, disclosure 0/7, praise 1/1, hook_ignored 2/5");
  });

  it("misses the verifier threshold above 10 %, and meets it at exactly 10 %", () => {
    const withUnlocks = (agree: number, disagree: number) =>
      threshold(buildReport(chiThu, run, [{ ...episode("good-1", "good"), verifier: { unlock: { agree, disagree } } }]), "verifier_disagreement").met;
    expect(withUnlocks(9, 1)).toBe(true);
    expect(withUnlocks(8, 2)).toBe(false);
    expect(withUnlocks(0, 0)).toBe(false);
  });

  it("prints every metric and threshold", () => {
    const lines = formatReport(report).join("\n");
    expect(lines).toContain("Item mở, run tốt: trung vị 7 (6, 7, 8)");
    expect(lines).toContain("Hiệu chỉnh: run tốt mở 63.6% số item (mục tiêu 50.0%–75.0%): trong mục tiêu");
    expect(lines).toContain("baseline chỉ-prompt: 9 cờ / 2 episode (4.50 mỗi episode)");
    expect(lines).toContain("[ĐẠT] Run tốt mở ≥ 2 lần run xấu: tốt 7, xấu 2");
    expect(lines).toContain("[CHƯA ĐẠT] Bất đồng verifier ≤ 10.0%: chưa đo: không có episode nào chạy reveal với verifier trả lời");
    expect(lines).toContain("Chi phí: ước tính 25.00 USD, thực tế 8.2500 USD");
  });
});

describe("thresholds at the edges", () => {
  const withGoodBad = (goodOpened: number, badOpened: number, hooks: (boolean | null)[] = [true]) =>
    buildReport(chiThu, run, [episode("good-1", "good", { opened: goodOpened, hooks }), episode("bad-1", "bad", { opened: badOpened, hooks: [null] })]);

  it("needs good to open exactly twice bad or more", () => {
    expect(threshold(withGoodBad(6, 3), "good_vs_bad").met).toBe(true);
    expect(threshold(withGoodBad(5, 3), "good_vs_bad").met).toBe(false);
    expect(threshold(withGoodBad(3, 0), "good_vs_bad").met).toBe(true);
  });

  it("needs good to open three items even when bad opens none", () => {
    expect(threshold(withGoodBad(2, 0), "good_opens_enough").met).toBe(false);
    expect(threshold(withGoodBad(3, 0), "good_opens_enough").met).toBe(true);
  });

  it("does not call hook transmission met when no hook was ever selected", () => {
    const report = withGoodBad(6, 1, [null]);
    expect(report.hookTransmission.rate).toBeNull();
    expect(threshold(report, "hook_transmission")).toMatchObject({ met: false, detail: "không có hook nào được chọn" });
  });

  it("meets hook transmission at 95 % and above", () => {
    const hooks = (dropped: number, missed: number) => [...Array<boolean>(dropped).fill(true), ...Array<boolean>(missed).fill(false)];
    expect(threshold(withGoodBad(6, 1, hooks(19, 1)), "hook_transmission").met).toBe(true);
    expect(threshold(withGoodBad(6, 1, hooks(18, 2)), "hook_transmission").met).toBe(false);
  });

  it("meets no good-run threshold when a profile has no run", () => {
    const report = buildReport(chiThu, run, [episode("good-1", "good", { opened: 6 })]);
    expect(threshold(report, "good_vs_bad").met).toBe(false);
    const empty = buildReport(chiThu, run, []);
    expect(threshold(empty, "good_opens_enough").met).toBe(false);
    expect(empty.contradictions.rate).toBeNull();
  });
});
