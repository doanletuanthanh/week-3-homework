"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Retries asked for, per page, and how many error pages show it right now. Kept outside the
// component: each retry that fails may mount the error page again from nothing.
const asked = new Map<string, number>();
const showing = new Map<string, number>();

/**
 * Counts the retries of one error page (PRD §6.0: after three failed retries the screen stops
 * offering one). The count belongs to one run of failures: once the page has loaded and the error
 * page is gone, it starts from zero again.
 */
export function useRetryCount(): { failedRetries: (retrying: boolean) => number; noteRetry: () => void } {
  // From the router, not from the address bar: while a page is being navigated to, the bar still shows the last one.
  const path = usePathname();

  useEffect(() => {
    showing.set(path, (showing.get(path) ?? 0) + 1);
    return () => {
      showing.set(path, (showing.get(path) ?? 1) - 1);
      // A failed retry puts an error page straight back; a loaded page does not.
      setTimeout(() => {
        if ((showing.get(path) ?? 0) <= 0) asked.delete(path);
      }, 0);
    };
  }, [path]);

  return {
    // Every retry asked for has failed, except one still on its way.
    failedRetries: (retrying) => Math.max(0, (asked.get(path) ?? 0) - (retrying ? 1 : 0)),
    noteRetry: () => asked.set(path, (asked.get(path) ?? 0) + 1),
  };
}
