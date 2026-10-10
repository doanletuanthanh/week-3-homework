import Link from "next/link";
import { PlusIcon, SparkIcon } from "@/components/icons";
import { LIBRARY } from "@/strings/product-strings";

/** The first tile of the library grid: the way to a topic of the learner's own (Màn 10). */
export function CreateTopicCard() {
  return (
    <div className="card lib-create">
      <span className="mk-tile">
        <SparkIcon size={24} strokeWidth={1.8} />
      </span>
      <div className="lib-create-text">
        <h2 className="headline-sm">{LIBRARY.create_title}</h2>
        <p className="body-md c-variant">{LIBRARY.create_body}</p>
      </div>
      <Link className="btn btn-primary btn-md" href="/custom-topic">
        <PlusIcon size={16} />
        {LIBRARY.create_action}
      </Link>
    </div>
  );
}
