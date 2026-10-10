"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, NoteIcon } from "@/components/icons";
import { MAX_QUESTION_CHARS, MAX_TURNS } from "@/config/limits";
import { useAutosave, type SaveOutcome } from "@/hooks/use-autosave";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { Composer } from "./composer";
import { EndSessionDialog } from "./end-session-dialog";
import { NotesCanvas } from "./notes-canvas";
import { NotesSheet } from "./notes-sheet";
import { SESSION_CAP_REACHED } from "@/strings/product-strings";
import { SessionBar } from "./session-bar";
import { TranscriptList, type PendingTurn, type Turn } from "./transcript-list";
import { postTurn, sendJson } from "./turn-request";

type Props = {
  sessionId: string;
  persona: { displayName: string; displayNameCapitalized: string; avatarKey: string | null; researchGoal: string; itemCount: number };
  initialTurns: Turn[];
  initialNotes: string;
  /** Turn 30 ended the session but the notes are not frozen yet: this screen sends the end request. */
  endedOnServer: boolean;
};

/** A question fails this many times in a row before the screen says the fault is ours. */
const FAILURES_BEFORE_INCIDENT = 3;
const NOT_CONNECTED = "Không kết nối được. Thử lại.";
/** Errors that mean the reply could not be produced, as opposed to a request that was refused. */
const TECHNICAL_ERRORS = new Set(["llm_failed", "server_error", "unknown"]);

const REFUSED: Record<string, string> = {
  conflict: "Lượt này đã được gửi từ một cửa sổ khác. Tải lại trang để xem.",
  in_flight: "Câu hỏi trước vẫn đang được trả lời. Chờ một chút rồi gửi lại.",
  session_ended: "Buổi luyện đã kết thúc.",
  turn_limit: `Buổi luyện đã đủ ${MAX_TURNS} lượt.`,
  invalid_input: `Câu hỏi cần từ 1 đến ${MAX_QUESTION_CHARS} ký tự.`,
  not_found: "Không tìm thấy buổi này.",
  cap_reached: SESSION_CAP_REACHED,
};

const END_REFUSED: Record<string, string> = {
  in_flight: "Câu hỏi trước vẫn đang được trả lời. Chờ một chút rồi thử lại.",
  not_found: "Không tìm thấy buổi này.",
};

/** Keeps `--vvh` at the height left above an on-screen keyboard, so the mobile layout fits in it. */
function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--vvh", `${viewport.height}px`);
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      root.style.removeProperty("--vvh");
    };
  }, []);
}

/**
 * Màn 4: the chat, the session bar and the notes canvas. It shows the two speakers' words, the
 * turn count and the constant seal counter, and nothing about labels, openness, hooks or opened items.
 */
