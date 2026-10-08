"use client";

import { useFormStatus } from "react-dom";
import { ArrowRightIcon } from "@/components/icons";

type Props = {
  /** "Bắt đầu" unless the session exists already and the press only leads into it. */
  label?: string;
  /** The demo account's "Bắt đầu buổi mới", shown under the button that opens its newest session. */
  another?: boolean;
};

/** The button of Màn 3 that creates or enters a session: locked, and saying so, while that happens. */
export function StartSessionButton({ label, another = false }: Props) {
  const { pending } = useFormStatus();
  const text = label ?? (another ? "Bắt đầu buổi mới" : "Bắt đầu");
  return (
    <button type="submit" className={`btn ${another ? "btn-tonal prep-another" : "btn-primary"} btn-lg prep-start`} disabled={pending}>
      {pending ? (label ? "Đang mở buổi…" : "Đang tạo buổi…") : text}
      {!pending && !another && <ArrowRightIcon />}
    </button>
  );
}
