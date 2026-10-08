import Link from "next/link";
import { ArrowRightIcon, ChevronRightIcon, PulseIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import type { SessionListItem } from "@/server/session-list";

/** "Kể 3/11 · Nhận biết 4"; empty notes and notes that could not be judged say so or say nothing (PRD Màn 9). */
function Result({ result }: { result: NonNullable<SessionListItem["result"]> }) {
  const { told, total, recognized } = result;
  return (
    <span className="res">
      <b>
        Kể {told}/{total}
      </b>
      {recognized.state === "count" && <> · Nhận biết {recognized.value}</>}
      {recognized.state === "empty" && <> · Không có ghi chú</>}
    </span>
  );
}

/** The label of the session's state (PRD §7), in words: colour never carries it alone. */
function State({ state }: { state: SessionListItem["state"] }) {
  switch (state) {
    case "in_progress":
      return (
        <>
          <span className="pill pill-amber">
            <PulseIcon size={12} />
            Đang làm dở
          </span>
          <span className="btn btn-primary btn-sm">
            Tiếp tục
            <ArrowRightIcon size={14} />
          </span>
        </>
      );
    case "done":
      return (
        <span className="btn btn-surface btn-sm srow-review">
          Xem lại
          <ArrowRightIcon size={14} />
        </span>
      );
    case "withdrawn":
      return <span className="pill pill-neutral">Đã dừng: nhân vật đã được gỡ</span>;
    case "preparing":
      return <span className="st c-variant">Đang chuẩn bị</span>;
    case "failed_eval":
      return <span className="pill pill-error">Chưa qua kiểm tra</span>;
  }
}

/** One session of "Buổi của tôi". The whole row opens the session, on the screen of its state. */
export function SessionRow({ item }: { item: SessionListItem }) {
  return (
    <li>
      <Link className="srow" href={`/sessions/${item.id}`}>
        <PersonaAvatar size={44} />
        <div className="srow-who">
          <p className="label-lg">{item.personaName}</p>
          <p className="body-sm c-variant">{item.topicTitle}</p>
        </div>
        <span className="code c-variant srow-date">{item.date}</span>
        <span className="srow-res">{item.result && <Result result={item.result} />}</span>
        <span className="act">
          <State state={item.state} />
          {item.state !== "in_progress" && item.state !== "done" && <ChevronRightIcon size={16} className="c-outline" />}
        </span>
      </Link>
    </li>
  );
}
