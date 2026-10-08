import { LockIcon } from "@/components/icons";
import type { BrowserReveal } from "@/engine/seal";
import { DIAGNOSIS, fillTemplate } from "@/strings/product-strings";

type Props = { replay: BrowserReveal["replay"]; personaName: string };

/**
 * Màn 6 item 2. With a replay moment: the fixed diagnosis line and the way back into the session,
 * and for a primary moment the card of the item that is held back, which says nothing about it.
 * With none: the sample question of the most important item still locked.
 */
export function ReplayOffer({ replay, personaName }: Props) {
  if (replay.level === "none") {
    if (replay.sampleQuestion === null) return null;
    return (
      <section className="card no-replay">
        <span className="eyebrow c-outline">Buổi này không có lượt để luyện lại</span>
        <div className="ctx">
          <span className="ctx-k">Câu hỏi mẫu</span>
          <p className="q">“{replay.sampleQuestion}”</p>
        </div>
      </section>
    );
  }

  const { diagnosis } = replay;
  return (
    <section className="replay-offer" aria-labelledby="replay-title">
      <div>
        <span className="eyebrow">Luyện lại · 3 lượt</span>
        <h2 id="replay-title" className="headline-lg">
          {fillTemplate(DIAGNOSIS[diagnosis.key], { turn: diagnosis.turn, persona: personaName })}
        </h2>
        <div className="replay-actions">
          {/* Starting and skipping the replay come with the replay itself; until then both are off. */}
          <button type="button" className="btn btn-lg btn-onDark" disabled>
            Quay lại lượt {replay.returnTurn}
          </button>
          <button type="button" className="lnk" disabled>
            Bỏ qua, cho tôi xem luôn
          </button>
        </div>
      </div>
      {replay.level === "primary" && (
        <div className="held-card">
          <span className="sealed">
            <LockIcon size={18} />
          </span>
          <div>
            <span className="label-md">Giữ lại để bạn thử</span>
            <p className="body-sm">Một điều {personaName} chưa kể. Mở ra sau khi bạn luyện lại hoặc bỏ qua.</p>
          </div>
        </div>
      )}
    </section>
  );
}
