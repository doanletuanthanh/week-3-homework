import Link from "next/link";
import { ArrowRightIcon, LayersIcon } from "@/components/icons";
import type { TopicRole } from "@/db/schema";
import type { LibraryTopic } from "@/server/library";
import { LIBRARY, ROLE_LABEL } from "@/strings/product-strings";

/** The colours of a role. They never stand alone: the pill beside them says the role in words. */
export const ROLE_STYLE: Record<TopicRole, { tile: string; pill: string }> = {
  ux: { tile: "tt-ux", pill: "pill-green" },
  ba: { tile: "tt-ba", pill: "pill-tertiary" },
  pm: { tile: "tt-pm", pill: "pill-pm" },
};

/** "Đã luyện 1/3" with its bar: how many personas of a topic the learner has finished a session with. */
export function PractisedBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="tcard-done">
      <div className="label-sm tcard-done-row">
        <span className="c-variant">{LIBRARY.practised}</span>{" "}
        <span className="c-secondary">
          {done}/{total}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <i className="f-secondary" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * A curated topic of the library (Màn 2, and the preview on Màn 1). The whole card opens the
 * topic. `level`: the heading level that fits where the card stands.
 */
export function TopicCard({ topic, level = 2 }: { topic: LibraryTopic; level?: 2 | 3 }) {
  const style = topic.role ? ROLE_STYLE[topic.role] : null;
  const Title = level === 2 ? "h2" : "h3";
  return (
    <Link className="card tcard" href={`/topics/${topic.id}`}>
      <div className="tbody">
        <div className="tcard-top">
          <span className={`tt tcard-ic ${style?.tile ?? "tt-cu"}`}>
            <LayersIcon size={24} strokeWidth={1.8} />
          </span>
          {topic.role && style && <span className={`pill ${style.pill}`}>{ROLE_LABEL[topic.role]}</span>}
        </div>
        <div>
          <Title className="headline-md tcard-title">{topic.title}</Title>
          <p className="body-md c-variant">{topic.summary}</p>
        </div>
        {topic.doneCount !== null && <PractisedBar done={topic.doneCount} total={topic.personaCount} />}
      </div>
      <div className="tfoot">
        <span className="label-md c-variant">{topic.personaCount} persona</span>
        <ArrowRightIcon className="c-primary" />
      </div>
    </Link>
  );
}
