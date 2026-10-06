"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertIcon, SendIcon } from "@/components/icons";
import { MAX_QUESTION_CHARS, MAX_TURNS } from "@/config/limits";

type Turn = { index: number; learnerText: string | null; personaText: string };

type Props = { sessionId: string; personaName: string; initialTurns: Turn[]; ended: boolean };

/** The question being answered, and as much of the reply as has arrived. */
type Pending = { text: string; reply: string };

type Outcome = { ok: true; personaText: string; turnIndex: number } | { ok: false; error: string; redirectTo?: string };

const ERROR_TEXT: Record<string, string> = {
  llm_failed: "Chưa nhận được câu trả lời. Câu hỏi của bạn chưa được tính; hãy gửi lại.",
  conflict: "Lượt này đã được gửi từ một cửa sổ khác. Tải lại trang để xem.",
  in_flight: "Câu hỏi trước vẫn đang được trả lời. Chờ một chút rồi gửi lại.",
  session_ended: "Buổi luyện đã kết thúc.",
  turn_limit: "Buổi luyện đã đủ 30 lượt.",
  invalid_input: `Câu hỏi cần từ 1 đến ${MAX_QUESTION_CHARS} ký tự.`,
  not_found: "Không tìm thấy buổi luyện này.",
};
const FALLBACK_ERROR = "Có lỗi khi gửi. Hãy thử lại.";

/**
 * Reads the turn API. A reply that streams arrives as one JSON event per line; everything else
 * (errors before the persona starts, a reply already stored) is a plain JSON body.
 */
async function readTurnResponse(response: Response, onDelta: (text: string) => void): Promise<Outcome> {
  if (!response.headers.get("content-type")?.includes("ndjson") || !response.body) {
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, personaText: body.personaText, turnIndex: body.turnIndex };
    return { ok: false, error: body.error ?? "unknown", redirectTo: body.redirectTo };
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === "delta") onDelta(event.text);
      else if (event.type === "done") return { ok: true, personaText: event.personaText, turnIndex: event.turnIndex };
      else return { ok: false, error: event.error };
    }
  }
  // The stream stopped before saying how the turn ended.
  return { ok: false, error: "unknown" };
}

/** Transcript and composer. All text is rendered as text nodes, so learner input is always escaped. */
export function InterviewChat({ sessionId, personaName, initialTurns, ended: initiallyEnded }: Props) {
  const [turns, setTurns] = useState(initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(initiallyEnded);
  const end = useRef<HTMLDivElement>(null);
  // The id of the last question that did not come back as a turn. Sending the same text again
  // reuses it, so a reply that was written but never reached the browser is returned, not repeated.
  const unfinished = useRef<{ text: string; key: string } | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending !== null || ended) return;
    if (unfinished.current?.text !== text) unfinished.current = { text, key: crypto.randomUUID() };
    const turnKey = unfinished.current.key;
    const expectedIndex = turns[turns.length - 1].index + 1;

    setPending({ text, reply: "" });
    setError(null);
    let outcome: Outcome;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, turnKey, expectedIndex }),
      });
      outcome = await readTurnResponse(response, (delta) =>
        setPending((current) => (current ? { ...current, reply: current.reply + delta } : current)),
      );
    } catch {
      outcome = { ok: false, error: "unknown" };
    }

    // A partial reply is dropped with `pending`: only a committed turn enters the transcript.
    setPending(null);
    if (outcome.ok) {
      const { personaText, turnIndex } = outcome;
      unfinished.current = null;
      setTurns((current) => [...current, { index: turnIndex, learnerText: text, personaText }]);
      setDraft("");
      if (turnIndex >= MAX_TURNS) setEnded(true);
    } else if (outcome.redirectTo) {
      // Signed out or the data notice changed: continue there and come back.
      window.location.assign(outcome.redirectTo);
    } else {
      if (outcome.error === "session_ended" || outcome.error === "turn_limit") setEnded(true);
      setError(ERROR_TEXT[outcome.error] ?? FALLBACK_ERROR);
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

  const busy = pending !== null;

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
              <div className="bubble-me">{pending.text}</div>
            </div>
            {pending.reply === "" ? (
              <span className="typing" role="status">
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
                {personaName} đang trả lời…
              </span>
            ) : (
              <div className="msg chat-p" data-streaming>
                <span className="who who-p">
                  <i />
                  {personaName}
                </span>
                <div className="bubble-p">{pending.reply}</div>
              </div>
            )}
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
      {ended && !error && (
        <p className="body-sm c-variant" role="status">
          Buổi luyện đã kết thúc.
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
          disabled={busy || ended}
        />
        <button type="submit" className="send" aria-label="Gửi" disabled={busy || ended || draft.trim() === ""}>
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
