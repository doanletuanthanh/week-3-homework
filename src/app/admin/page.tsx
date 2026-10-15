import { CapMeters, SpendByDayChart } from "@/components/admin/spend-chart";
import { SCOPE_LABEL, formatShare, formatUsd } from "@/components/admin/format";
import { StatTile } from "@/components/admin/stat-tile";
import { getDb } from "@/db/client";
import { OVERVIEW_DAYS, getAdminOverview } from "@/server/admin/overview";
import { requireAdmin } from "@/server/auth";

/**
 * Admin overview: LLM spend today against the caps, the last 30 days by scope, the roles that
 * cost the most, the cost of a session, and how much the product was used. The figures are the
 * ones `pnpm il cost-report` prints. No `Suspense` here: a non-admin must get a real 404 status,
 * which only an unstreamed response can carry.
 */
export default async function AdminOverviewPage() {
  const user = await requireAdmin();
  const overview = await getAdminOverview(getDb(), user);
  const todayUsd = overview.today.reduce((sum, scope) => sum + scope.usd, 0);
  const { usage, sessionCost } = overview;

  return (
    <>
      <h1 className="headline-lg">Tổng quan</h1>

      <section className="adm-tiles" aria-label="Số liệu chính">
        <StatTile label="Chi phí hôm nay" value={formatUsd(todayUsd)} hint="Mọi scope, theo ngày UTC+7" />
        <StatTile label={`Chi phí ${OVERVIEW_DAYS} ngày`} value={formatUsd(overview.windowUsd)} />
        <StatTile
          label="Mỗi buổi phỏng vấn"
          value={`p50 ${formatUsd(sessionCost.p50Usd)}`}
          hint={`p95 ${formatUsd(sessionCost.p95Usd)} · ${sessionCost.sessions} buổi có lần gọi`}
        />
        <StatTile label="Token từ cache" value={formatShare(overview.cacheHitShare)} hint="Phần token đầu vào nhà cung cấp lấy từ cache" />
        <StatTile label="Lần gọi lỗi" value={formatShare(overview.failedCallShare)} hint="Tính cả lần thử lại" />
        <StatTile label="Buổi đã bắt đầu" value={String(usage.window.sessionsStarted)} hint={`Hôm nay ${usage.today.sessionsStarted} · không tính demo`} />
        <StatTile label="Người học hoạt động" value={String(usage.window.activeLearners)} hint={`Hôm nay ${usage.today.activeLearners} · có lượt hỏi, không tính demo`} />
        <StatTile label="Lần tạo chủ đề" value={String(usage.window.customAttempts)} hint={`Hôm nay ${usage.today.customAttempts}`} />
      </section>

      <div className="adm-grid">
        <section className="card adm-panel">
          <h2 className="headline-sm">Hôm nay so với cap</h2>
          <CapMeters today={overview.today} />
        </section>
        <section className="card adm-panel">
          <h2 className="headline-sm">Role tốn nhất ({OVERVIEW_DAYS} ngày)</h2>
          {overview.topRoles.length === 0 ? (
            <p className="body-sm c-outline">Chưa có lần gọi nào.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Scope</th>
                  <th scope="col" className="adm-num">
                    Lần gọi
                  </th>
                  <th scope="col" className="adm-num">
                    Chi phí
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.topRoles.map((row) => (
                  <tr key={`${row.scope}:${row.role}`}>
                    <td>{row.role}</td>
                    <td>{SCOPE_LABEL[row.scope]}</td>
                    <td className="adm-num">{row.calls}</td>
                    <td className="adm-num">{formatUsd(row.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card adm-panel">
        <h2 className="headline-sm">Chi phí mỗi ngày ({OVERVIEW_DAYS} ngày)</h2>
        <SpendByDayChart days={overview.days} />
      </section>
    </>
  );
}
