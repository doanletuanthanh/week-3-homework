"use client";

import { useActionState } from "react";

/** What an admin action answers: shown under its form. */
export type ActionState = { ok: boolean; message: string } | null;

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
};

/** A form that runs one admin Server Action, is disabled while it runs, and shows what it answered. */
export function ActionForm({ action, children, className }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <fieldset className="adm-fieldset" disabled={pending}>
        {children}
      </fieldset>
      {state && (
        <p role="status" className={`body-sm ${state.ok ? "c-primary" : "c-error"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
