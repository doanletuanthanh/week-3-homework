"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertIcon, ArrowRightIcon, CheckIcon, LockIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { PersonaAvatar } from "@/components/persona-avatar";
import type { NextStep as NextStepChoice } from "@/server/library";
import { LIBRARY, NEXT_STEP, TOPIC, fillTemplate } from "@/strings/product-strings";

/**
 * The first card of the next step (FR-31): a persona the learner has not practised, of the same
 * topic first; or that every persona of the role was practised; or, when the role has none, just
 * the way to the library. It never says "you practised them all" about a role with no persona.
 */
function Suggestion({ next }: { next: NextStepChoice }) {
  if (next.kind === "next") {
    const { persona } = next;
    return (
      <div className="card next-card">
        <span className="eyebrow">{persona.sameTopic ? NEXT_STEP.same_topic : NEXT_STEP.other_topic}</span>
        <div className="next-who">
          <PersonaAvatar size={48} avatarKey={persona.avatarKey} name={persona.displayName} />
          <div>
            <h3 className="headline-sm">{persona.name}</h3>
            {/* The topic is named when it is not the one just practised. */}
            {!persona.sameTopic && <p className="body-sm c-variant">{persona.topicTitle}</p>}
            <p className="label-md c-tertiary next-seal">
              <LockIcon size={14} />
              Đang giữ {persona.itemCount} điều
            </p>
          </div>
        </div>
        <div className="next-actions">
          <Link className="btn btn-primary btn-card" href={`/prep/${persona.personaId}`}>
            {fillTemplate(NEXT_STEP.continue_with, { persona: persona.displayName })}
            <ArrowRightIcon size={16} />
          </Link>
          <Link href="/library" className="lnk">
            {TOPIC.to_library}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card next-card">
      {next.kind === "all_practised" && <p className="body-md">{NEXT_STEP.all_practised}</p>}
      <Link href="/library" className="lnk">
        {LIBRARY.enter}
      </Link>
    </div>
  );
}

/**
 * Màn 6 item 7: what to practise next, and the waitlist for more personas. Pressing the waitlist
 * button again writes nothing new.
 */
export function NextStep({ waitlisted, next }: { waitlisted: boolean; next: NextStepChoice }) {
  const [joined, setJoined] = useState(waitlisted);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function join() {
    setSending(true);
    setFailed(false);
    const outcome = await sendJson("/api/waitlist", "POST", { context: "no_more_personas" });
    setSending(false);
    if (outcome.ok) setJoined(true);
    else if (outcome.redirectTo) window.location.assign(outcome.redirectTo);
    else setFailed(true);
  }

  return (
    <section className="next-step" aria-label="Bước tiếp theo">
      <Suggestion next={next} />
      <div className="card next-card">
        {joined ? (
          <p className="body-md joined" role="status">
            <span className="check">
              <CheckIcon size={12} />
            </span>
            Đã ghi. Chúng tôi sẽ báo khi có persona mới.
          </p>
        ) : (
          <>
            <h3 className="headline-sm">Muốn thêm persona?</h3>
            <button type="button" className="btn btn-surface btn-card" onClick={() => void join()} disabled={sending}>
              {sending ? "Đang ghi…" : "Báo tôi khi có"}
            </button>
            {failed && (
              <p className="ferr" role="alert">
                <AlertIcon size={16} />
                Không kết nối được. Thử lại.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
