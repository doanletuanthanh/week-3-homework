"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often a page with a job under way reads it again. */
const REFRESH_MS = 2_000;

/**
 * Re-renders the server page every 2 s while a job (a lean eval or a draft) is under way, so the
 * status, and the report once it exists, appear without a reload. The page itself restarts a job
 * whose runner died, so this is also what keeps the job going: there is no scheduled job.
 */
export function EvalProgress({ label }: { label: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p role="status" className="body-sm c-outline">
      {label}
    </p>
  );
}
