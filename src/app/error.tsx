"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ErrorRetry } from "@/components/ui/error-retry";

// Retries asked for, per page. Kept outside the component, which may be mounted again from
// nothing each time a retry fails. A full page load starts the count over.
const retriesAsked = new Map<string, number>();

/**
 * The standard error (PRD §6.0) for a page that failed to load. "Thử lại" asks the server for the
 * page again without a full reload; drafts the screens keep in the browser are read again when
 * the page comes back.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  // The address is read once: this component only exists for the page that failed.
  const [path] = useState(() => (typeof window === "undefined" ? "" : window.location.pathname));

  useEffect(() => {
    console.error(error);
  }, [error]);

  const count = retriesAsked.get(path) ?? 0;

  function retry() {
    retriesAsked.set(path, count + 1);
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  // This page is showing, so every retry asked for has failed, except one still on its way.
  const failedRetries = Math.max(0, count - (retrying ? 1 : 0));
  return (
    <main className="center-page">
      <ErrorRetry failedRetries={failedRetries} retrying={retrying} onRetry={retry} />
    </main>
  );
}
