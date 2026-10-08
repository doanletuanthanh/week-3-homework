"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, ArrowLeftIcon, CrossIcon } from "@/components/icons";
import type { BrowserTurn } from "@/engine/seal";

type Props = {
  sessionId: string;
  personaName: string;
  /** The turn to show, or null while the drawer is closed. */
  turn: number | null;
  onClose: () => void;
};

/** How long the turn the learner jumped to stays highlighted. */
const HIGHLIGHT_MS = 2000;

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; turns: BrowserTurn[] };

const pad = (index: number) => String(index).padStart(2, "0");

/** The learner's question, with the words the verifier agreed they added underlined. Text nodes only. */
function LearnerText({ turn }: { turn: BrowserTurn }) {
  const text = turn.learnerText ?? "";
  if (!turn.leading) return <>{text}</>;
  const { start, end } = turn.leading;
  return (
    <>
      {text.slice(0, start)}
      <span className="uline">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

/**
 * The main transcript, opened from any "Lượt N" of the reveal: a panel on the right on desktop,
 * the whole screen under 768px. It scrolls to the turn asked for and highlights it for two
 * seconds. It is a native modal dialog, so focus stays inside it, Esc closes it, and focus goes
 * back to the link that opened it. The turns come from the server already filtered: a mark that
 * is not in the response cannot be shown here.
 */
export function TranscriptDrawer({ sessionId, personaName, turn, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const open = turn !== null;

  const fetchTurns = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const response = await fetch(`/api/sessions/${sessionId}/transcript`, { cache: "no-store" });
      const body = await response.json();
      if (body.redirectTo) return window.location.assign(body.redirectTo);
      if (!response.ok) throw new Error("transcript failed");
      setLoad({ state: "ready", turns: body.turns });
    } catch {
      setLoad({ state: "error" });
    }
  }, [sessionId]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // Loaded on the first opening, and again after a failure.
  const requested = useRef(false);
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    const timer = setTimeout(() => void fetchTurns(), 0);
    return () => clearTimeout(timer);
  }, [open, fetchTurns]);

  const ready = load.state === "ready";
  useEffect(() => {
    if (turn === null || !ready) return;
    dialog.current?.querySelector(`[data-turn="${turn}"]`)?.scrollIntoView({ block: "center" });
    const show = setTimeout(() => setHighlighted(turn), 0);
    const hide = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [turn, ready]);

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-label="Transcript buổi chính"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dimmed page behind the panel.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-in">
        <header className="drawer-h">
          <button type="button" className="btn btn-tonal btn-sm drawer-back" onClick={onClose}>
            <ArrowLeftIcon size={16} />
            Về kết quả
          </button>
          <div>
            <p className="label-lg">Transcript buổi chính</p>
            {load.state === "ready" && (
              <p className="body-sm c-variant">
                {personaName} · {Math.max(0, load.turns.length - 1)} lượt
              </p>
            )}
          </div>
          <button type="button" className="icon-btn drawer-x" aria-label="Đóng transcript" onClick={onClose}>
            <CrossIcon size={18} />
          </button>
        </header>
        <div className="drawer-body">
          {load.state === "loading" && (
            <div className="drawer-skel" aria-hidden="true">
              <span className="skel" style={{ width: "40%", height: 12 }} />
              <span className="skel" style={{ width: "90%", height: 14 }} />
              <span className="skel" style={{ width: "70%", height: 14 }} />
            </div>
          )}
          {load.state === "error" && (
            <div className="drawer-skel">
              <p className="ferr" role="alert">
                <AlertIcon size={16} />
                Không kết nối được.
              </p>
              <button type="button" className="btn btn-tonal btn-sm" onClick={() => void fetchTurns()}>
                Thử lại
              </button>
            </div>
          )}
          {load.state === "ready" && (
            <ol>
              {load.turns.map((entry) => (
                <li key={entry.index} className={`turn${highlighted === entry.index ? " now" : ""}`} data-turn={entry.index}>
                  <div className="turn-k">
                    <span className="k">Lượt {pad(entry.index)}</span>
                    {entry.leading && <span className="lab lab-never">Dẫn dắt</span>}
                  </div>
                  <div>
                    {entry.learnerText !== null && (
                      <p className="tl">
                        <span className="who-l">BẠN</span>
                        <LearnerText turn={entry} />
                      </p>
                    )}
                    <p className="tl">
                      <span className="who-l">{personaName.toLocaleUpperCase("vi")}</span>
                      {entry.personaText}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </dialog>
  );
}
