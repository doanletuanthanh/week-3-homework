"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Submits itself once on load; the visible button inside is the fallback when scripts are off. */
export function AutoSubmitForm({ action, children }: { action: () => Promise<void>; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    form.current?.requestSubmit();
  }, []);

  return (
    <form ref={form} action={action}>
      {children}
    </form>
  );
}
