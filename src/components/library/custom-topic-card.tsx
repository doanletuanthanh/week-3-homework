import Link from "next/link";
import { ArrowRightIcon, SparkIcon } from "@/components/icons";
import type { OwnTopicCard } from "@/server/library";
import { CUSTOM_LABEL } from "@/strings/product-strings";
import { PractisedBar } from "./topic-card";

/** What the foot of the card says (PRD §7), in words: colour never carries it alone. */
function State({ state }: { state: OwnTopicCard["state"] }) {
  switch (state) {
    case "preparing":
      return (
        <span className="st c-variant">
          <span className="spin" />
          Đang chuẩn bị
        </span>
      );
    case "failed_eval":
      return <span className="pill pill-error">Chưa qua kiểm tra</span>;
    case "playable":
      return <span className="label-md c-variant">1 persona</span>;
  }
}

/**
 * A topic the learner made (Màn 2, "Chủ đề bạn tự tạo"): always under "Kiểm tra nhẹ". While it
 * is being prepared or did not pass, the card opens Màn 11; once it can be played, its own page.
 */
export function CustomTopicCard({ topic }: { topic: OwnTopicCard }) {
  return (
    <Link className="card tcard" href={topic.href}>
      <div className="tbody">
        <div className="tcard-top">
          <span className="tt tt-cu tcard-ic">
            <SparkIcon size={24} strokeWidth={1.8} />
          </span>
          <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>
        </div>
        <div>
          <h3 className="headline-md tcard-title">{topic.title}</h3>
          <p className="code c-outline">tạo {topic.created}</p>
        </div>
        {topic.state === "playable" && <PractisedBar done={topic.done ? 1 : 0} total={1} />}
      </div>
      <div className="tfoot">
        <State state={topic.state} />
        <ArrowRightIcon className="c-primary" />
      </div>
    </Link>
  );
}
