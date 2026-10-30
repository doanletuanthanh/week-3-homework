import Link from "next/link";
import { ArrowRightIcon, HistoryIcon } from "@/components/icons";
import { getDb } from "@/db/client";
import { findFirstProgressSource, findNewestProgressSource, findPreviousProgressSource } from "@/db/repo/sessions";
import { capitalizeFirst } from "@/scenario/persona-card";
import { requireAckedUser } from "@/server/auth";
import { compareProgress, type Line, type SessionFacts, type Trend } from "@/server/progress";
import { LIBRARY } from "@/strings/product-strings";

export const metadata = { title: "Tiến bộ của tôi · InterviewLab" };

const TREND_WORD: Record<Trend, string> = { better: "Tốt hơn", same: "Như cũ", worse: "Cần chú ý" };

const dateOf = (facts: SessionFacts) => facts.revealedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const IGNORED_LABEL = "Lời gợi mở bạn chưa hỏi tiếp";

/**
 * One line in words: what it counts, before → after, and whether that is better. Never a
 * percentage. What was told shows its totals whenever they differ, so the trend, which compares
 * shares, never contradicts the counts shown.
 */
function lineText(line: Line, before: SessionFacts, after: SessionFacts, samePersona: boolean): string {
  if (line.key === "told") {
    const who = samePersona ? capitalizeFirst(after.personaName) : "Nhân vật";
    return before.total === after.total
      ? `${who} kể: ${line.before} → ${line.after} điều`
      : `${who} kể: ${line.before}/${before.total} → ${line.after}/${after.total} điều`;
  }
  return line.key === "leading" ? `Câu dẫn dắt: ${line.before} → ${line.after} câu` : `${IGNORED_LABEL}: ${line.before} → ${line.after} lần`;
}

/**
 * Tiến bộ của tôi: the newest session against the previous one with the same persona, else
 * against the learner's first, in counts and in the learner's own questions. Computed from what
 * each session already stored: no model is called.
 */
export default async function ProgressPage() {
  const user = await requireAckedUser("/progress");
  const db = getDb();
  const newest = await findNewestProgressSource(db, user.id);
  const [previous, first] = newest ? await Promise.all([findPreviousProgressSource(db, user.id, newest), findFirstProgressSource(db, user.id)]) : [null, null];
  const comparison = compareProgress(newest, previous, first);

  return (
    <main className="container prog">
      <div>
        <span className="eyebrow">{comparison?.kind === "pair" ? "Lần trước → Lần này" : "Tiến bộ"}</span>
        <h1 className="headline-lg">Tiến bộ của tôi</h1>
      </div>

      {comparison === null ? (
        <section className="card-lg mine-empty">
          <HistoryIcon size={40} className="c-outline" />
          <h2 className="headline-md">Chưa có buổi nào có kết quả</h2>
          <p className="body-md c-variant">Xong một buổi và xem kết quả, tiến bộ của bạn sẽ hiện ở đây.</p>
          <Link className="btn btn-primary btn-lg" href="/library">
            {LIBRARY.enter}
            <ArrowRightIcon />
          </Link>
        </section>
      ) : comparison.kind === "single" ? (
        <section className="card prog-cmp" aria-label="Buổi đầu">
          <span className="eyebrow">Buổi đầu · {dateOf(comparison.latest)}</span>
          <ul className="prog-lines" role="list">
            <li>
              {capitalizeFirst(comparison.latest.personaName)} kể: {comparison.latest.told}/{comparison.latest.total} điều
            </li>
            <li>Câu dẫn dắt: {comparison.latest.leading} câu</li>
            <li>
              {IGNORED_LABEL}: {comparison.latest.ignoredHints} lần
            </li>
          </ul>
          <p className="body-md c-variant">Luyện thêm một buổi, trang này sẽ so lần trước với lần này.</p>
          <Link className="btn btn-primary btn-md" href={`/prep/${comparison.latest.personaId}`}>
            Luyện lại với {comparison.latest.personaName}
            <ArrowRightIcon />
          </Link>
        </section>
      ) : (
        <section className="card prog-cmp" aria-label="So với lần trước">
          <span className="eyebrow">
            {comparison.samePersona
              ? `${capitalizeFirst(comparison.after.personaName)} · ${dateOf(comparison.before)} → ${dateOf(comparison.after)}`
              : `${capitalizeFirst(comparison.before.personaName)} (${dateOf(comparison.before)}) → ${comparison.after.personaName} (${dateOf(comparison.after)})`}
          </span>
          <ul className="prog-lines" role="list">
            {comparison.lines.map((line) => (
              <li key={line.key}>
                {lineText(line, comparison.before, comparison.after, comparison.samePersona)}{" "}
                <span className="prog-trend" data-trend={line.trend}>
                  {TREND_WORD[line.trend]}
                </span>
              </li>
            ))}
          </ul>
          {comparison.pair && (
            <div className="pair">
              <div className="pair-c pair-instead">
                <span className="label-sm c-error up wider">Trước</span>
                <p className="q2">“{comparison.pair.before}”</p>
              </div>
              <span className="pair-arr" aria-hidden="true">
                <ArrowRightIcon size={18} />
              </span>
              <div className="pair-c pair-ask">
                <span className="label-sm c-primary up wider">Sau</span>
                <p className="q2">“{comparison.pair.after}”</p>
              </div>
            </div>
          )}
        </section>
      )}

      {comparison !== null && (
        <nav className="prog-links" aria-label="Xem thêm">
          <Link href="/my-sessions" className="lnk">
            Xem các buổi
          </Link>
          <Link href="/guide-check" className="lnk">
            Kiểm tra bộ câu hỏi cho ý tưởng app của bạn
          </Link>
        </nav>
      )}
    </main>
  );
}
