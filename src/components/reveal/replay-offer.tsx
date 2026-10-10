"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertIcon, LockIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { Dialog } from "@/components/ui/dialog";
import type { BrowserReveal } from "@/engine/seal";
import { DIAGNOSIS, fillTemplate } from "@/strings/product-strings";

type Props = { sessionId: string; replay: BrowserReveal["replay"]; personaName: string };

const NOT_CONNECTED = "Không kết nối được. Thử lại.";

/**
 * Màn 6 item 2. With a replay moment: the fixed diagnosis line, the way back into the session and
 * the way past it, and for a primary moment the card of the item that is held back, which says
 * nothing about it. With none: the sample question of the most important item still locked.
 */
export function ReplayOffer({ sessionId, replay, personaName }: Props) {
  const router = useRouter();
  const [sending, setSending] = useState<"start" | "skip" | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (replay.level === "none") {
    if (replay.sampleQuestion === null) return null;
    return (
      <section className="card no-replay">
        <span className="eyebrow c-outline">Buổi này không có lượt để luyện lại</span>
        <div className="ctx">
          <span className="ctx-k">Câu hỏi mẫu</span>
          <p className="q">“{replay.sampleQuestion}”</p>
        </div>
      </section>
    );
  }

  async function act(action: "start" | "skip") {
    setSending(action);
    setError(null);
    const outcome = await sendJson(`/api/sessions/${sessionId}/replay`, "POST", { action });
    if (outcome.ok || outcome.error === "not_offered") {
      // The session's URL now renders the replay, or the result with nothing held. A replay that
      // is no longer offered was started or ended somewhere else: the server decides the screen.
      router.refresh();
      return;
    }
    if (outcome.redirectTo) return window.location.assign(outcome.redirectTo);
    // The session's state did not change.
    setSending(null);
    setSkipOpen(false);
    setError(NOT_CONNECTED);
  }

  const { diagnosis } = replay;
  return (
    <>
      <section className="replay-offer" aria-labelledby="replay-title">
        <div>
          <span className="eyebrow">Luyện lại · 3 lượt</span>
          <h2 id="replay-title" className="headline-lg">
            {fillTemplate(DIAGNOSIS[diagnosis.key], { turn: diagnosis.turn, persona: personaName })}
          </h2>
          <div className="replay-actions">
            <button type="button" className="btn btn-lg btn-onDark" onClick={() => void act("start")} disabled={sending !== null}>
              {sending === "start" ? "Đang mở…" : `Quay lại lượt ${replay.returnTurn}`}
            </button>
            <button type="button" className="lnk" onClick={() => setSkipOpen(true)} disabled={sending !== null}>
              Bỏ qua, cho tôi xem luôn
            </button>
          </div>
          {error && (
            <p className="ferr replay-error" role="alert">
              <AlertIcon size={16} />
              {error}
            </p>
          )}
        </div>
        {replay.level === "primary" && (
          <div className="held-card">
            <span className="sealed">
              <LockIcon size={18} />
            </span>
            <div>
              <span className="label-md">Giữ lại để bạn thử</span>
              <p className="body-sm">Một điều {personaName} chưa kể. Mở ra sau khi bạn luyện lại hoặc bỏ qua.</p>
            </div>
          </div>
        )}
      </section>
      <Dialog
        open={skipOpen}
        onClose={() => {
          if (sending === null) setSkipOpen(false);
        }}
        labelledBy="skip-title"
        describedBy="skip-consequence"
        role="alertdialog"
      >
        <h2 id="skip-title" className="headline-md">
          Bỏ qua lần luyện lại?
        </h2>
        <p id="skip-consequence" className="body-md c-variant dlg-text">
          Bạn sẽ không thử lại được khoảnh khắc này.
        </p>
        <div className="dlg-actions">
          <button type="button" className="btn btn-tonal btn-md" onClick={() => setSkipOpen(false)} disabled={sending !== null}>
            Ở lại
          </button>
          <button type="button" className="btn btn-primary btn-md" onClick={() => void act("skip")} disabled={sending !== null}>
            {sending === "skip" ? "Đang mở…" : "Cho tôi xem luôn"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