export function InterviewScreen({ sessionId, persona, initialTurns, initialNotes, endedOnServer }: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState(initialTurns);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const notesButton = useRef<HTMLButtonElement>(null);
  // The id of the last question that did not come back as a turn. Sending the same text again
  // reuses it, so a reply that was written but never reached the browser is returned, not repeated.
  const unfinished = useRef<{ text: string; key: string } | null>(null);

  // What is typed lives in the browser until the server has it, so it survives a reload and the
  // round trip through sign-in when the session cookie has expired.
  const [questionDraft, setQuestionDraft] = useLocalDraft(`question:${sessionId}`);
  const [storedNotes, setStoredNotes] = useLocalDraft(`notes:${sessionId}`);
  // The server text the notes draft was typed over. A draft left by an earlier page is used only
  // when the server still holds that text: otherwise the notes moved on (another device, or a
  // save this browser never saw confirmed) and the draft would overwrite them.
  const [notesBase, setNotesBase] = useLocalDraft(`notes-base:${sessionId}`);
  const [typedHere, setTypedHere] = useState(false);
  const notesDraft = storedNotes !== null && (typedHere || notesBase === initialNotes) ? storedNotes : null;
  const question = questionDraft ?? "";

  const saveNotes = useCallback(
    async (text: string): Promise<SaveOutcome> => {
      const outcome = await sendJson(`/api/sessions/${sessionId}/notes`, "PUT", { text });
      if (outcome.ok) return "saved";
      if (outcome.redirectTo) {
        // Signed out or the data notice changed: the draft waits in the browser.
        window.location.assign(outcome.redirectTo);
        return "stop";
      }
      if (outcome.error === "unknown") return "retry";
      // Frozen or gone: the session ended somewhere else, and the server decides the screen.
      router.refresh();
      return "stop";
    },
    [sessionId, router],
  );
  const autosave = useAutosave(notesDraft, initialNotes, saveNotes, !ending);
  const notes = notesDraft ?? autosave.saved;
  // What is on screen right now, for a request that starts after an await (the end after turn 30).
  const notesNow = useRef(notes);
  useEffect(() => {
    notesNow.current = notes;
  }, [notes]);
  useEffect(() => {
    // The browser copy goes once the server has the text (or it is a stale draft); until then
    // its base follows what the server is known to hold.
    if (storedNotes === null) return;
    if (notesDraft === null || notesDraft === autosave.saved) setStoredNotes(null);
    else setNotesBase(autosave.saved);
  }, [storedNotes, notesDraft, autosave.saved, setStoredNotes, setNotesBase]);

  function changeNotes(text: string) {
    setTypedHere(true);
    setNotesBase(autosave.saved);
    setStoredNotes(text);
  }

  useVisualViewportHeight();

  const turnCount = turns[turns.length - 1].index;
  const turnLimitReached = turnCount >= MAX_TURNS || endedOnServer;
  const busy = pending !== null;

  async function send() {
    const text = question.trim();
    if (!text || busy || ending || turnLimitReached) return;
    if (unfinished.current?.text !== text) unfinished.current = { text, key: crypto.randomUUID() };
    const turnKey = unfinished.current.key;
    const expectedIndex = turnCount + 1;

    setPending({ index: expectedIndex, text, reply: "" });
    setError(null);
    const outcome = await postTurn(sessionId, { text, turnKey, expectedIndex }, (delta) =>
      setPending((current) => (current ? { ...current, reply: current.reply + delta } : current)),
    );

    // A partial reply is dropped with `pending`: only a committed turn enters the transcript.
    setPending(null);
    if (outcome.ok) {
      const { personaText, turnIndex } = outcome;
      unfinished.current = null;
      setTurns((current) => [...current, { index: turnIndex, learnerText: text, personaText }]);
      setQuestionDraft(null);
      setFailures(0);
      setAnnouncement(`${persona.displayNameCapitalized}: ${personaText}`);
      // Turn 30 ended the session on the server. The notes are frozen as typed at this moment,
      // by the same request "Kết thúc buổi" sends.
      if (turnIndex >= MAX_TURNS) void endSession();
    } else if (outcome.redirectTo) {
      // Signed out or the data notice changed: continue there and come back to the same question.
      window.location.assign(outcome.redirectTo);
    } else if (TECHNICAL_ERRORS.has(outcome.error)) {
      const failed = failures + 1;
      setFailures(failed);
      if (failed >= FAILURES_BEFORE_INCIDENT) {
        setError(`InterviewLab đang gặp sự cố. Buổi của bạn đã được lưu ở lượt ${turnCount}; quay lại sau.`);
      } else {
        setError(outcome.error === "llm_failed" ? `${persona.displayNameCapitalized} chưa nghe rõ. Gửi lại câu hỏi.` : NOT_CONNECTED);
      }
    } else {
      setError(REFUSED[outcome.error] ?? NOT_CONNECTED);
      // The session ended somewhere else: the server decides which screen comes next.
      if (outcome.error === "session_ended" || outcome.error === "turn_limit") router.refresh();
    }
  }

  /** Ends the session with the notes as they are on screen, saved or not. */
  async function endSession() {
    setEnding(true);
    setEndError(null);
    const outcome = await sendJson(`/api/sessions/${sessionId}/end`, "POST", { canvasText: notesNow.current });
    if (outcome.ok) {
      setQuestionDraft(null);
      setStoredNotes(null);
      // The session's URL now renders the screen of the ended session.
      router.refresh();
    } else if (outcome.redirectTo) {
      window.location.assign(outcome.redirectTo);
    } else {
      setEnding(false);
      setEndError(END_REFUSED[outcome.error] ?? NOT_CONNECTED);
    }
  }

  // The page was loaded for a session turn 30 had already ended (a reload after a failed end
  // request): the end is sent again, once the notes kept in this browser have been read.
  const endOnLoad = useRef(endedOnServer);
  useEffect(() => {
    if (!endOnLoad.current) return;
    endOnLoad.current = false;
    const timer = setTimeout(() => void endSession(), 0);
    return () => {
      endOnLoad.current = true;
      clearTimeout(timer);
    };
    // Once per page load: `endSession` reads the newest notes through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typing = pending !== null && pending.reply === "" ? `${persona.displayNameCapitalized} đang gõ…` : "";

  const errorLine = error ?? (endOpen || endError === null ? null : `Buổi luyện chưa kết thúc được. ${endError} Bấm “Kết thúc buổi” để thử lại.`);

  return (
    <main className="iv" data-notes-open={notesOpen}>
      <SessionBar
        personaName={persona.displayNameCapitalized}
        avatarKey={persona.avatarKey}
        researchGoal={persona.researchGoal}
        itemCount={persona.itemCount}
        turnCount={turnCount}
        onEnd={() => setEndOpen(true)}
        endDisabled={busy || ending}
      />
      <div className="iv-body">
        <section className="iv-chat" aria-label="Hội thoại" onPointerDown={notesOpen ? () => setNotesOpen(false) : undefined}>
          <div className="iv-scroll">
            <TranscriptList turns={turns} pending={pending} personaName={persona.displayNameCapitalized} />
          </div>
          <div className="iv-compose">
            <button ref={notesButton} type="button" className="note-fab" aria-expanded={notesOpen} onClick={() => setNotesOpen(true)}>
              <NoteIcon />
              Ghi chú
            </button>
            <Composer
              value={question}
              onChange={setQuestionDraft}
              onSend={() => void send()}
              disabled={busy || ending || turnLimitReached}
              placeholder={`Hỏi ${persona.displayName}…`}
            />
            {/* A system line, not a chat bubble: it never enters the transcript. */}
            {errorLine && (
              <p className="ferr" role="alert">
                <AlertIcon size={16} />
                {errorLine}
              </p>
            )}
          </div>
        </section>
        <NotesSheet open={notesOpen} onClose={() => setNotesOpen(false)} opener={notesButton}>
          <NotesCanvas value={notes} onChange={changeNotes} saveFailing={autosave.failures >= 2} readOnly={ending} />
        </NotesSheet>
      </div>
      {/* Always on the page, so its changes are read out: "đang gõ…", then the finished reply, once. */}
      <p className="sr" aria-live="polite">
        {pending !== null ? typing : announcement}
      </p>
      <EndSessionDialog
        open={endOpen}
        ending={ending}
        error={endError}
        onConfirm={() => void endSession()}
        onCancel={() => {
          if (!ending) setEndOpen(false);
        }}
      />
    </main>
  );
}
