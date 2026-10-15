import Link from "next/link";
import { notFound } from "next/navigation";
import { SESSION_STATUS_LABEL, formatTime, formatUsd } from "@/components/admin/format";
import { Pager } from "@/components/admin/pager";
import { StatTile } from "@/components/admin/stat-tile";
import { getDb } from "@/db/client";
import { getLearner } from "@/server/admin/learners";
import { pageNumber } from "@/server/admin-paging";
import { requireAdmin } from "@/server/auth";

/** One account: its activity and its sessions, each with its cost and a link to its transcript. */
export default async function AdminLearnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireAdmin();
  const [{ userId }, { page }] = await Promise.all([params, searchParams]);
  const detail = await getLearner(getDb(), user, userId, pageNumber(page));
  if (!detail) notFound();
  const { learner, sessions } = detail;

  return (
    <>
      <div className="adm-stack">
        <Link href="/admin/learners" className="btn-link">
          ← Người học
        </Link>
        <h1 className="headline-lg">{learner.email}</h1>
        <p className="adm-mono c-outline">{learner.id}</p>
      </div>
      <section className="adm-tiles" aria-label="Hoạt động">
        <StatTile label="Lần đầu" value={formatTime(learner.firstSeen)} />
        <StatTile label="Gần nhất" value={formatTime(learner.lastSeen)} />
        <StatTile label="Buổi · lần tạo chủ đề" value={`${learner.sessions} · ${learner.customAttempts}`} />
        <StatTile label="Chi phí" value={formatUsd(learner.spendUsd)} hint="Các buổi và lần tạo chủ đề, tính cả lần thử lại" />
      </section>
      <section className="card adm-panel">
        <h2 className="headline-sm">Buổi</h2>
        {sessions.rows.length === 0 ? (
          <p className="body-sm c-outline">Chưa có buổi nào.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Bắt đầu</th>
                  <th scope="col">Persona</th>
                  <th scope="col">Chủ đề</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="adm-num">
                    Chi phí
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatTime(row.startedAt)}</td>
                    <td>
                      {row.personaId ? <Link href={`/admin/sessions/${row.id}`} prefetch={false}>{row.displayName}</Link> : <span className="c-outline">Chưa có kịch bản</span>}
                      {row.isDemo && <span className="pill pill-neutral"> demo</span>}
                    </td>
                    <td>{row.topicTitle ?? "—"}</td>
                    <td>{SESSION_STATUS_LABEL[row.status] ?? row.status}</td>
                    <td className="adm-num">{formatUsd(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...sessions} path={`/admin/learners/${learner.id}`} />
      </section>
    </>
  );
}
