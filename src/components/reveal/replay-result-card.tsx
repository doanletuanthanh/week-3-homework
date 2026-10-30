import { ReplayResult } from "@/components/replay/replay-result";
import type { ReplayOutcome } from "@/engine/replay-result";
import { TurnRef } from "./turn-ref";

type Props = {
  outcome: ReplayOutcome;
  persona: { displayName: string; displayNameCapitalized: string };
  /** The turn the replay started at. */
  returnTurn: number;
  /** Replay questions that were answered: none for a replay that was skipped. */
  turnCount: number;
  onOpenReplay: () => void;
};

/**
 * Màn 6 in done mode: where the replay offer stood, how the replay ended, in the words Màn 7
 * used, with what was held (its text only if the replay opened it, else a hint) and a way to read
 * the replay's own turns. The target stays here: it moves into neither "Đã kể" nor the hints for
 * next time, and no number of the main interview changes.
 */
export function ReplayResultCard({ outcome, persona, returnTurn, turnCount, onOpenReplay }: Props) {
  const eyebrow = outcome.result === "skipped" ? `Đã bỏ qua lần luyện lại từ lượt ${returnTurn}` : `Luyện lại từ lượt ${returnTurn}`;
  const unlocked = outcome.level === "primary" && outcome.result === "success";
  return (
    <section className="replay-card" aria-label="Kết quả luyện lại">
      <ReplayResult outcome={outcome} persona={persona} eyebrow={eyebrow} resultCard>
        {outcome.level === "fallback1" && (
          <span className="body-sm c-variant rr-about">
            Câu hỏi được luyện lại: <TurnRef turn={outcome.leadingTurn} />
          </span>
        )}
        {turnCount > 0 && (
          <button type="button" className={`btn btn-card ${unlocked ? "rr-back" : "btn-tonal"}`} onClick={onOpenReplay}>
            Xem {turnCount} lượt luyện lại
          </button>
        )}
      </ReplayResult>
    </section>
  );
}
