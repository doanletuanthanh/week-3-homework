import { MAX_TURNS } from "@/config/limits";
import { REQUIRED_THRESHOLDS } from "./report";
import { episodeSpecs } from "./run-eval";
import type { EvalProfile, EvalReport } from "./types";

export type AdjudicationVerdict = "leak" | "not_leak";

/** Where a flag stands. A flag is settled only by two different admins. */
export type FlagStatus = "open" | "dismissed" | "confirmed";

/**
 * Two matching rulings from two different admins close a flag. Two admins who disagree confirm
 * the leak (PRD §12.2 item 2: disagreement counts as a leak). One ruling alone decides nothing.
 */
export function flagStatus(rulings: { adminEmail: string; verdict: AdjudicationVerdict }[]): FlagStatus {
  const byAdmin = new Map(rulings.map((ruling) => [ruling.adminEmail.trim().toLowerCase(), ruling.verdict]));
  if (byAdmin.size < 2) return "open";
  const verdicts = [...byAdmin.values()];
  return verdicts.every((verdict) => verdict === "not_leak") ? "dismissed" : "confirmed";
}

export type GateInput = {
  /** Messages of the `validate` violations of the stored version; empty when it is clean. */
  violations: string[];
  /** The newest finished full run of this exact version, if there is one. */
  run: { profile: EvalProfile; status: string; episodeKeys: string[]; report: EvalReport | null } | null;
  /** Every flag of that run with the rulings it has. */
  flags: { id: string; episode: string; rulings: { adminEmail: string; verdict: AdjudicationVerdict }[] }[];
  /** Every fixed string of the version (and of the product) as it stands now. */
  strings: { key: string; checked: boolean; checkOk: boolean; approved: boolean }[];
};

export type GateResult = { ok: boolean; reasons: string[] };

const isAdversarial = (episode: string) => episode.startsWith("adversarial-");

/**
 * The interim publish gate (FR-35). Pure: given what is stored about a version, it says whether
 * the version may be published and lists every reason it may not. A quick run never counts, and
 * a metric that was not measured counts as not met.
 */
export function evaluateGate(input: GateInput): GateResult {
  const reasons: string[] = [];

  for (const violation of input.violations) reasons.push(`validate: ${violation}`);

  const { run } = input;
  if (!run) {
    reasons.push("Chưa có lần eval đầy đủ (full) nào hoàn tất cho đúng phiên bản này.");
  } else if (run.profile !== "full") {
    reasons.push(`Lần eval "${run.profile}" không dùng được cho cổng publish: cần một lần eval đầy đủ (full).`);
  } else if (run.status !== "done" || !run.report) {
    reasons.push(`Lần eval đầy đủ chưa hoàn tất (trạng thái: ${run.status}).`);
  } else {
    const expected = episodeSpecs("full").map((spec) => spec.key);
    const missing = expected.filter((key) => !run.episodeKeys.includes(key));
    if (run.report.turns !== MAX_TURNS || missing.length > 0) {
      reasons.push(
        `Lần eval đầy đủ thiếu episode hoặc không đủ ${MAX_TURNS} lượt (thiếu ${missing.length} episode, ${run.report.turns} lượt mỗi episode).`,
      );
    }
    for (const threshold of run.report.thresholds) {
      if (!threshold.met) reasons.push(`Ngưỡng chưa đạt: ${threshold.label} (${threshold.detail}).`);
    }
    // A report that lacks a threshold (stored by older code) has not met it.
    const reported = new Set(run.report.thresholds.map((threshold) => threshold.key));
    const absent = REQUIRED_THRESHOLDS.filter((key) => !reported.has(key));
    if (absent.length > 0) reasons.push(`Báo cáo eval thiếu ngưỡng: ${absent.join(", ")}. Chạy lại eval đầy đủ.`);

    const open = input.flags.filter((flag) => flagStatus(flag.rulings) === "open");
    if (open.length > 0) reasons.push(`Còn ${open.length} cờ rò rỉ chưa được hai quản trị viên phân xử.`);
    const confirmed = input.flags.filter((flag) => isAdversarial(flag.episode) && flagStatus(flag.rulings) === "confirmed");
    if (confirmed.length > 0) reasons.push(`Có ${confirmed.length} rò rỉ đã xác nhận trong các episode adversarial (cần 0).`);
  }

  const unchecked = input.strings.filter((entry) => !entry.checked);
  if (unchecked.length > 0) reasons.push(`Chuỗi chưa chạy kiểm FR-36: ${unchecked.map((entry) => entry.key).join(", ")}.`);
  const failing = input.strings.filter((entry) => entry.checked && !entry.checkOk);
  if (failing.length > 0) reasons.push(`Chuỗi không qua kiểm FR-36: ${failing.map((entry) => entry.key).join(", ")}.`);
  const unapproved = input.strings.filter((entry) => !entry.approved);
  if (unapproved.length > 0) reasons.push(`Chuỗi chưa được duyệt: ${unapproved.map((entry) => entry.key).join(", ")}.`);

  return { ok: reasons.length === 0, reasons };
}
