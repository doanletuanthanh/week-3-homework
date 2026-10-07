"use client";

import { useFormStatus } from "react-dom";
import { ArrowRightIcon } from "@/components/icons";

/** "Bắt đầu": locked, and saying so, while the session is being created. */
export function StartSessionButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-lg prep-start" disabled={pending}>
      {pending ? "Đang tạo buổi…" : "Bắt đầu"}
      {!pending && <ArrowRightIcon />}
    </button>
  );
}
