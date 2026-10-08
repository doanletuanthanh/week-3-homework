"use client";

import { useEffect, useTransition } from "react";
import { ErrorRetry } from "@/components/ui/error-retry";
import { useRetryCount } from "@/components/ui/use-retry-count";

/**
 * The standard error (PRD §6.0) for a page that failed to load. "Thử lại" asks the server for the
 * page again without a full reload; drafts the screens keep in the browser are read again when
 * the page comes back.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, startRetry] = useTransition();
  const { failedRetries, noteRetry } = useRetryCount();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="center-page">
      <ErrorRetry
        failedRetries={failedRetries(retrying)}
        retrying={retrying}
        onRetry={() => {
          noteRetry();
          startRetry(() => retry());
        }}
      />
    </main>
  );
}
