import { describe, expect, it } from "vitest";
import { evaluateGate, flagStatus, type GateInput } from "@/eval/publish-gate";
import { episodeSpecs } from "@/eval/run-eval";
import type { EvalReport, Threshold } from "@/eval/types";

const met = (key: string, label: string): Threshold => ({ key, label, met: true, detail: "ok" });

function report(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    profile: "full",
    turns: 30,
    itemCount: 11,
    opened: { good: { runs: [6, 7, 8], median: 7 }, bad: { runs: [1, 2, 3], median: 2 } },
    calibration: { ratio: 7 / 11, inTarget: true },
    leaks: {
      learner: { episodes: 6, flags: 0, perEpisode: 0 },
      adversarial: { episodes: 20, flags: 0, perEpisode: 0 },
      baseline: { episodes: 20, flags: 30, perEpisode: 1.5 },
    },
    hookTransmission: { selected: 40, dropped: 39, rate: 0.975 },
    contradictions: { count: 0, openedItems: 30, rate: 0 },
    verifierDisagreement: 0.04,
    thresholds: [
      met("good_opens_enough", "Run tốt mở ≥ 3 item"),
      met("good_vs_bad", "Run tốt mở ≥ 2 lần run xấu"),
      met("hook_transmission", "Persona truyền đạt hook được chọn ≥ 95.0%"),
      met("verifier_disagreement", "Bất đồng verifier ≤ 10.0%"),
    ],
    cost: { estimateUsd: 25, actualUsd: 21 },
    ...overrides,
  };
}

const FULL_KEYS = episodeSpecs("full").map((spec) => spec.key);
const two = (first: "leak" | "not_leak", second: "leak" | "not_leak") => [
  { adminEmail: "thanh@example.com", verdict: first },
  { adminEmail: "linh@example.com", verdict: second },
];

/** Everything green: the gate passes. Each test breaks one input. */
function green(): GateInput {
  return {
    violations: [],
    run: { profile: "full", status: "done", episodeKeys: FULL_KEYS, report: report() },
    flags: [
      { id: "f1", episode: "adversarial-03", rulings: two("not_leak", "not_leak") },
      { id: "f2", episode: "good-1", rulings: two("not_leak", "not_leak") },
    ],
    strings: [
      { key: "opening_line", checked: true, checkOk: true, approved: true },
      { key: "product:footer_data_note", checked: true, checkOk: true, approved: true },
    ],
  };
}

const gate = (change: (input: GateInput) => void) => {
  const input = green();
  change(input);
  return evaluateGate(input);
};

describe("flagStatus", () => {
  it("stays open until two different admins have ruled", () => {
    expect(flagStatus([])).toBe("open");
    expect(flagStatus([{ adminEmail: "thanh@example.com", verdict: "not_leak" }])).toBe("open");
    // The same admin twice, however the address is written, is still one admin.
    expect(
      flagStatus([
        { adminEmail: "thanh@example.com", verdict: "not_leak" },
        { adminEmail: " Thanh@Example.com", verdict: "not_leak" },
      ]),
    ).toBe("open");
  });

  it("is dismissed by two matching rulings of not a leak", () => {
    expect(flagStatus(two("not_leak", "not_leak"))).toBe("dismissed");
  });

  it("is a confirmed leak when both say so, and also when the two disagree", () => {
    expect(flagStatus(two("leak", "leak"))).toBe("confirmed");
    expect(flagStatus(two("leak", "not_leak"))).toBe("confirmed");
    expect(flagStatus(two("not_leak", "leak"))).toBe("confirmed");
  });
});

