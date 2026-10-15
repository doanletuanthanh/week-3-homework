import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ActionForm } from "@/components/admin/action-form";
import { EvalProgress } from "@/components/admin/eval-progress";
import { FLAG_STATUS_LABEL, RUN_STATUS_LABEL, SCENARIO_STATUS_LABEL, formatUsd } from "@/components/admin/format";
import { LeanReport } from "@/components/admin/lean-report";
import { ProbeTable } from "@/components/admin/probe-table";
import { VersionDiff } from "@/components/admin/version-diff";
import { getDb } from "@/db/client";
import type { StringState } from "@/eval/string-check";
import { getScenarioReview } from "@/server/admin/scenarios";
import { requireAdmin } from "@/server/auth";
import { runEvalJob } from "@/server/eval-job";
import {
  approveStringsAction,
  approveVersionAction,
  checkStringsAction,
  publishAction,
  ruleFlagAction,
  runLeanEvalAction,
  unpublishAction,
} from "../actions";

/** The page starts lean-eval runners and the string check, which run for minutes. */
export const maxDuration = 300;

const FAILURE_LABEL: Record<string, string> = {
  isolation: "cô lập context bị vỡ (lỗi engine)",
  model: "lỗi gọi model",
  budget: "chạm trần ngân sách của lần chạy",
  lost: "mất người chạy",
};

