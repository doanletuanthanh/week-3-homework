"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertIcon, ArrowRightIcon, LockIcon, ReplayIcon, StopIcon } from "@/components/icons";
import { Composer } from "@/components/interview/composer";
import { TranscriptList, type PendingTurn, type Turn } from "@/components/interview/transcript-list";
import { postReplayTurn, sendJson } from "@/components/interview/turn-request";
import { TranscriptDrawer } from "@/components/reveal/transcript-drawer";
import { Dialog } from "@/components/ui/dialog";
import { MAX_QUESTION_CHARS } from "@/config/limits";
import { REPLAY_TURNS, type ReplayLevel, type ReplayOutcome } from "@/engine/replay-result";
import { useLocalDraft } from "@/hooks/use-local-draft";
import type { ReplayViewTurn, ViewTurn } from "@/server/session-view";
import { REPLAY_RESULT } from "@/strings/product-strings";
import { ReplayResult } from "./replay-result";

type Props = {
  sessionId: string;
  persona: { displayName: string; displayNameCapitalized: string };
  /** The day the session started, as "dd/mm". */
  date: string;
  level: ReplayLevel;
  forkAfterTurn: number;
  /** The last two turns before the fork. */
  contextTurns: ViewTurn[];
  /** Replay turns already played, when the page is opened again mid-replay. */
  replayTurns: ReplayViewTurn[];
};

const NOT_CONNECTED = "Không kết nối được. Thử lại.";

const REFUSED: Record<string, string> = {
  conflict: "Lượt này đã được gửi từ một cửa sổ khác. Tải lại trang để xem.",
  in_flight: "Câu hỏi trước vẫn đang được trả lời. Chờ một chút rồi gửi lại.",
  invalid_input: `Câu hỏi cần từ 1 đến ${MAX_QUESTION_CHARS} ký tự.`,
  not_found: "Không tìm thấy buổi này.",
};

const withNote = (turn: ReplayViewTurn): Turn => ({ ...turn, note: turn.unchecked ? REPLAY_RESULT.unchecked : undefined });

/**
 * Màn 7: three questions from the moment that was missed. It shows where the branch starts, the
 * replay's own turns, and, once the replay has ended, its result with the way back to the
 * session's result. The notes are frozen and not shown. Until the end, nothing here says what is
 * held back: the result arrives with the answer that ends the replay.
 */
