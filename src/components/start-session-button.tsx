"use client";

import { useFormStatus } from "react-dom";
import { ArrowRightIcon } from "@/components/icons";

type Props = {
  /** "Bắt đầu" unless the session exists already and the press only leads into it. */
  label?: string;
  /** The demo account's "Bắt đầu buổi mới", shown under the button that opens its newest session. */
  another?: boolean;
  /** Sized for the foot of a persona card (Màn 2b) instead of the full-width button of Màn 3. */
  card?: boolean;
};

/** The button of Màn 3 that creates or enters a session: locked, and saying so, while that happens. */
export function StartSessionButton({ label, another = false, card = false }: Props) {
  const { pending } = useFormStatus();
  const text = label ?? (another ? "Bắt đầu buổi mới" : "Bắt đầu");
  return (
    <button type="submit" className={`btn ${another ? "btn-tonal" : "btn-primary"} ${card ? "btn-card" : `btn-lg prep-start${another ? " prep-another" : ""}`}`} disabled={pending}>
      {pending ? (label ? "Đang mở buổi…" : "Đang tạo buổi…") : text}
      {!pending && !another && <ArrowRightIcon />}
    </button>
  );
}
