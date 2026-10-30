import type { ReactNode } from "react";
import { CheckIcon, LockIcon, UnlockIcon, WarningIcon } from "@/components/icons";
import { HintBody } from "@/components/reveal/next-time-hints";
import type { ReplayOutcome } from "@/engine/replay-result";
import type { BrowserHint } from "@/engine/seal";
import { REPLAY_RESULT, fillTemplate } from "@/strings/product-strings";

type Persona = { displayName: string; displayNameCapitalized: string };

type Props = {
  outcome: ReplayOutcome;
  persona: Persona;
  /** A small line over the result, e.g. where the replay started. */
  eyebrow?: string;
  /**
   * The result card of Màn 6: a success shows its sample question too, and a leading-question
   * replay leaves its hint to the hints for next time under the card.
   */
  resultCard?: boolean;
  /** The actions under the result: "Về kết quả buổi", or the link to the replay's turns. */
  children?: ReactNode;
};

/** The item the persona held back, which the replay did not open: a hint for it, never its text. */
function HeldItem({ hint, persona }: { hint: BrowserHint; persona: Persona }) {
  return (
    <div className="rr-row">
      <span className="sealed rr-mark">
        <LockIcon size={24} strokeWidth={2.2} />
      </span>
      <div className="rr-held">
        <span className="eyebrow c-tertiary">{fillTemplate(REPLAY_RESULT.held_back, { persona: persona.displayName })}</span>
        <HintBody hint={hint} persona={persona} />
      </div>
    </div>
  );
}

/**
 * What a finished replay says (PRD Màn 7), in fixed strings filled by code: the item that was
 * opened, a hint for the item that stayed held, or how the three questions went. Item texts and
 * the learner's own words are rendered as text nodes.
 */
export function ReplayResult({ outcome, persona, eyebrow, resultCard, children }: Props) {
  if (outcome.level === "primary" && outcome.result === "success") {
    return (
      <div className="rr rr-unlocked" role="status" data-result="success">
        <div className="rr-row rr-pad">
          <span className="rr-open">
            <UnlockIcon size={26} strokeWidth={2.2} />
          </span>
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <p className="headline-md">{fillTemplate(REPLAY_RESULT.unlocked, { item: outcome.target.content })}</p>
            <p className="body-md rr-note">{REPLAY_RESULT.unlocked_note}</p>
          </div>
        </div>
        <div className="rr-foot">
          {resultCard && (
            <p className="rr-sample">
              <span className="label-sm">CÂU HỎI MẪU</span>
              <span className="q2">“{outcome.target.sampleQuestion}”</span>
            </p>
          )}
          {children}
        </div>
      </div>
    );
  }

  const names = { persona: persona.displayName };
  return (
    <div className="card-lg rr rr-plain" role="status" data-result={outcome.result}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {outcome.level === "primary" ? (
        <>
          {outcome.otherItem !== null && (
            <div className="rr-row rr-other">
              <span className="check rr-mark">
                <CheckIcon size={20} strokeWidth={3} />
              </span>
              <p className="headline-sm">{fillTemplate(REPLAY_RESULT.other_item, { item: outcome.otherItem })}</p>
            </div>
          )}
          <HeldItem hint={outcome.hint} persona={persona} />
        </>
      ) : outcome.result === "success" ? (
        <div className="rr-row">
          <span className="check rr-mark">
            <CheckIcon size={20} strokeWidth={3} />
          </span>
          <p className="headline-sm">{fillTemplate(REPLAY_RESULT.no_leading, { ...names, count: outcome.grounded })}</p>
        </div>
      ) : (
        <>
          {/* A replay that was skipped asked no question: there is nothing to say about its questions. */}
          {outcome.result !== "skipped" && (
            <div className="rr-row">
              <span className="rr-mark rr-warn">
                <WarningIcon size={18} />
              </span>
              <p className="headline-sm">
                {outcome.stillLeading
                  ? fillTemplate(REPLAY_RESULT.still_leading, outcome.stillLeading)
                  : outcome.result === "stopped" && outcome.grounded > 0
                    ? fillTemplate(REPLAY_RESULT.stopped_grounded, { ...names, count: outcome.grounded })
                    : fillTemplate(REPLAY_RESULT.none_grounded, names)}
              </p>
            </div>
          )}
          {outcome.hint !== null && !resultCard && (
            <div className={outcome.result === "skipped" ? undefined : "rr-indent"}>
              <HintBody hint={outcome.hint} persona={persona} />
            </div>
          )}
        </>
      )}
      {children && <div className="rr-actions">{children}</div>}
    </div>
  );
}
