"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { CUSTOM_REPORT } from "@/strings/product-strings";

/** Màn 6 of a custom session: tells the operators the generated scenario has a problem (FR-56). */
export function ReportProblem({ sessionId, reported }: { sessionId: string; reported: boolean }) {
  const [done, setDone] = useState(reported);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function report() {
    setSending(true);
    setFailed(false);
    const outcome = await sendJson(`/api/sessions/${sessionId}/report-problem`, "POST", {});
    setSending(false);
    if (outcome.ok) setDone(true);
    else if (outcome.redirectTo) window.location.assign(outcome.redirectTo);
    else setFailed(true);
  }

  return (
    <section className="card report-problem" aria-label="Báo lỗi kịch bản">
      {done ? (
        <p className="body-md joined" role="status">
          <span className="check">
            <CheckIcon size={12} />
          </span>
          {CUSTOM_REPORT.done}
        </p>
      ) : (
        <>
          <p className="body-sm c-variant">Kịch bản này do AI sinh và chưa ai đọc. Nếu nhân vật trả lời vô lý hoặc nội dung không ổn, hãy báo cho chúng tôi.</p>
          <button type="button" className="btn btn-surface btn-md" onClick={() => void report()} disabled={sending}>
            {sending ? "Đang gửi…" : CUSTOM_REPORT.button}
          </button>
          {failed && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              Không kết nối được. Thử lại.
            </p>
          )}
        </>
      )}
    </section>
  );
}
