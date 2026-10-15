import { describe, expect, it } from "vitest";
import { evaluateGate, flagStatus, GATE_RULES, type GateInput } from "@/eval/publish-gate";
import { THRESHOLDS } from "@/eval/qa/thresholds";
import type { QaReport } from "@/eval/qa/types";
import type { EvalReport } from "@/eval/types";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OLD_RUN_ID = "22222222-2222-4222-8222-222222222222";

/** A finished lean report in which every threshold is met. */
function report(overrides: Partial<QaReport> = {}): QaReport {
  return {
    profile: "lean",
    version: 1,
    thresholds: THRESHOLDS.map((row) => ({ key: row.key, label: row.label, met: true, detail: "đạt" })),
    warnings: [],
    publicLeaks: [],
    risks: [],
    observations: [],
    leaks: [],
    findings: [],
    rounds: [{ decision: "done", actions: 0 }],
    cost: { capUsd: 0.1, actualUsd: 0.05, calls: 40 },
    ...overrides,
  };
}

const unmet = (key: string, detail = "thiếu") => report().thresholds.map((row) => (row.key === key ? { ...row, met: false, detail } : row));
const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 9, minute));
const ruling = (verdict: "leak" | "not_leak", minute = 0) => ({ adminEmail: "thanh@example.com", verdict, at: at(minute) });

/** Everything green: the gate passes. Each test breaks one input. */
function green(): GateInput {
  return {
    violations: [],
    run: { id: RUN_ID, profile: "lean", status: "done", report: report({ thresholds: unmet("no_leaks", "R3 (attack) lộ shame [topic]") }) },
    flags: [{ id: "f1", rulings: [ruling("not_leak")] }],
    strings: [
      { key: "opening_line", checked: true, checkOk: true, approved: true },
      { key: "product:footer_data_note", checked: true, checkOk: true, approved: true },
    ],
    approval: { adminEmail: "linh@example.com", at: at(5), evalRunId: RUN_ID },
  };
}

const gate = (change: (input: GateInput) => void) => {
  const input = green();
  change(input);
  return evaluateGate(input);
};

describe("flagStatus", () => {
  it("is open with no ruling", () => {
    expect(flagStatus([])).toBe("open");
  });

  it("is settled by one ruling", () => {
    expect(flagStatus([ruling("not_leak")])).toBe("dismissed");
    expect(flagStatus([ruling("leak")])).toBe("confirmed");
  });

  it("follows the latest ruling by time, in whatever order the rulings come", () => {
    expect(flagStatus([ruling("leak", 1), ruling("not_leak", 2)])).toBe("dismissed");
    expect(flagStatus([ruling("leak", 3), ruling("not_leak", 2)])).toBe("confirmed");
  });
});

describe("evaluateGate", () => {
  it("passes when every input is green, a leak flag ruled not a leak included", () => {
    expect(evaluateGate(green())).toEqual({ ok: true, reasons: [] });
  });

  it("is the union of its rules, each of which is met on the green input", () => {
    expect(GATE_RULES.map((rule) => rule.key)).toEqual([
      "validate",
      "lean_run_present",
      "lean_run_done",
      "thresholds_met",
      "no_confirmed_leak",
      "strings_checked",
      "strings_pass",
      "strings_approved",
      "version_approved",
    ]);
    for (const rule of GATE_RULES) expect(rule.reasons(green())).toEqual([]);
  });

  it("refuses a version that does not pass validate, naming each violation", () => {
    const result = gate((input) => (input.violations = ["items[1].hook_line [secret_term_leak] Chứa cụm bí mật.", "research_goal [x] y"]));
    expect(result.reasons).toEqual(["validate: items[1].hook_line [secret_term_leak] Chứa cụm bí mật.", "validate: research_goal [x] y"]);
  });

  it("refuses when this version has no lean run, and then has no approval for one either", () => {
    expect(
      gate((input) => {
        input.run = null;
        input.flags = [];
        input.approval = null;
      }).reasons,
    ).toEqual(["Chưa có lần eval lean nào cho đúng phiên bản này.", "Chưa có quản trị viên nào duyệt phiên bản này."]);
  });

  it("refuses while the newest lean run is queued, running or failed", () => {
    for (const status of ["queued", "running", "failed"]) {
      expect(gate((input) => (input.run!.status = status)).reasons).toEqual([`Lần eval lean mới nhất chưa hoàn tất (trạng thái: ${status}).`]);
    }
  });

  it("never accepts a run of another profile, even a done one", () => {
    const full = { profile: "full", turns: 30, thresholds: [] } as unknown as EvalReport;
    for (const profile of ["full", "quick", "reduced"] as const) {
      expect(gate((input) => (input.run = { id: RUN_ID, profile, status: "done", report: full })).reasons).toEqual([
        `Lần eval "${profile}" không dùng được cho cổng publish: cần một lần eval lean.`,
      ]);
    }
  });

  it.each(THRESHOLDS.filter((row) => row.key !== "no_leaks").map((row) => [row.key, row.label]))("refuses when the %s threshold is not met", (key, label) => {
    expect(gate((input) => (input.run!.report = report({ thresholds: unmet(key) }))).reasons).toEqual([`Ngưỡng chưa đạt: ${label} (thiếu).`]);
  });

  it("refuses a report that lacks a threshold, even if all it has are met", () => {
    const thresholds = report().thresholds.filter((row) => row.key !== "judged" && row.key !== "deliveries");
    expect(gate((input) => (input.run!.report = report({ thresholds }))).reasons).toEqual(["Báo cáo eval thiếu ngưỡng: deliveries, judged. Chạy lại eval lean."]);
  });

  it("leaves no_leaks to the rulings: a flag with no ruling blocks", () => {
    expect(gate((input) => input.flags.push({ id: "f2", rulings: [] })).reasons).toEqual(["Còn 1 cờ rò rỉ chưa được phân xử."]);
  });

  it("refuses on one leak ruling, and passes again once the latest ruling says not a leak", () => {
    expect(gate((input) => (input.flags[0].rulings = [ruling("not_leak", 1), ruling("leak", 2)])).reasons).toEqual(["Có 1 rò rỉ đã xác nhận (cần 0)."]);
    expect(gate((input) => (input.flags[0].rulings = [ruling("leak", 1), ruling("not_leak", 2)])).ok).toBe(true);
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
    expect(gate((input) => (input.strings[1].approved = false)).reasons).toEqual(["Chuỗi chưa được duyệt: product:footer_data_note."]);
  });

  it("refuses a version no admin approved", () => {
    expect(gate((input) => (input.approval = null)).reasons).toEqual(["Chưa có quản trị viên nào duyệt phiên bản này."]);
  });

  it("refuses an approval given on an earlier run: a new run needs a new approval", () => {
    expect(gate((input) => (input.approval!.evalRunId = OLD_RUN_ID)).reasons).toEqual([
      "Phê duyệt của linh@example.com là cho một lần eval cũ: cần duyệt lại trên lần eval lean mới nhất.",
    ]);
  });

  it("lists every reason at once", () => {
    const result = gate((input) => {
      input.violations = ["x"];
      input.run!.report = report({ thresholds: unmet("floor_unlocks") });
      input.flags[0].rulings = [];
      input.strings[0].approved = false;
      input.approval = null;
    });
    expect(result.reasons).toHaveLength(5);
  });
});
