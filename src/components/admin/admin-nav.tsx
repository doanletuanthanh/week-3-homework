"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The pages of the admin area. A page joins this list when it exists, so no link leads to a 404. */
export const ADMIN_NAV = [{ href: "/admin", label: "Tổng quan" }] as const;

/** The admin area's own nav, marking the page the admin is on. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="nav adm-nav" aria-label="Quản trị">
      {ADMIN_NAV.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <Link key={href} href={href} className={current ? "on" : undefined} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
