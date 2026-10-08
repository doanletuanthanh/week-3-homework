"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { REVEAL_POLL_MS, REVEAL_SLOW_AFTER_MS } from "@/config/limits";
import type { RevealHeader } from "@/server/session-view";

type Props = { sessionId: string; guess: number; header: RevealHeader };

/** Polls that fail this many times in a row before the screen says so. */
const FAILURES_BEFORE_ERROR = 3;

/**
 * Màn 6 while the result is being computed: the guess and nothing else. It asks every two seconds
 * whether the result is ready and then lets the server render it; it never shows a number of its own.
 */
export function RevealComputing({ sessionId, guess, header }: Props) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    let stopped = false;
    const slowTimer = setTimeout(() => setSlow(true), REVEAL_SLOW_AFTER_MS);

    async function poll() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/reveal`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (stopped) return;
        if (body.redirectTo) return window.location.assign(body.redirectTo);
        if (!response.ok) throw new Error("reveal poll failed");
        setFailures(0);
        // Ready: the session's URL renders the result, through the server's seal.
        if (body.ready) return router.refresh();
      } catch {
        if (!stopped) setFailures((count) => count + 1);
      }
      if (!stopped) timer = setTimeout(() => void poll(), REVEAL_POLL_MS);
    }
    let timer = setTimeout(() => void poll(), REVEAL_POLL_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
    };
  }, [sessionId, router]);

  return (
    <main className="reveal">
      <div className="reveal-col">
        <section className="card reveal-head">
          <span className="eyebrow">
            {header.personaName} · {header.date} · {header.turnCount} lượt
          </span>
          <h1 className="headline-xl">Bạn đoán {guess}.</h1>
          <p className="body-lg computing-line" role="status" aria-live="polite">
            <span className="spin" aria-hidden="true" />
            Đang đối chiếu transcript và ghi chú của bạn…
          </p>
          {slow && (
            <p className="note-box note-info body-sm" role="status">
              Vẫn đang đối chiếu. Bạn có thể đóng trang; kết quả sẽ ở trong Buổi của tôi.
            </p>
          )}
          {failures >= FAILURES_BEFORE_ERROR && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              Không kết nối được. Đang thử lại.
            </p>
          )}
        </section>
        <section className="card reveal-skel" aria-hidden="true">
          <span className="skel" style={{ width: 120, height: 12 }} />
          <span className="skel" style={{ width: "62%", height: 30 }} />
          <span className="skel" style={{ width: 200, height: 48 }} />
        </section>
        <section className="card reveal-skel" aria-hidden="true">
          <span className="skel" style={{ width: 90, height: 16 }} />
          <span className="skel" style={{ width: "100%", height: 14 }} />
          <span className="skel" style={{ width: "70%", height: 14 }} />
          <span className="skel" style={{ width: "58%", height: 14 }} />
        </section>
      </div>
    </main>
  );
}
