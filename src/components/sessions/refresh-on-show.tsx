"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Asks the server for the page again each time it is shown: on arriving, and when the browser's
 * back button brings it out of its cache. A session the learner just left has usually changed.
 */
export function RefreshOnShow() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);
  return null;
}