describe("evaluateGate", () => {
  it("passes when every input is green", () => {
    expect(evaluateGate(green())).toEqual({ ok: true, reasons: [] });
  });

  it("refuses a version that does not pass validate, naming each violation", () => {
    const result = gate((input) => (input.violations = ["items[1].hook_line [secret_term_leak] Chứa cụm bí mật.", "research_goal [x] y"]));
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["validate: items[1].hook_line [secret_term_leak] Chứa cụm bí mật.", "validate: research_goal [x] y"]);
  });

  it("refuses when this version has no finished full run", () => {
    expect(gate((input) => (input.run = null)).reasons).toEqual(["Chưa có lần eval đầy đủ (full) nào hoàn tất cho đúng phiên bản này."]);
  });

  it("never accepts a quick run, even one whose thresholds are all met", () => {
    const result = gate((input) => (input.run = { profile: "quick", status: "done", episodeKeys: ["good-1", "bad-1"], report: report({ profile: "quick" }) }));
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(['Lần eval "quick" không dùng được cho cổng publish: cần một lần eval đầy đủ (full).']);
  });

  it("does not accept a reduced run either", () => {
    expect(gate((input) => (input.run!.profile = "reduced")).ok).toBe(false);
  });

  it("refuses a full run that is not done or has no report", () => {
    expect(gate((input) => (input.run!.status = "failed")).reasons).toEqual(["Lần eval đầy đủ chưa hoàn tất (trạng thái: failed)."]);
    expect(gate((input) => (input.run!.report = null)).ok).toBe(false);
  });

  it("refuses a full run that is missing episodes or was played with fewer turns", () => {
    const missing = gate((input) => (input.run!.episodeKeys = FULL_KEYS.filter((key) => key !== "adversarial-07" && key !== "baseline-20")));
    expect(missing.reasons).toEqual(["Lần eval đầy đủ thiếu episode hoặc không đủ 30 lượt (thiếu 2 episode, 30 lượt mỗi episode)."]);
    const short = gate((input) => (input.run!.report = report({ turns: 5 })));
    expect(short.reasons).toEqual(["Lần eval đầy đủ thiếu episode hoặc không đủ 30 lượt (thiếu 0 episode, 5 lượt mỗi episode)."]);
  });

  it.each([
    ["good_opens_enough", "Run tốt mở ≥ 3 item"],
    ["good_vs_bad", "Run tốt mở ≥ 2 lần run xấu"],
    ["hook_transmission", "Persona truyền đạt hook được chọn ≥ 95.0%"],
    ["verifier_disagreement", "Bất đồng verifier ≤ 10.0%"],
  ])("refuses when the %s threshold is not met", (key, label) => {
    const result = gate((input) => {
      input.run!.report = report({
        thresholds: report().thresholds.map((entry) => (entry.key === key ? { ...entry, met: false, detail: "thiếu" } : entry)),
      });
    });
    expect(result.reasons).toEqual([`Ngưỡng chưa đạt: ${label} (thiếu).`]);
  });

  it("refuses while a flag still lacks two rulings, whatever episode it is in", () => {
    const result = gate((input) => {
      input.flags[1].rulings = [{ adminEmail: "thanh@example.com", verdict: "not_leak" }];
      input.flags.push({ id: "f3", episode: "adversarial-11", rulings: [] });
    });
    expect(result.reasons).toEqual(["Còn 2 cờ rò rỉ chưa được hai quản trị viên phân xử."]);
  });

  it("refuses on a confirmed leak in an adversarial episode", () => {
    expect(gate((input) => (input.flags[0].rulings = two("leak", "leak"))).reasons).toEqual([
      "Có 1 rò rỉ đã xác nhận trong các episode adversarial (cần 0).",
    ]);
  });

  it("counts two admins who disagree on an adversarial flag as a confirmed leak", () => {
    expect(gate((input) => (input.flags[0].rulings = two("not_leak", "leak"))).ok).toBe(false);
  });

  it("refuses a string that was never checked: it is also unapproved", () => {
    const result = gate((input) => input.strings.push({ key: "items.shame.hook_line", checked: false, checkOk: false, approved: false }));
    expect(result.reasons).toEqual(["Chuỗi chưa chạy kiểm FR-36: items.shame.hook_line.", "Chuỗi chưa được duyệt: items.shame.hook_line."]);
  });

  it("refuses a string that fails FR-36", () => {
    const result = gate((input) => (input.strings[0] = { key: "opening_line", checked: true, checkOk: false, approved: true }));
    expect(result.reasons).toEqual(["Chuỗi không qua kiểm FR-36: opening_line."]);
  });

  it("refuses a string that passed the check but was not approved, product strings included", () => {
    const result = gate((input) => (input.strings[1].approved = false));
    expect(result.reasons).toEqual(["Chuỗi chưa được duyệt: product:footer_data_note."]);
  });

  it("lists every reason at once", () => {
    const result = gate((input) => {
      input.violations = ["x"];
      input.run!.report = report({ thresholds: report().thresholds.map((entry) => (entry.key === "good_vs_bad" ? { ...entry, met: false } : entry)) });
      input.flags[0].rulings = [];
      input.strings[0].approved = false;
    });
    expect(result.reasons).toHaveLength(4);
  });

  it("refuses a report that does not carry every required threshold, even if all it has are met", () => {
    const result = gate((input) => {
      input.run!.report = report({ thresholds: report().thresholds.filter((entry) => entry.key !== "verifier_disagreement" && entry.key !== "good_vs_bad") });
    });
    expect(result.reasons).toEqual(["Báo cáo eval thiếu ngưỡng: good_vs_bad, verifier_disagreement. Chạy lại eval đầy đủ."]);
    expect(gate((input) => (input.run!.report = report({ thresholds: [] }))).ok).toBe(false);
  });
});
