import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/server/auth";

/**
 * The admin area (`ADMIN_EMAILS` only). Anyone else gets 404, as if it did not exist; the area has
 * no title of its own, which a 404 page could otherwise show. This check
 * only keeps the nav from showing: each page checks again before it reads anything.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <main className="container adm">
      <div className="adm-head">
        <span className="eyebrow">Quản trị</span>
        <AdminNav />
      </div>
      {children}
    </main>
  );
}
