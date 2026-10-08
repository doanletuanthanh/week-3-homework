import { CheckIcon, EyeIcon, LockIcon, UnlockIcon } from "@/components/icons";
import type { BrowserReveal } from "@/engine/seal";
import type { RevealHeader } from "@/server/session-view";

type Props = {
  header: RevealHeader;
  reveal: BrowserReveal;
  /** What the replay target is called in the tally: held while the replay is ahead, opened after it. */
  heldLabel: string;
  /** The replay has ended, so the target is no longer sealed. */
  heldOpen: boolean;
};

/** NHẬN BIẾT as a line. Empty notes are never shown as a zero (FR-49); a failed judge shows no line. */
function Recognized({ recognized }: { recognized: BrowserReveal["recognized"] }) {
  if (recognized.state === "ungraded") return null;
  if (recognized.state === "empty") {
    return (
      <div className="recog" data-empty="true">
        <span className="icon-circle">
          <EyeIcon size={16} />
        </span>
        <p className="body-md c-variant">Không có ghi chú trong buổi này</p>
      </div>
    );
  }
  return (
    <div className="recog">
      <span className="icon-circle">
        <EyeIcon size={16} />
      </span>
      {recognized.value === 0 ? (
        <p className="body-md">Nhận biết: chưa có điều quan trọng nào trong ghi chú của bạn.</p>
      ) : (
        <p className="body-lg">
          <strong>Nhận biết: {recognized.value}</strong> điều quan trọng trong ghi chú của bạn.
        </p>
      )}
    </div>
  );
}

/** Màn 6 item 1: the guess against what the persona told, and what the notes caught. */
export function TwoNumbers({ header, reveal, heldLabel, heldOpen }: Props) {
  const { told, total, held, missed } = reveal;
  const share = (count: number) => `${(count / total) * 100}%`;
  return (
    <section className="card reveal-head">
      <span className="eyebrow">
        {header.personaName} · {header.date} · {header.turnCount} lượt
      </span>
      <h1 className="headline-xl">
        Bạn đoán {reveal.guess}.
        <br />
        <span className="italic c-primary">
          {header.personaName} đã kể: {told} trên {total}.
        </span>
      </h1>
      <div className="tally">
        <div className="bar h8" aria-hidden="true">
          <i className="f-secondary" style={{ width: share(told) }} />
          <i className="f-tertiary" style={{ width: share(held) }} />
          <i className="f-muted" style={{ flex: 1 }} />
        </div>
        <div className="label-sm tally-key">
          <span className="c-secondary">
            <CheckIcon size={14} />
            {told} Đã kể
          </span>
          {held > 0 && (
            <span className="c-tertiary">
              {heldOpen ? <UnlockIcon size={14} /> : <LockIcon size={14} />}
              {held} {heldLabel}
            </span>
          )}
          <span className="c-amber">{missed} Bỏ lỡ</span>
        </div>
      </div>
      <Recognized recognized={reveal.recognized} />
    </section>
  );
}
