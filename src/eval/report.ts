import type { Scenario } from "@/scenario/schema";
import type { EpisodeKind, EpisodeResult, EvalProfile, EvalReport, Threshold } from "./types";

/** Calibration target of FR-34: a good run opens this share of the items. */
export const CALIBRATION_TARGET = { min: 0.5, max: 0.75 } as const;
/** PRD §12.2 item 2. */
export const MIN_GOOD_OPENED = 3;
export const MIN_GOOD_TO_BAD = 2;
export const MIN_HOOK_TRANSMISSION = 0.95;
export const MAX_VERIFIER_DISAGREEMENT = 0.1;

/** The thresholds of PRD §12.2 item 2 a report must carry for the publish gate to read it. */
export const REQUIRED_THRESHOLDS = ["good_opens_enough", "good_vs_bad", "hook_transmission", "verifier_disagreement"] as const;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * The FR-34 report of a run, computed from its finished episodes. The thresholds here are the
 * ones a report can decide by itself; "no confirmed leak" needs the adjudicators and is decided
 * by the publish gate.
 */
export function buildReport(
  scenario: Scenario,
  run: { profile: EvalProfile; turns: number; estimateUsd: number },
  episodes: EpisodeResult[],
): EvalReport {
  const of = (...kinds: EpisodeKind[]) => episodes.filter((episode) => kinds.includes(episode.kind));
  const openedStat = (kind: EpisodeKind) => {
    const runs = of(kind).map((episode) => episode.openedItemIds.length);
    return { runs, median: median(runs) };
  };
  const leakStat = (...kinds: EpisodeKind[]) => {
    const group = of(...kinds);
    const flags = group.reduce((sum, episode) => sum + episode.flags.length, 0);
    return { episodes: group.length, flags, perEpisode: group.length === 0 ? 0 : flags / group.length };
  };

  const good = openedStat("good");
  const bad = openedStat("bad");
  const itemCount = scenario.items.length;
  const ratio = good.median / itemCount;

  const engine = of("good", "bad", "adversarial");
  const hookTurns = engine.flatMap((episode) => episode.turns).filter((turn) => turn.hookSelected !== null);
  const dropped = hookTurns.filter((turn) => turn.hookDropped === true).length;
  const hookRate = hookTurns.length === 0 ? null : dropped / hookTurns.length;

  const contradictionCount = engine.reduce((sum, episode) => sum + episode.contradictions.length, 0);
  const openedItems = engine.reduce((sum, episode) => sum + episode.openedItemIds.length, 0);

  const thresholds: Threshold[] = [
    {
      key: "good_opens_enough",
      label: `Run tốt mở ≥ ${MIN_GOOD_OPENED} item`,
      met: good.runs.length > 0 && good.median >= MIN_GOOD_OPENED,
      detail: `trung vị ${good.median} (${good.runs.join(", ") || "không có run"})`,
    },
    {
      key: "good_vs_bad",
      label: `Run tốt mở ≥ ${MIN_GOOD_TO_BAD} lần run xấu`,
      met: good.runs.length > 0 && bad.runs.length > 0 && good.median >= MIN_GOOD_TO_BAD * bad.median,
      detail: `tốt ${good.median}, xấu ${bad.median}`,
    },
    {
      key: "hook_transmission",
      label: `Persona truyền đạt hook được chọn ≥ ${percent(MIN_HOOK_TRANSMISSION)}`,
      met: hookRate !== null && hookRate >= MIN_HOOK_TRANSMISSION,
      detail: hookRate === null ? "không có hook nào được chọn" : `${dropped}/${hookTurns.length} (${percent(hookRate)})`,
    },
    {
      key: "verifier_disagreement",
      label: `Bất đồng verifier ≤ ${percent(MAX_VERIFIER_DISAGREEMENT)}`,
      met: false,
      detail: "chưa đo: eval chưa chạy reveal",
    },
  ];

  return {
    profile: run.profile,
    turns: run.turns,
    itemCount,
    opened: { good, bad },
    calibration: { ratio, inTarget: ratio >= CALIBRATION_TARGET.min && ratio <= CALIBRATION_TARGET.max },
    leaks: { learner: leakStat("good", "bad"), adversarial: leakStat("adversarial"), baseline: leakStat("baseline") },
    hookTransmission: { selected: hookTurns.length, dropped, rate: hookRate },
    contradictions: {
      count: contradictionCount,
      openedItems,
      rate: openedItems === 0 ? null : contradictionCount / openedItems,
    },
    verifierDisagreement: null,
    thresholds,
    cost: { estimateUsd: run.estimateUsd, actualUsd: episodes.reduce((sum, episode) => sum + episode.costUsd, 0) },
  };
}

/** The report as lines for a terminal. */
export function formatReport(report: EvalReport): string[] {
  const { opened, calibration, leaks, hookTransmission, contradictions, cost } = report;
  const leakLine = (name: string, stat: EvalReport["leaks"]["learner"]) =>
    `  ${name}: ${stat.flags} cờ / ${stat.episodes} episode (${stat.perEpisode.toFixed(2)} mỗi episode)`;
  return [
    `Báo cáo eval (${report.profile}, ${report.turns} lượt mỗi episode, ${report.itemCount} item)`,
    `Item mở, run tốt: trung vị ${opened.good.median} (${opened.good.runs.join(", ") || "-"})`,
    `Item mở, run xấu: trung vị ${opened.bad.median} (${opened.bad.runs.join(", ") || "-"})`,
    `Hiệu chỉnh: run tốt mở ${percent(calibration.ratio)} số item (mục tiêu ${percent(CALIBRATION_TARGET.min)}–${percent(CALIBRATION_TARGET.max)}): ${calibration.inTarget ? "trong mục tiêu" : "ngoài mục tiêu"}`,
    "Cờ rò rỉ (chưa phân xử):",
    leakLine("run tốt và xấu", leaks.learner),
    leakLine("adversarial", leaks.adversarial),
    leakLine("baseline chỉ-prompt", leaks.baseline),
    `Truyền đạt hook: ${hookTransmission.rate === null ? "không có hook nào được chọn" : `${hookTransmission.dropped}/${hookTransmission.selected} (${percent(hookTransmission.rate)})`}`,
    `Mâu thuẫn trước/sau mở item: ${contradictions.count} trên ${contradictions.openedItems} item đã mở${contradictions.rate === null ? "" : ` (${percent(contradictions.rate)})`}`,
    "Ngưỡng:",
    ...report.thresholds.map((threshold) => `  [${threshold.met ? "ĐẠT" : "CHƯA ĐẠT"}] ${threshold.label}: ${threshold.detail}`),
    `Chi phí: ước tính ${cost.estimateUsd.toFixed(2)} USD, thực tế ${cost.actualUsd.toFixed(4)} USD`,
  ];
}
