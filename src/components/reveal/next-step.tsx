"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";

/**
 * Màn 6 item 7. This slice has one persona, so every learner who gets here has practised them
 * all: the page says so and offers the waitlist. Pressing it again writes nothing new.
 */
export function NextStep({ waitlisted }: { waitlisted: boolean }) {
  const [joined, setJoined] = useState(waitlisted);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function join() {
    setSending(true);
    setFailed(false);
    const outcome = await sendJson("/api/waitlist", "POST", { context: "no_more_personas" });
    setSending(false);
    if (outcome.ok) setJoined(true);
    else if (outcome.redirectTo) window.location.assign(outcome.redirectTo);
    else setFailed(true);
  }

  return (
    <section className="next-step" aria-label="Bước tiếp theo">
      <div className="card next-card">
        <p className="body-md">Bạn đã luyện mọi persona của vai trò này.</p>
        <Link href="/" className="lnk">
          Về trang chủ
        </Link>
      </div>
      <div className="card next-card">
        {joined ? (
          <p className="body-md joined" role="status">
            <span className="check">
              <CheckIcon size={12} />
            </span>
            Đã ghi. Chúng tôi sẽ báo khi có persona mới.
          </p>
        ) : (
          <>
            <h3 className="headline-sm">Muốn thêm persona?</h3>
            <button type="button" className="btn btn-surface btn-card" onClick={() => void join()} disabled={sending}>
              {sending ? "Đang ghi…" : "Báo tôi khi có"}
            </button>
            {failed && (
              <p className="ferr" role="alert">
                <AlertIcon size={16} />
                Không kết nối được. Thử lại.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
