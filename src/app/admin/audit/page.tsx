import Link from "next/link";
import { formatTime } from "@/components/admin/format";
import { Pager } from "@/components/admin/pager";
import { getDb } from "@/db/client";
import { listAuditLog } from "@/server/admin/config";
import { firstParam, pageNumber } from "@/server/admin-paging";
import { requireAdmin } from "@/server/auth";

/** Every time an admin read learner data or changed something, newest first. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const query = { page: firstParam(params.page), admin: firstParam(params.admin), action: firstParam(params.action) };
  const log = await listAuditLog(getDb(), user, { adminEmail: query.admin, actionPrefix: query.action, page: pageNumber(query.page) });

  return (
    <>
      <h1 className="headline-lg">Nhật ký truy cập</h1>
      <section className="card adm-panel">
        <form className="adm-fieldset" method="get">
          <div className="field">
            <label htmlFor="audit-admin">Quản trị viên</label>
            <select id="audit-admin" name="admin" className="select" defaultValue={query.admin ?? ""}>
              <option value="">Tất cả</option>
              {log.admins.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="audit-action">Hành động bắt đầu bằng</label>
            <input id="audit-action" name="action" className="input" defaultValue={query.action ?? ""} placeholder="vd: read_transcript, config set" />
          </div>
          <button type="submit" className="btn btn-tonal btn-md">
            Lọc
          </button>
        </form>
        {log.rows.length === 0 ? (
          <p className="body-sm c-outline">Không có dòng nào.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Lúc</th>
                  <th scope="col">Quản trị viên</th>
                  <th scope="col">Kênh</th>
                  <th scope="col">Hành động</th>
                  <th scope="col">Dữ liệu</th>
                </tr>
              </thead>
              <tbody>
                {log.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatTime(row.at)}</td>
                    <td>{row.adminEmail}</td>
                    <td>{row.channel}</td>
                    <td className="adm-mono">{row.action}</td>
                    <td>
                      {row.sessionId ? (
                        <Link href={`/admin/sessions/${row.sessionId}`}>Buổi</Link>
                      ) : row.userId ? (
                        <Link href={`/admin/learners/${row.userId}`}>Người học</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...log} path="/admin/audit" params={{ admin: query.admin, action: query.action }} />
      </section>
    </>
  );
}
