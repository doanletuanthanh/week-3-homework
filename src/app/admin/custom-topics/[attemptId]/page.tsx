import Link from "next/link";
import { notFound } from "next/navigation";
import { ATTEMPT_OUTCOME_LABEL, formatDuration, formatTime, formatUsd } from "@/components/admin/format";
import { getDb } from "@/db/client";
import { getCustomAttempt } from "@/server/admin/learners";
import { requireAdmin } from "@/server/auth";

/** One custom-topic request with the topic the learner typed. Opening it is logged (`read_custom_topic`). */
export default async function AdminCustomTopicPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireAdmin();
  const { attemptId } = await params;
  const found = await getCustomAttempt(getDb(), user, attemptId);
  if (!found) notFound();
  const { attempt, email } = found;
  const { violations = [], unsafe = [], error, repairs = [], routeCheck } = attempt.report;
  const itemNames = (indexes: number[]) => indexes.map((index) => `items[${index}]`).join(", ");

  return (
    <>
      <div className="adm-stack">
        <Link href="/admin/custom-topics" className="btn-link">
          ← Chủ đề tự tạo
        </Link>
        <h1 className="headline-lg">Lần tạo chủ đề</h1>
        <p className="adm-mono c-outline">{attempt.id}</p>
      </div>
      <section className="card adm-panel">
        <dl className="adm-trace">
          <div>
            <dt>Người học</dt>
            <dd>
              <Link href={`/admin/learners/${attempt.userId}`}>{email}</Link>
            </dd>
          </div>
          <div>
            <dt>Chủ đề</dt>
            <dd>{attempt.topicText}</dd>
          </div>
          <div>
            <dt>Trọng tâm</dt>
            <dd>{attempt.focus}</dd>
          </div>
          <div>
            <dt>Kết quả</dt>
            <dd>
              {ATTEMPT_OUTCOME_LABEL[attempt.outcome] ?? attempt.outcome}
              {(attempt.failureCode ?? attempt.reasonCode) && ` (${attempt.failureCode ?? attempt.reasonCode})`}
            </dd>
          </div>
          <div>
            <dt>Lúc</dt>
            <dd>
              {formatTime(attempt.createdAt)} · {formatDuration(attempt.createdAt, attempt.finishedAt)} · {attempt.runAttempt} lần chạy
            </dd>
          </div>
          <div>
            <dt>Chi phí</dt>
            <dd>{formatUsd(attempt.costActualUsd)}</dd>
          </div>
          {attempt.sessionId && (
            <div>
              <dt>Buổi</dt>
              <dd>
                {attempt.scenarioId ? <Link href={`/admin/sessions/${attempt.sessionId}`}>Mở bản ghi buổi</Link> : <span className="adm-mono">{attempt.sessionId}</span>}
              </dd>
            </div>
          )}
        </dl>
      </section>
      {(violations.length > 0 || unsafe.length > 0 || error) && (
        <section className="card adm-panel">
          <h2 className="headline-sm">Kiểm tra tìm thấy</h2>
          <ul className="adm-list">
            {violations.map((violation, index) => (
              <li key={`v${index}`}>{violation}</li>
            ))}
            {unsafe.map((entry, index) => (
              <li key={`u${index}`}>
                {entry.field} · {entry.kind}: {entry.reason}
              </li>
            ))}
            {error && <li>{error}</li>}
          </ul>
        </section>
      )}
      {repairs.length > 0 && (
        <section className="card adm-panel">
          <h2 className="headline-sm">Các lần sửa</h2>
          <ul className="adm-list">
            {repairs.map((repair, index) => (
              <li key={`r${index}`}>
                {repair.mode === "full" ? "Viết lại cả kịch bản" : "Sửa đúng phần lỗi"}: {repair.violations.join("; ")}
                {repair.ignored && repair.ignored.length > 0 && ` · bỏ qua phần không được yêu cầu: ${repair.ignored.join(", ")}`}
                {repair.dropped && ` · bản sửa không được giữ vì vi phạm: ${repair.dropped.join("; ")}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {routeCheck && (
        <section className="card adm-panel">
          <h2 className="headline-sm">Kiểm tra định tuyến</h2>
          <p className="body-sm">
            {routeCheck.confusable.length === 0
              ? `Mọi nhãn phân biệt được${routeCheck.repaired ? " sau một lần sửa" : ""}.`
              : `Còn dễ nhầm: ${itemNames(routeCheck.confusable)}${routeCheck.repaired ? " (đã thử sửa một lần)" : ""}. Kịch bản vẫn được dùng; nhân vật khó mở hơn ở các mục này.`}
          </p>
        </section>
      )}
    </>
  );
}
