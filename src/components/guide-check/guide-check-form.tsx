"use client";

import { useState } from "react";
import { AlertIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { GUIDE_CHECK_LIMITS } from "@/config/limits";
import type { GuideLabel } from "@/llm/prompts/guide-check";
import type { GuideCheckResult } from "@/server/guide-check";

type Checked = Extract<GuideCheckResult, { ok: true }>;

export const GUIDE_LABEL_TEXT: Record<GuideLabel, { name: string; pill: string }> = {
  open: { name: "Câu mở", pill: "pill-green" },
  leading: { name: "Dẫn dắt", pill: "pill-error" },
  compound: { name: "Gộp nhiều câu", pill: "pill-amber" },
  hypothetical_future: { name: "Tương lai giả định", pill: "pill-amber" },
  closed: { name: "Câu đóng", pill: "pill-neutral" },
};

const ERROR_TEXT: Record<string, string> = {
  invalid_input: `Bộ câu hỏi cần có nội dung, tối đa ${GUIDE_CHECK_LIMITS.lines} dòng và ${GUIDE_CHECK_LIMITS.chars} ký tự; ý tưởng app chỉ một dòng.`,
  limit: "Bạn đã dùng hết lượt kiểm tra hôm nay. Quay lại vào ngày mai.",
  over_cap: "Hôm nay hệ thống đã dùng hết ngân sách. Quay lại vào ngày mai.",
  refused: "Ý tưởng app này không kiểm tra được. Bỏ trống ô ý tưởng hoặc mô tả theo cách khác.",
  llm_failed: "Không kiểm tra được lúc này. Thử lại sau ít phút.",
};

const nonEmptyLines = (text: string) => text.split("\n").filter((line) => line.trim() !== "").length;

/** The guide and the app idea, sent as typed; the answer is shown as text, never as markup. */
export function GuideCheckForm({ initialLeft }: { initialLeft: number | null }) {
  const [guide, setGuide] = useState("");
  const [idea, setIdea] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Checked | null>(null);
  const [left, setLeft] = useState(initialLeft);

  const lines = nonEmptyLines(guide);
  const tooLong = lines > GUIDE_CHECK_LIMITS.lines || guide.length > GUIDE_CHECK_LIMITS.chars;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const outcome = await sendJson("/api/guide-check", "POST", { guide, idea });
    setSending(false);
    if (outcome.ok) {
      const checked = outcome.data as Checked;
      setResult(checked);
      setLeft(checked.left);
    } else if (outcome.redirectTo) window.location.assign(outcome.redirectTo);
    else {
      setError(ERROR_TEXT[outcome.error] ?? ERROR_TEXT.llm_failed);
      if (outcome.error === "limit") setLeft(0);
    }
  }

  const flagged = result ? result.questions.length - result.counts.open : 0;
  return (
    <>
      <form className="card guide-form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="guide-idea">Ý tưởng app (không bắt buộc)</label>
          <input id="guide-idea" className="input" maxLength={GUIDE_CHECK_LIMITS.ideaChars} value={idea} onChange={(event) => setIdea(event.target.value.replace(/\n/g, " "))} placeholder="vd: app nhắc uống nước cho dân văn phòng" />
        </div>
        <div className="field">
          <label htmlFor="guide-text">Bộ câu hỏi, mỗi câu một dòng</label>
          <textarea id="guide-text" className="textarea" rows={10} required value={guide} onChange={(event) => setGuide(event.target.value)} />
          <span className={`body-sm ${tooLong ? "c-error" : "c-outline"}`}>
            {lines}/{GUIDE_CHECK_LIMITS.lines} dòng · {guide.length}/{GUIDE_CHECK_LIMITS.chars} ký tự
          </span>
        </div>
        <div className="guide-actions">
          <button type="submit" className="btn btn-primary btn-md" disabled={sending || tooLong || guide.trim() === "" || left === 0}>
            {sending ? "Đang kiểm tra…" : "Kiểm tra"}
          </button>
          {left !== null && <span className="body-sm c-variant">Còn {left} lượt hôm nay</span>}
        </div>
        {error && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            {error}
          </p>
        )}
      </form>

      {result && (
        <section className="card guide-result" aria-label="Kết quả kiểm tra">
          <p className="headline-sm" role="status">
            {result.counts.leading}/{result.questions.length} câu dẫn dắt · {flagged}/{result.questions.length} câu nên sửa
          </p>
          <ol className="guide-list">
            {result.questions.map((question, index) => (
              <li key={index}>
                <p className="body-md">
                  <span className={`pill ${GUIDE_LABEL_TEXT[question.label].pill}`}>{GUIDE_LABEL_TEXT[question.label].name}</span> {question.text}
                </p>
                {question.hint && <p className="body-sm c-variant">{question.hint}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
