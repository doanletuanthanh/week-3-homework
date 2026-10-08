import type { ReactNode } from "react";
import { CheckIcon, LockIcon, UnlockIcon, WarningIcon } from "@/components/icons";
import type { ReplayOutcome } from "@/engine/replay-result";
import { REPLAY_RESULT, fillTemplate } from "@/strings/product-strings";

type Persona = { displayName: string; displayNameCapitalized: string };

type Props = {
  outcome: ReplayOutcome;
  persona: Persona;
  /** A small line over the result, e.g. where the replay started. */
  eyebrow?: string;
  /** Shows the target's sample question with a success too (the result card of Màn 6). */
  withSampleQuestion?: boolean;
  /** The actions under the result: "Về kết quả buổi", or the link to the replay's turns. */
  children?: ReactNode;
};

/** The item the persona held back, and one question that would have opened it. */
function HeldItem({ target, persona }: { target: { content: string; sampleQuestion: string }; persona: Persona }) {
  return (
    <>
      <div className="rr-row">
        <span className="sealed rr-mark">
          <LockIcon size={24} strokeWidth={2.2} />
        </span>
        <div>
          <span className="eyebrow c-tertiary">{fillTemplate(REPLAY_RESULT.held_back, { persona: persona.displayName })}</span>
          <p className="headline-md">{target.content}</p>
        </div>
      </div>
      <div className="ctx rr-indent">
        <span className="ctx-k">{REPLAY_RESULT.opening_question}</span>
        <p className="q">“{target.sampleQuestion}”</p>
      </div>
    </>
  );
}

/**
 * What a finished replay says (PRD Màn 7), in fixed strings filled by code: the item that was
 * opened, the item that stayed held with a question for it, or how the three questions went.
 * Item texts and the learner's own words are rendered as text nodes.
 */
export function ReplayResult({ outcome, persona, eyebrow, withSampleQuestion, children }: Props) {
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
          {withSampleQuestion && (
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
          <HeldItem target={outcome.target} persona={persona} />
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
          {outcome.sampleQuestion !== null && (
            <div className={`ctx${outcome.result === "skipped" ? "" : " rr-indent"}`}>
              <span className="ctx-k">Câu hỏi mẫu</span>
              <p className="q">“{outcome.sampleQuestion}”</p>
            </div>
          )}
        </>
      )}
      {children && <div className="rr-actions">{children}</div>}
    </div>
  );
}
