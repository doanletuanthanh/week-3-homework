import Link from "next/link";
import { ChevronRightIcon, LockIcon, NoPersonIcon } from "@/components/icons";
import type { ViewTurn } from "@/server/session-view";

type Props = {
  personaName: string;
  topicTitle: string;
  /** The day the session started, as "dd/mm". */
  date: string;
  /** The learner turn the session stopped at. */
  turnCount: number;
  turns: ViewTurn[];
};

const turnLabel = (index: number) => `Lượt ${String(index).padStart(2, "0")}`;

/**
 * A session whose persona was pulled with its sessions (PRD §7): what was said stays readable and
 * nothing more can be sent. No result is shown: the session never reached one.
 */
export function WithdrawnScreen({ personaName, topicTitle, date, turnCount, turns }: Props) {
  return (
    <main className="container stopped">
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href="/my-sessions" className="c-variant">
          Buổi của tôi
        </Link>
        <ChevronRightIcon size={14} className="c-outline" />
        <span aria-current="page">
          {personaName} · {date}
        </span>
      </nav>

      <section className="card stopped-head">
        <span className="stopped-mark">
          <NoPersonIcon size={26} />
        </span>
        <div className="stopped-text">
          <h1 className="headline-md">Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây.</h1>
          <p className="body-sm c-variant">
            {personaName} · {topicTitle} · dừng ở lượt {turnCount}
          </p>
        </div>
        <Link className="btn btn-surface btn-md stopped-back" href="/my-sessions">
          Buổi của tôi
        </Link>
      </section>

      <section className="card stopped-log" aria-labelledby="stopped-log-title">
        <div className="stopped-log-head">
          <h2 id="stopped-log-title" className="label-lg">
            Transcript
          </h2>
          <span className="pill pill-neutral">
            <LockIcon size={11} strokeWidth={2.4} />
            Chỉ đọc
          </span>
        </div>
        {turns.map((turn) => (
          <div className="turn" key={turn.index}>
            <span className="k">{turnLabel(turn.index)}</span>
            <div>
              {turn.learnerText !== null && (
                <p className="tl">
                  <span className="who-l">BẠN</span>
                  {turn.learnerText}
                </p>
              )}
              <p className="tl">
                <span className="who-l">{personaName.toLocaleUpperCase("vi")}</span>
                {turn.personaText}
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
