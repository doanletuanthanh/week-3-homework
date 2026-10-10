import { WarningIcon } from "@/components/icons";
import { TOPIC } from "@/strings/product-strings";

/** The overlap warning of a topic (FR-51): what its personas tell is not research on real users. */
export function TopicWarning() {
  return (
    <div className="note-box note-info topic-warning" role="note">
      <WarningIcon size={20} className="c-variant" />
      <p className="body-md">{TOPIC.warning}</p>
    </div>
  );
}
