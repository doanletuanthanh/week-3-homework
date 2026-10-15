import Link from "next/link";
import { RUN_STATUS_LABEL, SCENARIO_STATUS_LABEL, formatUsd } from "@/components/admin/format";
import { getDb } from "@/db/client";
import { listScenarioReviews } from "@/server/admin/scenarios";
import { requireAdmin } from "@/server/auth";

/**
 * Scenario review: every curated persona at its newest version, whether it passes the publish
 * gate (or why not), its newest lean run and its cost.
 */
export default async function AdminScenariosPage() {
  const user = await requireAdmin();
  const rows = await listScenarioReviews(getDb(), user);

  return (
    <>
      <div className="adm-head">
        <h1 className="headline-lg">Kịch bản</h1>
        <Link href="/admin/scenarios/new" className="btn btn-primary btn-md">
          Soạn persona mới
        </Link>
      </div>
      <section className="card adm-panel">
        {rows.length === 0 ? (
          <p className="body-sm c-outline">Chưa có persona nào. Nhập bằng il import hoặc soạn mới.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Chủ đề</th>
                  <th scope="col" className="adm-num">
                    Phiên bản
                  </th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Cổng publish</th>
                  <th scope="col">Eval lean gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.personaId}>
                    <td>
                      <Link href={`/admin/scenarios/${encodeURIComponent(row.personaId)}`}>{row.displayName}</Link>
                      <div className="adm-mono c-outline">{row.personaId}</div>
                    </td>
                    <td>{row.topicTitle}</td>
                    <td className="adm-num">{row.version}</td>
                    <td>{SCENARIO_STATUS_LABEL[row.status] ?? row.status}</td>
                    <td>
                      {row.gate.ok ? (
                        <span className="pill pill-green">Qua</span>
                      ) : (
                        <details className="adm-details">
                          <summary>
                            <span className="pill pill-amber">{row.gate.reasons.length} lý do</span>
                          </summary>
                          <ul className="adm-list">
                            {row.gate.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>{row.lean ? `${RUN_STATUS_LABEL[row.lean.status] ?? row.lean.status} · ${formatUsd(row.lean.costUsd)}` : "Chưa chạy"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
