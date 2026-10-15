import Link from "next/link";
import { formatTime, formatUsd } from "@/components/admin/format";
import { Pager } from "@/components/admin/pager";
import { getDb } from "@/db/client";
import { listLearners } from "@/server/admin/learners";
import { pageNumber } from "@/server/admin-paging";
import { requireAdmin } from "@/server/auth";

/** Every account with its activity and spend. Reading the list is logged: emails are learner data. */
export default async function AdminLearnersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await requireAdmin();
  const { page } = await searchParams;
  const learners = await listLearners(getDb(), user, pageNumber(page));

  return (
    <>
      <h1 className="headline-lg">Người học</h1>
      <section className="card adm-panel">
        {learners.rows.length === 0 ? (
          <p className="body-sm c-outline">Chưa có tài khoản nào.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Lần đầu</th>
                  <th scope="col">Gần nhất</th>
                  <th scope="col" className="adm-num">
                    Buổi
                  </th>
                  <th scope="col" className="adm-num">
                    Lần tạo chủ đề
                  </th>
                  <th scope="col" className="adm-num">
                    Chi phí
                  </th>
                </tr>
              </thead>
              <tbody>
                {learners.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/learners/${row.id}`} prefetch={false}>{row.email}</Link>
                    </td>
                    <td>{formatTime(row.firstSeen)}</td>
                    <td>{formatTime(row.lastSeen)}</td>
                    <td className="adm-num">{row.sessions}</td>
                    <td className="adm-num">{row.customAttempts}</td>
                    <td className="adm-num">{formatUsd(row.spendUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...learners} path="/admin/learners" />
      </section>
    </>
  );
}
