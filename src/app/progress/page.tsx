import Link from "next/link";
import { ArrowRightIcon, HistoryIcon } from "@/components/icons";
import { Sparkline } from "@/components/progress/sparkline";
import { getDb } from "@/db/client";
import { listProgressSources } from "@/db/repo/sessions";
import { requireAckedUser } from "@/server/auth";
import { PROGRESS_SESSIONS, progressOf, type SessionProgress } from "@/server/progress";
import { LIBRARY } from "@/strings/product-strings";

export const metadata = { title: "Tiến bộ của tôi · InterviewLab" };

const percent = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

/** The measures of the trend: higher is better, except the habits, where lower is. */
const MEASURES: { key: string; label: string; hint: string; pick: (session: SessionProgress) => number | null }[] = [
  { key: "grounded", label: "Câu bám lời persona", hint: "Câu hỏi dựa vào điều persona vừa nói", pick: (session) => session.grounded },
  { key: "leading", label: "Câu dẫn dắt", hint: "Càng thấp càng tốt", pick: (session) => session.habits.leading },
  { key: "told", label: "Khai thác", hint: "Phần persona đã kể", pick: (session) => session.told },
  { key: "recognized", label: "Nhận biết", hint: "Phần ghi chú của bạn bắt được", pick: (session) => session.recognized },
  { key: "guess", label: "Đoán đúng", hint: "Độ gần của số bạn đoán", pick: (session) => session.guessAccuracy },
];

/**
 * Tiến bộ của tôi: the learner's scores over their newest sessions with a result, and the habit
 * to work on. Computed from what each session already stored: no model is called.
 */
export default async function ProgressPage() {
  const user = await requireAckedUser("/progress");
  const progress = progressOf(await listProgressSources(getDb(), user.id, PROGRESS_SESSIONS));
  const { sessions, weakest } = progress;

  return (
    <main className="container prog">
      <div>
        <span className="eyebrow">{sessions.length > 0 ? `${sessions.length} buổi gần nhất có kết quả` : "Tiến bộ"}</span>
        <h1 className="headline-lg">Tiến bộ của tôi</h1>
      </div>

      {sessions.length === 0 ? (
        <section className="card-lg mine-empty">
          <HistoryIcon size={40} className="c-outline" />
          <h2 className="headline-md">Chưa có buổi nào có kết quả</h2>
          <p className="body-md c-variant">Xong một buổi và xem kết quả, tiến bộ của bạn sẽ hiện ở đây.</p>
          <Link className="btn btn-primary btn-lg" href="/library">
            {LIBRARY.enter}
            <ArrowRightIcon />
          </Link>
        </section>
      ) : (
        <>
          <section className="card prog-habit" aria-label="Thói quen cần sửa nhất">
            <span className="eyebrow">Thói quen cần sửa nhất</span>
            {weakest ? (
              <p className="headline-sm">
                {weakest.name} <span className="c-variant">· {percent(weakest.rate)} trung bình</span>
              </p>
            ) : (
              <p className="body-md">Chưa thấy câu dẫn dắt, câu hỏi tương lai giả định hay điều nghe được mà bỏ qua. Giữ vậy nhé.</p>
            )}
            <Link href="/guide-check" className="lnk">
              Kiểm tra bộ câu hỏi cho ý tưởng app của bạn
            </Link>
          </section>

          <section className="prog-grid" aria-label="Xu hướng">
            {MEASURES.map((measure) => {
              const values = sessions.map(measure.pick);
              return (
                <div key={measure.key} className="card prog-tile">
                  <span className="label-md">{measure.label}</span>
                  <span className="prog-value">{percent(values.at(-1) ?? null)}</span>
                  <Sparkline values={values} label={`${measure.label} qua ${sessions.length} buổi`} />
                  <span className="body-sm c-outline">{measure.hint}</span>
                </div>
              );
            })}
          </section>

          <section className="card adm-panel">
            <h2 className="headline-sm">Từng buổi</h2>
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Buổi</th>
                    {MEASURES.map((measure) => (
                      <th key={measure.key} scope="col" className="adm-num">
                        {measure.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...sessions].reverse().map((session) => (
                    <tr key={session.sessionId}>
                      <td>
                        <Link href={`/sessions/${session.sessionId}`}>{session.personaName}</Link>
                        <div className="body-sm c-outline">
                          {session.revealedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {session.questions} câu
                        </div>
                      </td>
                      {MEASURES.map((measure) => (
                        <td key={measure.key} className="adm-num">
                          {percent(measure.pick(session))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
