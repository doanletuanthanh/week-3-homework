"use client";

import { useFormStatus } from "react-dom";
import { ArrowRightIcon } from "@/components/icons";

/**
 * "Bắt đầu": locked, and saying so, while the session is being created. `another` is the demo
 * account's "Bắt đầu buổi mới", shown under the button that opens its newest session.
 */
export function StartSessionButton({ another = false }: { another?: boolean }) {
  const { pending } = useFormStatus();
  const label = another ? "Bắt đầu buổi mới" : "Bắt đầu";
  return (
    <button type="submit" className={`btn ${another ? "btn-tonal prep-another" : "btn-primary"} btn-lg prep-start`} disabled={pending}>
      {pending ? "Đang tạo buổi…" : label}
      {!pending && !another && <ArrowRightIcon />}
    </button>
  );
}
