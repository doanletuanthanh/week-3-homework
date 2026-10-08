"use client";

import { useEffect } from "react";
import { ErrorRetry } from "@/components/ui/error-retry";
import "./globals.css";

/**
 * The standard error (PRD §6.0) when the layout itself failed, for example because the header
 * could not read who is signed in. It replaces the whole document, so it brings its own.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <main className="center-page">
          <ErrorRetry failedRetries={0} onRetry={reset} />
        </main>
      </body>
    </html>
  );
}
