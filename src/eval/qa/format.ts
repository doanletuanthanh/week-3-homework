import type { QaReport } from "./types";

/** The lean report as the operator reads it in the terminal. */
export function formatQaReport(report: QaReport): string[] {
  const counts = new Map<string, number>();
  for (const observation of report.observations) {
    const name = `${observation.action.tool} (${observation.action.source})`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [
    `Báo cáo eval lean, phiên bản ${report.version}`,
    ...(report.reusedFrom ? [`Dùng lại báo cáo của ${report.reusedFrom}: không gọi model nào. Chạy lại thật bằng --no-cache.`] : []),
    `Phép thử: ${[...counts].map(([name, count]) => `${count} ${name}`).join(", ")}`,
    `Vòng suy xét: ${report.rounds.map((round) => `${round.decision}${round.actions > 0 ? ` (+${round.actions})` : ""}`).join(" → ") || "(không có)"}`,
    `Rủi ro agent đánh giá cao: ${report.risks.filter((risk) => risk.risk === "high").map((risk) => risk.itemId).join(", ") || "(không có)"}`,
    `Chi phí: ${report.cost.actualUsd.toFixed(4)} USD / trần ${report.cost.capUsd.toFixed(2)} USD, ${report.cost.calls} lần gọi`,
    "Ngưỡng:",
    ...report.thresholds.map((threshold) => `  [${threshold.met ? "ĐẠT" : "CHƯA ĐẠT"}] ${threshold.label}: ${threshold.detail}`),
    ...(report.warnings.length > 0 ? ["Lưu ý:", ...report.warnings.map((warning) => `  - ${warning}`)] : []),
    ...(report.findings.length > 0
      ? ["Góp ý của agent:", ...report.findings.map((finding) => `  - [${finding.severity}] ${[finding.itemId, finding.field].filter(Boolean).join(" / ") || "chung"}: ${finding.note}`)]
      : []),
  ];
}
