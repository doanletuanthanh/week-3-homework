import Link from "next/link";
import { ATTEMPT_OUTCOME_LABEL, formatDuration, formatTime, formatUsd } from "@/components/admin/format";
import { Pager } from "@/components/admin/pager";
import { getDb } from "@/db/client";
import { ATTEMPT_OUTCOMES } from "@/db/schema";
import { listCustomAttempts, outcomeFilter } from "@/server/admin/learners";
import { firstParam, pageNumber } from "@/server/admin-paging";
import { requireAdmin } from "@/server/auth";

/** Learner custom-topic requests, newest first. The topic text is only on a request's own page. */
export default async function AdminCustomTopicsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdmin();
  const query = await searchParams;
  const outcome = outcomeFilter(firstParam(query.outcome));
  const attempts = await listCustomAttempts(getDb(), user, { outcome, page: pageNumber(query.page) });

  return (
    <>
      <h1 className="headline-lg">Chủ đề tự tạo</h1>
      <section className="card adm-panel">
        <form className="adm-fieldset" method="get">
          <div className="field">
            <label htmlFor="outcome-filter">Kết quả</label>
            <select id="outcome-filter" name="outcome" className="select" defaultValue={outcome ?? ""}>
              <option value="">Tất cả</option>
              {ATTEMPT_OUTCOMES.map((value) => (
                <option key={value} value={value}>
                  {ATTEMPT_OUTCOME_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-tonal btn-md">
            Lọc
          </button>
        </form>
        {attempts.rows.length === 0 ? (
          <p className="body-sm c-outline">Không có lần tạo chủ đề nào.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Lúc</th>
                  <th scope="col">Người học</th>
                  <th scope="col">Kết quả</th>
                  <th scope="col">Mã lỗi</th>
                  <th scope="col" className="adm-num">
                    Lần chạy
                  </th>
                  <th scope="col" className="adm-num">
                    Thời gian
                  </th>
                  <th scope="col" className="adm-num">
                    Chi phí
                  </th>
                </tr>
              </thead>
              <tbody>
                {attempts.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/custom-topics/${row.id}`} prefetch={false}>{formatTime(row.createdAt)}</Link>
                    </td>
                    <td>
                      <Link href={`/admin/learners/${row.userId}`} prefetch={false}>{row.email}</Link>
                    </td>
                    <td>{ATTEMPT_OUTCOME_LABEL[row.outcome] ?? row.outcome}</td>
                    <td className="adm-mono">{row.failureCode ?? row.reasonCode ?? "—"}</td>
                    <td className="adm-num">{row.runAttempt}</td>
                    <td className="adm-num">{formatDuration(row.createdAt, row.finishedAt)}</td>
                    <td className="adm-num">{formatUsd(row.costActualUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...attempts} path="/admin/custom-topics" params={{ outcome }} />
      </section>
    </>
  );
}
