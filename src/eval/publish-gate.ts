import { THRESHOLDS } from "./qa/thresholds";
import type { QaReport } from "./qa/types";
import { isEpisodeReport, type EvalProfile, type EvalReport } from "./types";

export type AdjudicationVerdict = "leak" | "not_leak";

/** Where a flag stands: no ruling yet, ruled not a leak, or ruled a leak. */
export type FlagStatus = "open" | "dismissed" | "confirmed";

export type Ruling = { adminEmail: string; verdict: AdjudicationVerdict; at: Date };

/** One admin ruling settles a flag. Every ruling is kept, and the latest one counts. */
export function flagStatus(rulings: Pick<Ruling, "verdict" | "at">[]): FlagStatus {
  const latest = rulings.reduce<Pick<Ruling, "verdict" | "at"> | null>((newest, ruling) => (newest && newest.at > ruling.at ? newest : ruling), null);
  if (!latest) return "open";
  return latest.verdict === "leak" ? "confirmed" : "dismissed";
}

export type GateInput = {
  /** Messages of the `validate` violations of the stored version; empty when it is clean. */
  violations: string[];
  /** The newest lean run of this exact version, whatever its status. */
  run: { id: string; profile: EvalProfile; status: string; report: EvalReport | QaReport | null } | null;
  /** Every leak flag of that run with its rulings. */
  flags: { id: string; rulings: Pick<Ruling, "verdict" | "at">[] }[];
  /** Every fixed string of the version (and of the product) as it stands now. */
  strings: { key: string; checked: boolean; checkOk: boolean; approved: boolean }[];
  /** The newest admin approval of this version, with the run it was given on. */
  approval: { adminEmail: string; at: Date; evalRunId: string } | null;
};

export type GateResult = { ok: boolean; reasons: string[] };

/** Leaks are settled by admin rulings on the run's flags, not by this threshold of the report. */
const SETTLED_BY_RULINGS = "no_leaks";

/** The report of the run when it is a finished lean run; null otherwise. */
const leanReport = ({ run }: GateInput): QaReport | null => {
  const report = run?.status === "done" ? run.report : null;
  return report && !isEpisodeReport(report) ? report : null;
};

const countOf = (input: GateInput, status: FlagStatus) => input.flags.filter((flag) => flagStatus(flag.rulings) === status).length;

/**
 * What a version needs to be published. Each rule lists the reasons it is not met; a rule with
 * none is met. A new requirement is a new row.
 */
export const GATE_RULES: { key: string; reasons: (input: GateInput) => string[] }[] = [
  {
    key: "validate",
    reasons: (input) => input.violations.map((violation) => `validate: ${violation}`),
  },
  {
    key: "lean_run_present",
    reasons: (input) => (input.run ? [] : ["Chưa có lần eval lean nào cho đúng phiên bản này."]),
  },
  {
    key: "lean_run_done",
    reasons: ({ run, ...rest }) => {
      if (!run || leanReport({ run, ...rest })) return [];
      if (run.profile !== "lean") return [`Lần eval "${run.profile}" không dùng được cho cổng publish: cần một lần eval lean.`];
      return [`Lần eval lean mới nhất chưa hoàn tất (trạng thái: ${run.status}).`];
    },
  },
  {
    key: "thresholds_met",
    reasons: (input) => {
      const report = leanReport(input);
      if (!report) return [];
      const unmet = report.thresholds
        .filter((threshold) => !threshold.met && threshold.key !== SETTLED_BY_RULINGS)
        .map((threshold) => `Ngưỡng chưa đạt: ${threshold.label} (${threshold.detail}).`);
      // A report that lacks a threshold (stored by older code) has not met it.
      const reported = new Set(report.thresholds.map((threshold) => threshold.key));
      const absent = THRESHOLDS.map((row) => row.key).filter((key) => !reported.has(key));
      return [...unmet, ...(absent.length > 0 ? [`Báo cáo eval thiếu ngưỡng: ${absent.join(", ")}. Chạy lại eval lean.`] : [])];
    },
  },
  {
    key: "no_confirmed_leak",
    reasons: (input) => {
      if (!leanReport(input)) return [];
      const open = countOf(input, "open");
      const confirmed = countOf(input, "confirmed");
      return [
        ...(open > 0 ? [`Còn ${open} cờ rò rỉ chưa được phân xử.`] : []),
        ...(confirmed > 0 ? [`Có ${confirmed} rò rỉ đã xác nhận (cần 0).`] : []),
      ];
    },
  },
  {
    key: "strings_checked",
    reasons: (input) => {
      const unchecked = input.strings.filter((entry) => !entry.checked);
      return unchecked.length > 0 ? [`Chuỗi chưa chạy kiểm FR-36: ${unchecked.map((entry) => entry.key).join(", ")}.`] : [];
    },
  },
  {
    key: "strings_pass",
    reasons: (input) => {
      const failing = input.strings.filter((entry) => entry.checked && !entry.checkOk);
      return failing.length > 0 ? [`Chuỗi không qua kiểm FR-36: ${failing.map((entry) => entry.key).join(", ")}.`] : [];
    },
  },
  {
    key: "strings_approved",
    reasons: (input) => {
      const unapproved = input.strings.filter((entry) => !entry.approved);
      return unapproved.length > 0 ? [`Chuỗi chưa được duyệt: ${unapproved.map((entry) => entry.key).join(", ")}.`] : [];
    },
  },
  {
    key: "version_approved",
    reasons: ({ approval, run }) => {
      if (!approval) return ["Chưa có quản trị viên nào duyệt phiên bản này."];
      if (approval.evalRunId !== run?.id) return [`Phê duyệt của ${approval.adminEmail} là cho một lần eval cũ: cần duyệt lại trên lần eval lean mới nhất.`];
      return [];
    },
  },
];

/**
 * The publish gate. Pure: given what is stored about a version, it says whether the version may be
 * published and lists every reason it may not. Only the newest lean run of the version counts.
 */
export function evaluateGate(input: GateInput): GateResult {
  const reasons = GATE_RULES.flatMap((rule) => rule.reasons(input));
  return { ok: reasons.length === 0, reasons };
}
