"use client";

import { useEffect, useTransition } from "react";
import { ErrorRetry } from "@/components/ui/error-retry";
import { useRetryCount } from "@/components/ui/use-retry-count";
import "./globals.css";

/**
 * The standard error (PRD §6.0) when the layout itself failed, for example because the header
 * could not read who is signed in. It replaces the whole document, so it brings its own.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, startRetry] = useTransition();
  const { failedRetries, noteRetry } = useRetryCount();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <title>InterviewLab</title>
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
      </body>
    </html>
  );
}