export function ReplayScreen({ sessionId, persona, date, level, forkAfterTurn, contextTurns, replayTurns }: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState(replayTurns);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<ReplayOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useLocalDraft(`replay-question:${sessionId}`);
  // As on Màn 4: the same text sent again reuses its id, so a stored reply is returned, not repeated.
  const unfinished = useRef<{ text: string; key: string } | null>(null);

  const question = questionDraft ?? "";
  const played = turns.length;
  const busy = pending !== null;
  const ended = outcome !== null;

  async function send() {
    const text = question.trim();
    if (!text || busy || stopping || ended || played >= REPLAY_TURNS) return;
    if (unfinished.current?.text !== text) unfinished.current = { text, key: crypto.randomUUID() };
    const expectedIndex = played + 1;

    setPending({ index: forkAfterTurn + expectedIndex, text, reply: "" });
    setChecking(false);
    setError(null);
    const result = await postReplayTurn(
      sessionId,
      { text, turnKey: unfinished.current.key, expectedIndex },
      {
        onDelta: (delta) => setPending((current) => (current ? { ...current, reply: current.reply + delta } : current)),
        onChecking: () => setChecking(true),
      },
    );

    // A partial reply is dropped with `pending`: only a committed turn enters the transcript.
    setPending(null);
    setChecking(false);
    if (result.ok) {
      unfinished.current = null;
      setTurns((current) => [
        ...current,
        { index: forkAfterTurn + result.replayTurnIndex, learnerText: text, personaText: result.personaText, unchecked: result.unchecked },
      ]);
      setQuestionDraft(null);
      setAnnouncement(`${persona.displayNameCapitalized}: ${result.personaText}`);
      if (result.outcome) setOutcome(result.outcome);
    } else if (result.redirectTo) {
      window.location.assign(result.redirectTo);
    } else if (result.error === "replay_ended") {
      // It ended somewhere else: the session's URL now renders its result.
      router.refresh();
    } else if (result.error === "llm_failed") {
      setError(`${persona.displayNameCapitalized} chưa nghe rõ. Gửi lại câu hỏi.`);
    } else {
      setError(REFUSED[result.error] ?? NOT_CONNECTED);
    }
  }

  async function stop() {
    setStopping(true);
    setStopError(null);
    const result = await sendJson(`/api/sessions/${sessionId}/replay`, "POST", { action: "stop" });
    setStopping(false);
    if (result.ok) {
      setStopOpen(false);
      const stopped = (result.data as { outcome: ReplayOutcome | null }).outcome;
      if (stopped) setOutcome(stopped);
      else router.refresh();
    } else if (result.redirectTo) {
      window.location.assign(result.redirectTo);
    } else {
      setStopError(result.error === "in_flight" ? REFUSED.in_flight : NOT_CONNECTED);
    }
  }

  const unlocked = outcome?.level === "primary" && outcome.result === "success";
  // The question box goes when the replay ends: focus moves to the one thing left to do.
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ended) back.current?.focus();
  }, [ended]);
  const typing = pending !== null && pending.reply === "" ? `${persona.displayNameCapitalized} đang gõ…` : "";

  return (
    <main className="iv rp">
      <div className="rbar">
        <span className="icon-circle rbar-icon">
          <ReplayIcon size={20} />
        </span>
        <div className="rbar-title">
          <h1 className="label-lg">Luyện lại từ lượt {forkAfterTurn + 1}</h1>
          <p className="body-sm c-variant">
            {persona.displayNameCapitalized} · {date}
          </p>
        </div>
        <div className="rbar-meta">
          <div className="rbar-turns">
            <span className="label-md">{played === 0 ? `Bạn có ${REPLAY_TURNS} lượt` : `Lượt ${played}/${REPLAY_TURNS}`}</span>
            <div className="seg" aria-hidden="true">
              {Array.from({ length: REPLAY_TURNS }, (_, position) => (
                <i key={position} className={position < played ? "on" : undefined} />
              ))}
            </div>
          </div>
          {level === "primary" && !ended && (
            <span className="pill pill-tertiary">
              <LockIcon size={12} strokeWidth={2.4} />
              Giữ lại để bạn thử
            </span>
          )}
          {level === "primary" && ended && <span className={`pill ${unlocked ? "pill-tertiary" : "pill-neutral"}`}>{unlocked ? "Đã mở khóa" : "Đã mở niêm phong"}</span>}
        </div>
        {!ended && (
          <button type="button" className="btn btn-surface btn-md sbar-end" onClick={() => setStopOpen(true)} disabled={busy || stopping}>
            <StopIcon size={16} />
            Dừng
          </button>
        )}
      </div>

      <div className="iv-body">
        <section className="iv-chat" aria-label="Luyện lại">
          <div className="iv-scroll">
            <div className="rp-col">
              <button type="button" className="btn-link rp-earlier" onClick={() => setEarlierOpen(true)}>
                Xem toàn bộ transcript trước đó
              </button>
              <TranscriptList turns={contextTurns} pending={null} personaName={persona.displayNameCapitalized} />
              <div className="fork">
                <span className="pill pill-green">
                  <ReplayIcon size={12} strokeWidth={2.4} />
                  {level === "fallback1" ? "Hỏi lại từ đây, lần này không dẫn dắt." : "Hỏi lại từ đây"}
                </span>
              </div>
              {(turns.length > 0 || pending !== null) && (
                <TranscriptList turns={turns.map(withNote)} pending={pending} personaName={persona.displayNameCapitalized} />
              )}
              {checking && (
                <p className="body-sm c-variant rp-checking">
                  <span className="spin" aria-hidden="true" />
                  Đang kiểm tra…
                </p>
              )}
              {outcome && (
                <ReplayResult outcome={outcome} persona={persona}>
                  {/* No navigation by itself: the learner reads the result first. */}
                  <button ref={back} type="button" className={`btn ${unlocked ? "btn-card rr-back" : "btn-primary btn-md"}`} onClick={() => router.refresh()}>
                    Về kết quả buổi
                    <ArrowRightIcon size={16} />
                  </button>
                </ReplayResult>
              )}
            </div>
          </div>
          {!ended && (
            <div className="iv-compose">
              <Composer
                value={question}
                onChange={setQuestionDraft}
                onSend={() => void send()}
                disabled={busy || stopping || played >= REPLAY_TURNS}
                placeholder={`Hỏi lại ${persona.displayName}…`}
              />
              {/* A system line, not a chat bubble: it never enters the transcript. */}
              {error && (
                <p className="ferr" role="alert">
                  <AlertIcon size={16} />
                  {error}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Always on the page, so its changes are read out: "đang gõ…", "Đang kiểm tra…", then the finished reply, once. */}
      <p className="sr" aria-live="polite">
        {pending !== null ? (checking ? "Đang kiểm tra…" : typing) : announcement}
      </p>

      <Dialog
        open={stopOpen}
        onClose={() => {
          if (!stopping) setStopOpen(false);
        }}
        labelledBy="stop-title"
        role="alertdialog"
      >
        <h2 id="stop-title" className="headline-md">
          Dừng luyện lại?
        </h2>
        <p className="body-md c-variant dlg-text">Điều bị giữ sẽ được mở ra.</p>
        {stopError && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            {stopError}
          </p>
        )}
        <div className="dlg-actions">
          <button type="button" className="btn btn-tonal btn-md" onClick={() => setStopOpen(false)} disabled={stopping}>
            Hỏi tiếp
          </button>
          <button type="button" className="btn btn-primary btn-md" onClick={() => void stop()} disabled={stopping}>
            {stopping ? "Đang dừng…" : "Dừng"}
          </button>
        </div>
      </Dialog>

      {/* The main transcript, up to the fork and no further. */}
      <TranscriptDrawer
        sessionId={sessionId}
        personaName={persona.displayNameCapitalized}
        turn={earlierOpen ? forkAfterTurn : null}
        upTo={forkAfterTurn}
        backLabel="Về luyện lại"
        onClose={() => setEarlierOpen(false)}
      />
    </main>
  );
}
