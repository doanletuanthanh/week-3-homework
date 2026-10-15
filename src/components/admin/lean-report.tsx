import type { QaReport } from "@/eval/qa/types";
import { formatUsd } from "./format";

const RISK_CLASS = { high: "pill-error", medium: "pill-amber", low: "pill-neutral" } as const;
const DECISION_LABEL = { done: "dừng", probe_more: "thử thêm", budget: "hết ngân sách", max_rounds: "hết số vòng" } as const;

/**
 * The lean report beside its probes: thresholds, the agent's reading of the public fields, its
 * risk map, what it decided each round, and its suggested fixes (field path + reason).
 */
export function LeanReport({ report }: { report: QaReport }) {
  const rounds = report.rounds.map((round) => `${DECISION_LABEL[round.decision]}${round.actions > 0 ? ` (+${round.actions} phép thử)` : ""}`);
  return (
    <div className="adm-stack">
      <p className="body-sm c-variant">
        Phiên bản {report.version} · {formatUsd(report.cost.actualUsd)} / trần {formatUsd(report.cost.capUsd)} · {report.cost.calls} lần gọi
        {report.reusedFrom ? ` · dùng lại báo cáo ${report.reusedFrom}, không gọi model` : ""}
      </p>
      <ul className="adm-list" aria-label="Ngưỡng">
        {report.thresholds.map((threshold) => (
          <li key={threshold.key}>
            <span className={`pill ${threshold.met ? "pill-green" : "pill-error"}`}>{threshold.met ? "Đạt" : "Chưa đạt"}</span> {threshold.label}:{" "}
            <span className="c-variant">{threshold.detail}</span>
          </li>
        ))}
      </ul>
      {report.warnings.length > 0 && (
        <>
          <h3 className="adm-h3">Lưu ý</h3>
          <ul className="adm-list">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </>
      )}
      {report.publicLeaks.length > 0 && (
        <>
          <h3 className="adm-h3">Trường công khai chạm điều riêng</h3>
          <ul className="adm-list">
            {report.publicLeaks.map((leak) => (
              <li key={`${leak.field}:${leak.itemId}`}>
                <span className={`pill ${leak.kind === "content" ? "pill-error" : "pill-amber"}`}>{leak.kind === "content" ? "Lộ nội dung" : "Gợi chủ đề"}</span>{" "}
                <span className="adm-mono">
                  {leak.field} → {leak.itemId}
                </span>
                : “{leak.quote}”. <span className="c-variant">{leak.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="adm-h3">Bản đồ rủi ro</h3>
      {report.risks.length === 0 ? (
        <p className="body-sm c-outline">Agent không đánh giá rủi ro nào.</p>
      ) : (
        <ul className="adm-list">
          {report.risks.map((risk) => (
            <li key={risk.itemId}>
              <span className={`pill ${RISK_CLASS[risk.risk]}`}>{risk.risk}</span> <span className="adm-mono">{risk.itemId}</span>: {risk.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="body-sm c-variant">Các vòng suy xét: {rounds.join(" → ") || "(không có)"}</p>
      <h3 className="adm-h3">Góp ý sửa kịch bản</h3>
      {report.findings.length === 0 ? (
        <p className="body-sm c-outline">Không có góp ý.</p>
      ) : (
        <ul className="adm-list">
          {report.findings.map((finding, index) => (
            <li key={index}>
              <span className={`pill ${finding.severity === "warning" ? "pill-amber" : "pill-neutral"}`}>{finding.severity}</span>{" "}
              <span className="adm-mono">{[finding.itemId, finding.field].filter(Boolean).join(" / ") || "chung"}</span>: {finding.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
