"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertIcon, SendIcon } from "@/components/icons";
import { MAX_QUESTION_CHARS } from "@/config/limits";

type Turn = { index: number; learnerText: string | null; personaText: string };

type Props = { sessionId: string; personaName: string; initialTurns: Turn[] };

const ERROR_TEXT: Record<string, string> = {
  llm_failed: "Chưa nhận được câu trả lời. Câu hỏi của bạn chưa được tính; hãy gửi lại.",
  conflict: "Lượt này đã được gửi từ một cửa sổ khác. Tải lại trang để xem.",
  turn_limit: "Buổi luyện đã đủ 30 lượt.",
  invalid_text: `Câu hỏi cần từ 1 đến ${MAX_QUESTION_CHARS} ký tự.`,
  not_found: "Không tìm thấy buổi luyện này.",
};
const FALLBACK_ERROR = "Có lỗi khi gửi. Hãy thử lại.";

/** Transcript and composer. All text is rendered as text nodes, so learner input is always escaped. */
export function InterviewChat({ sessionId, personaName, initialTurns }: Props) {
  const [turns, setTurns] = useState(initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending !== null) return;
    setPending(text);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setTurns((current) => [...current, { index: body.turnIndex, learnerText: text, personaText: body.personaText }]);
        setDraft("");
      } else if (body.redirectTo) {
        // Signed out or the data notice changed: continue there and come back.
        window.location.assign(body.redirectTo);
      } else {
        setError(ERROR_TEXT[body.error] ?? FALLBACK_ERROR);
      }
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="chat" aria-label="Hội thoại">
      <ol className="chat-log" aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.index} className="chat-turn">
            {turn.learnerText !== null && (
              <div className="msg chat-me">
                <span className="who who-me">
                  <i />
                  Bạn
                </span>
                <div className="bubble-me">{turn.learnerText}</div>
              </div>
            )}
            <div className="msg chat-p">
              <span className="who who-p">
                <i />
                {personaName}
              </span>
              <div className="bubble-p">{turn.personaText}</div>
            </div>
          </li>
        ))}
        {pending !== null && (
          <li className="chat-turn">
            <div className="msg chat-me">
              <span className="who who-me">
                <i />
                Bạn
              </span>
              <div className="bubble-me">{pending}</div>
            </div>
            <span className="typing" role="status">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              {personaName} đang trả lời…
            </span>
          </li>
        )}
      </ol>
      <div ref={end} />

      {error && (
        <p className="ferr" role="alert">
          <AlertIcon size={16} />
          {error}
        </p>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          aria-label="Câu hỏi của bạn"
          placeholder="Hỏi như đang gặp người thật…"
          rows={2}
          maxLength={MAX_QUESTION_CHARS}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending !== null}
        />
        <button type="submit" className="send" aria-label="Gửi" disabled={pending !== null || draft.trim() === ""}>
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
