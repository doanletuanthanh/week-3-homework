"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertIcon, CheckIcon, SparkIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { ErrorRetry } from "@/components/ui/error-retry";
import { CUSTOM_TOPIC_CHARS, MAX_FOCUS_CHARS } from "@/config/limits";
import type { QuotaBlock } from "@/server/custom-quota";
import { CUSTOM_BLOCK, CUSTOM_REFUSED, CUSTOM_TOPIC_LENGTH, FOCUS_CHIPS } from "@/strings/product-strings";

/** The limits as the form needs them. Built on the server; the form never computes one. */
export type FormQuota = { block: QuotaBlock | null; runningSessionId: string | null; freeLeft: number; attemptsLeftToday: number };

type Props = {
  quota: FormQuota;
  /** "Thử lại": the topic and the answer of the try that failed, and the session it was. */
  initial: { topic: string; focus: string; retryOf: string | null };
  waitlisted: boolean;
};

type Answer = { error?: string; block?: QuotaBlock; runningSessionId?: string | null; redirectTo?: string; sessionId?: string };

/**
 * Màn 10: the topic, the optional answer to what the learner wants to practise, and the button.
 * Of the states that stop a new topic only the first that holds is shown (PRD Màn 10). A refusal,
 * a bad length and a failed request keep both fields as typed.
 */
export function CustomTopicForm({ quota: initialQuota, initial, waitlisted }: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(initial.topic);
  const [focus, setFocus] = useState(initial.focus);
  const [quota, setQuota] = useState(initialQuota);
  const [sending, setSending] = useState(false);
  const [lengthError, setLengthError] = useState(false);
  const [refused, setRefused] = useState(false);
  /** Null while nothing has failed; otherwise how many retries failed after the first failure. */
  const [failedRetries, setFailedRetries] = useState<number | null>(null);
  const [joined, setJoined] = useState(waitlisted);

  const length = topic.trim().length;
  const { block } = quota;

  async function submit() {
    if (sending || block) return;
    setRefused(false);
    if (length < CUSTOM_TOPIC_CHARS.min || length > CUSTOM_TOPIC_CHARS.max) return setLengthError(true);
    setLengthError(false);
    setSending(true);

    let answer: Answer | null = null;
    let ok = false;
    try {
      const response = await fetch("/api/custom-topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, focus, ...(initial.retryOf ? { retryOf: initial.retryOf } : {}) }),
      });
      answer = (await response.json().catch(() => null)) as Answer | null;
      ok = response.ok;
    } catch {
      // Handled below as a failed request.
    }

    if (ok && answer?.sessionId) return router.push(`/sessions/${answer.sessionId}`);
    setSending(false);
    if (answer?.redirectTo) return window.location.assign(answer.redirectTo);
    if (answer?.error === "blocked" && answer.block) {
      setFailedRetries(null);
      return setQuota({ ...quota, block: answer.block, runningSessionId: answer.runningSessionId ?? null });
    }
    if (answer?.error === "refused") {
      setFailedRetries(null);
      return setRefused(true);
    }
    if (answer?.error === "invalid_input") return setLengthError(true);
    setFailedRetries((failed) => (failed === null ? 0 : failed + 1));
  }

  async function joinWaitlist() {
    const outcome = await sendJson("/api/waitlist", "POST", { context: "custom_topics" });
    if (outcome.ok) setJoined(true);
    else if (outcome.redirectTo) window.location.assign(outcome.redirectTo);
  }

  return (
    <form
      className="card ct-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1 className="headline-lg">Tạo chủ đề của bạn</h1>

      <div className="field">
        <label htmlFor="ct-topic">Bạn muốn phỏng vấn người dùng về chủ đề gì?</label>
        <textarea
          id="ct-topic"
          className={`textarea${lengthError || refused ? " invalid" : ""}`}
          rows={2}
          maxLength={CUSTOM_TOPIC_CHARS.max}
          value={topic}
          aria-invalid={lengthError || refused}
          aria-describedby="ct-topic-hint"
          onChange={(event) => {
            setTopic(event.target.value);
            setLengthError(false);
          }}
        />
        <div className="ct-under" id="ct-topic-hint">
          <span className="ct-hint">Ví dụ: cách sinh viên chọn quán ăn trưa gần trường</span>
          <span className="ct-hint code">
            {length}/{CUSTOM_TOPIC_CHARS.max}
          </span>
        </div>
        {lengthError && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            {CUSTOM_TOPIC_LENGTH}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="ct-focus">
          Bạn muốn luyện điều gì trong buổi này? <span className="body-sm c-outline ct-optional">Tùy chọn</span>
        </label>
        <textarea id="ct-focus" className="textarea" rows={2} maxLength={MAX_FOCUS_CHARS} value={focus} onChange={(event) => setFocus(event.target.value)} />
        <div className="chips" role="group" aria-label="Gợi ý">
          {FOCUS_CHIPS.map((chip) => (
            <button key={chip} type="button" className={`qchip${focus === chip ? " on" : ""}`} aria-pressed={focus === chip} onClick={() => setFocus(focus === chip ? "" : chip)}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      {refused && (
        <div className="note-box note-error" role="alert">
          <AlertIcon size={16} />
          <p className="body-sm">{CUSTOM_REFUSED}</p>
        </div>
      )}
      {block && block !== "free_used" && (
        <div className="note-box note-info ct-block" role="status">
          {block === "running" ? <span className="spin ct-spin" aria-hidden="true" /> : <AlertIcon size={16} />}
          <p className="body-sm">
            {CUSTOM_BLOCK[block]}
            {block === "running" && quota.runningSessionId && (
              <>
                {" · "}
                <Link href={`/sessions/${quota.runningSessionId}`} className="lnk">
                  Xem tiến độ
                </Link>
              </>
            )}
          </p>
        </div>
      )}
      {failedRetries !== null && <ErrorRetry variant="inline" failedRetries={failedRetries} retrying={sending} onRetry={() => void submit()} />}

      <div className="ct-foot">
        {block === "free_used" ? (
          <>
            <p className="body-sm c-variant">{CUSTOM_BLOCK.free_used}</p>
            {joined ? (
              <p className="body-sm joined" role="status">
                <span className="check">
                  <CheckIcon size={12} />
                </span>
                Chúng tôi sẽ báo khi bạn tạo thêm được.
              </p>
            ) : (
              <button type="button" className="btn btn-surface btn-md" onClick={() => void joinWaitlist()}>
                Báo tôi khi tạo thêm được
              </button>
            )}
          </>
        ) : (
          <>
            <p className="body-sm c-variant" data-testid="quota-line">
              Còn {quota.freeLeft} kịch bản miễn phí · {quota.attemptsLeftToday} lần thử hôm nay
            </p>
            <button type="submit" className="btn btn-primary btn-lg" disabled={sending || block !== null} aria-busy={sending}>
              {sending ? (
                <>
                  <span className="spin ct-spin-on-primary" aria-hidden="true" />
                  Đang kiểm tra chủ đề…
                </>
              ) : (
                <>
                  <SparkIcon size={18} />
                  Tạo kịch bản
                </>
              )}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
