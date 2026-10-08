"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AlertIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";

type Props = {
  sessionId: string;
  /** The persona's form of address, for the middle of a sentence ("chị Thu"). */
  personaName: string;
  itemCount: number;
};

const NOT_CONNECTED = "Không kết nối được. Thử lại.";

/**
 * Màn 5: one question and one slider, nothing to look back at. The slider starts with no value,
 * so the number is the learner's own. The guess is stored on the session and read by no model.
 */
export function GuessScreen({ sessionId, personaName, itemCount }: Props) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clamp = (next: number) => Math.min(itemCount, Math.max(0, next));

  function valueAt(clientX: number): number {
    const box = track.current!.getBoundingClientRect();
    return clamp(Math.round(((clientX - box.left) / box.width) * itemCount));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (sending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setValue(valueAt(event.clientX));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (sending || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setValue(valueAt(event.clientX));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (sending) return;
    const steps: Record<string, number | undefined> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    const step = steps[event.key];
    // The first arrow press chooses 0: there is no value to step from yet.
    if (step !== undefined) setValue(value === null ? 0 : clamp(value + step));
    else if (event.key === "Home") setValue(0);
    else if (event.key === "End") setValue(itemCount);
    else return;
    event.preventDefault();
  }

  async function submit() {
    if (value === null || sending) return;
    setSending(true);
    setError(null);
    const outcome = await sendJson(`/api/sessions/${sessionId}/guess`, "POST", { guess: value });
    if (outcome.ok) {
      // The session's URL now renders the reveal.
      router.refresh();
    } else if (outcome.redirectTo) {
      window.location.assign(outcome.redirectTo);
    } else {
      // The chosen value stays where it is.
      setSending(false);
      setError(NOT_CONNECTED);
    }
  }

  const label = `Số điều ${personaName} đã kể`;
  return (
    <main className="center-page guess">
      <section className="card-lg guess-card">
        <span className="eyebrow">Trước khi xem {personaName} đang giữ gì</span>
        <h1 className="headline-lg">
          Bạn nghĩ {personaName} đã kể cho bạn bao nhiêu trong {itemCount} điều?
        </h1>
        <div className="guess-box">
          <p className="guess-value" data-chosen={value !== null} aria-hidden="true">
            {value ?? "?"}
          </p>
          <div
            ref={track}
            className="rng"
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={itemCount}
            aria-valuenow={value ?? undefined}
            aria-valuetext={value === null ? "Chưa chọn" : `${value} trên ${itemCount}`}
            aria-disabled={sending}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onKeyDown={onKeyDown}
          >
            <span className="rng-track" />
            {value === null ? (
              <span className="rng-hint">Kéo để chọn</span>
            ) : (
              <>
                <span className="rng-fill" style={{ width: `${(value / itemCount) * 100}%` }} />
                <span className="rng-knob" style={{ left: `${(value / itemCount) * 100}%` }} />
              </>
            )}
          </div>
          <div className="rng-ends" aria-hidden="true">
            <span>0</span>
            <span>{itemCount}</span>
          </div>
        </div>
        {error && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-lg guess-submit" onClick={() => void submit()} disabled={value === null || sending}>
          {sending ? "Đang gửi…" : "Xem kết quả"}
        </button>
      </section>
    </main>
  );
}