function StringsPanel({ title, target, personaId, states }: { title: string; target: string; personaId: string; states: StringState[] }) {
  const approved = states.filter((entry) => entry.approved).length;
  const unchecked = states.filter((entry) => !entry.checked).length;
  const failing = states.filter((entry) => entry.checked && !entry.checkOk);
  return (
    <div className="adm-stack">
      <h3 className="adm-h3">{title}</h3>
      <p className="body-sm c-variant">
        {approved}/{states.length} đã duyệt · {unchecked} chưa kiểm · {failing.length} không qua kiểm
      </p>
      {failing.length > 0 && (
        <ul className="adm-list">
          {failing.map((entry) => (
            <li key={entry.key}>
              <span className="adm-mono">{entry.key}</span>: {entry.text} <span className="c-error">{entry.problems.join(" ")}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="adm-meta">
        <ActionForm action={checkStringsAction}>
          <input type="hidden" name="personaId" value={personaId} />
          <input type="hidden" name="target" value={target} />
          <button type="submit" className="btn btn-tonal btn-sm" disabled={unchecked === 0}>
            Kiểm {unchecked} chuỗi chưa kiểm
          </button>
        </ActionForm>
        <ActionForm action={approveStringsAction}>
          <input type="hidden" name="personaId" value={personaId} />
          <input type="hidden" name="target" value={target} />
          <button type="submit" className="btn btn-tonal btn-sm" disabled={approved === states.length}>
            Duyệt mọi chuỗi đã qua kiểm
          </button>
        </ActionForm>
      </div>
    </div>
  );
}

/**
 * Review of one persona: its gate, its newest lean run with every probe, the leak flags to rule
 * on, the fixed strings, the versions and what changed, and its content with the locked items
 * (admins only). No `Suspense`: a non-admin must get a real 404 status.
 */
export default async function AdminScenarioPage({ params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAdmin();
  const { personaId } = await params;
  const review = await getScenarioReview(getDb(), user, personaId);
  if (!review) notFound();
  // A run whose runner died is started again by whoever looks at it: there is no scheduled job.
  const { dueRunId } = review;
  if (dueRunId) after(() => runEvalJob(getDb(), dueRunId).catch((error: unknown) => console.error(error)));

  const { scenario, run, report, gate, approval } = review;
  const id = scenario.personaId;
  const openFlags = review.flags.filter((entry) => entry.status === "open").length;

  return (
    <>
      <div className="adm-head">
        <div className="adm-stack">
          <Link href="/admin/scenarios" className="btn-link">
            ← Kịch bản
          </Link>
          <h1 className="headline-lg">{scenario.displayName}</h1>
          <div className="adm-meta body-sm c-variant">
            <span className="adm-mono">{id}</span>
            <span>· {review.topic.title}</span>
            <span>· phiên bản {scenario.version}</span>
            <span className="pill pill-neutral">{SCENARIO_STATUS_LABEL[scenario.status] ?? scenario.status}</span>
          </div>
        </div>
      </div>

      <div className="adm-grid">
        <section className="card adm-panel" aria-labelledby="gate-h">
          <h2 id="gate-h" className="headline-sm">
            Cổng publish
          </h2>
          {gate.ok ? (
            <p>
              <span className="pill pill-green">Qua</span> Phiên bản {scenario.version} publish được.
            </p>
          ) : (
            <ul className="adm-list" aria-label="Lý do chưa publish được">
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="body-sm c-variant">
            {approval
              ? `Duyệt bởi ${approval.adminEmail}${approval.onCurrentRun ? " trên lần eval mới nhất" : " trên một lần eval cũ: cần duyệt lại"}. “${approval.note}”`
              : "Chưa ai duyệt phiên bản này."}
          </p>
        </section>

        <section className="card adm-panel adm-actions" aria-labelledby="actions-h">
          <h2 id="actions-h" className="headline-sm">
            Thao tác
          </h2>
          <ActionForm action={runLeanEvalAction}>
            <input type="hidden" name="personaId" value={id} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={review.runLive}>
              Chạy eval lean
            </button>
          </ActionForm>
          <ActionForm action={approveVersionAction}>
            <input type="hidden" name="personaId" value={id} />
            <div className="field">
              <label htmlFor="approve-note">Ghi chú duyệt phiên bản</label>
              <input id="approve-note" name="note" className="input" required maxLength={2000} />
            </div>
            <button type="submit" className="btn btn-tonal btn-sm" disabled={run?.status !== "done"}>
              Duyệt phiên bản
            </button>
          </ActionForm>
          <div className="adm-meta">
            <ActionForm action={publishAction}>
              <input type="hidden" name="personaId" value={id} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!gate.ok || scenario.status === "published"}>
                Publish
              </button>
            </ActionForm>
            <ActionForm action={unpublishAction}>
              <input type="hidden" name="personaId" value={id} />
              <label className="body-sm">
                <input type="checkbox" name="stopSessions" /> Rút luôn các buổi chưa xong
              </label>
              <button type="submit" className="btn btn-ghost-danger btn-sm">
                Gỡ publish
              </button>
            </ActionForm>
          </div>
        </section>
      </div>

      <section className="card adm-panel" aria-labelledby="eval-h">
        <h2 id="eval-h" className="headline-sm">
          Eval lean gần nhất
        </h2>
        {!run ? (
          <p className="body-sm c-outline">Phiên bản này chưa được eval.</p>
        ) : (
          <>
            <p className="body-sm c-variant">
              {RUN_STATUS_LABEL[run.status] ?? run.status}
              {run.failureReason ? `: ${FAILURE_LABEL[run.failureReason] ?? run.failureReason}` : ""} · {formatUsd(run.costActualUsd ?? 0)} · bắt đầu{" "}
              {run.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
              {run.requestedBy ? ` bởi ${run.requestedBy}` : ""}
            </p>
            {review.runLive && <EvalProgress label="Đang eval… trang tự cập nhật." />}
            {report && <LeanReport report={report} />}
          </>
        )}
      </section>

      {report && (
        <section className="card adm-panel" aria-labelledby="probes-h">
          <h2 id="probes-h" className="headline-sm">
            Các phép thử
          </h2>
          <ProbeTable report={report} />
        </section>
      )}

      {review.flags.length > 0 && (
        <section className="card adm-panel" aria-labelledby="flags-h">
          <h2 id="flags-h" className="headline-sm">
            Cờ rò rỉ ({openFlags} chưa phân xử)
          </h2>
          {review.flags.map(({ flag, rulings, status }) => (
            <article key={flag.id} className="adm-stack" aria-label={`Cờ ${flag.itemId}`}>
              <div className="adm-meta">
                <span className={`pill ${status === "open" ? "pill-amber" : status === "confirmed" ? "pill-error" : "pill-green"}`}>{FLAG_STATUS_LABEL[status]}</span>
                <span className="adm-mono">
                  {flag.episode} · {flag.itemId} ({flag.kind})
                </span>
              </div>
              <p className="body-sm">“{flag.excerpt}”</p>
              <p className="body-sm c-variant">{flag.judgeReason}</p>
              {rulings.length > 0 && (
                <ul className="adm-list">
                  {rulings.map((ruling) => (
                    <li key={ruling.id}>
                      {ruling.adminEmail}: {ruling.verdict === "leak" ? "rò rỉ" : "không phải rò rỉ"}. {ruling.reason}
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={ruleFlagAction}>
                <input type="hidden" name="personaId" value={id} />
                <input type="hidden" name="flagId" value={flag.id} />
                <div className="field">
                  <label htmlFor={`reason-${flag.id}`}>Lý do</label>
                  <input id={`reason-${flag.id}`} name="reason" className="input" required maxLength={2000} />
                </div>
                <button type="submit" name="verdict" value="not_leak" className="btn btn-tonal btn-sm">
                  Không phải rò rỉ
                </button>
                <button type="submit" name="verdict" value="leak" className="btn btn-ghost-danger btn-sm">
                  Là rò rỉ
                </button>
              </ActionForm>
            </article>
          ))}
        </section>
      )}

      <section className="card adm-panel" aria-labelledby="strings-h">
        <h2 id="strings-h" className="headline-sm">
          Chuỗi cố định (FR-36, FR-60)
        </h2>
        <div className="adm-grid">
          <StringsPanel title="Của persona" target={id} personaId={id} states={review.strings.persona} />
          <StringsPanel title="Của sản phẩm (dùng chung)" target="product" personaId={id} states={review.strings.product} />
        </div>
      </section>

      <section className="card adm-panel" aria-labelledby="versions-h">
        <h2 id="versions-h" className="headline-sm">
          Phiên bản
        </h2>
        <ul className="adm-list">
          {review.versions.map((version) => (
            <li key={version.id}>
              Phiên bản {version.version}: {SCENARIO_STATUS_LABEL[version.status] ?? version.status} ·{" "}
              {version.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
            </li>
          ))}
        </ul>
        {review.diff && (
          <>
            <h3 className="adm-h3">Khác phiên bản trước</h3>
            <VersionDiff changes={review.diff} />
          </>
        )}
      </section>

      <section className="card adm-panel" aria-labelledby="items-h">
        <h2 id="items-h" className="headline-sm">
          Điều riêng (chỉ quản trị viên)
        </h2>
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Nội dung</th>
                <th scope="col">Câu gợi mở</th>
                <th scope="col">Câu hỏi mẫu</th>
              </tr>
            </thead>
            <tbody>
              {scenario.content.items.map((item) => (
                <tr key={item.id}>
                  <td className="adm-mono">
                    {item.id}
                    <div className="c-outline">
                      {item.topic_tag} · {item.path}
                    </div>
                  </td>
                  <td>{item.content}</td>
                  <td>{item.hook_line}</td>
                  <td>{item.sample_question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
