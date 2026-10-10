"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

const DESTINATIONS = {
  library: { href: "/library", label: "Thư viện" },
  mySessions: { href: "/my-sessions", label: "Buổi của tôi" },
} as const;

/**
 * A destination of the header, marked as the current page while the visitor is on it. The
 * library is also marked, without being called the current page, on a topic's page: that page
 * is inside it.
 */
export function HeaderLink({ to, children }: { to: keyof typeof DESTINATIONS; children?: ReactNode }) {
  const pathname = usePathname();
  const { href, label } = DESTINATIONS[to];
  const current = pathname === href;
  const inside = to === "library" && pathname.startsWith("/topics/");
  return (
    <Link href={href} className={current || inside ? "on" : undefined} aria-current={current ? "page" : undefined}>
      {children}
      {label}
    </Link>
  );
}

type Props = {
  className: string;
  /** What the closed menu shows: the avatar on a wide screen, the menu button on a narrow one. */
  summary: ReactNode;
  summaryClassName: string;
  summaryLabel: string;
  children: ReactNode;
};

/**
 * A header menu on the native disclosure element, so it opens with the keyboard and without
 * script. Script only closes it: on Esc, on a press outside it, and when the page changes (the
 * header stays mounted between pages, so an open menu would otherwise stay open over the next one).
 */
export function HeaderMenu({ className, summary, summaryClassName, summaryLabel, children }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const element = details.current;
    if (!element) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.open) return;
      element.open = false;
      element.querySelector("summary")?.focus();
    };
    const onPress = (event: PointerEvent) => {
      if (element.open && !element.contains(event.target as Node)) element.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, []);

  return (
    <details
      className={className}
      ref={details}
      onClick={(event) => {
        if ((event.target as Element).closest("a") && details.current) details.current.open = false;
      }}
    >
      <summary className={summaryClassName} aria-label={summaryLabel}>
        {summary}
      </summary>
      {children}
    </details>
  );
}
