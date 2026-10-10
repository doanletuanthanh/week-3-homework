import Link from "next/link";
import { ArrowRightIcon, CheckIcon, LockIcon, PulseIcon, ReplayIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { StartSessionButton } from "@/components/start-session-button";
import { startSession } from "@/server/actions";
import type { PersonaCardView } from "@/server/library";

/** The state of the learner's session with the persona (PRD §7), in words: colour never carries it alone. */
function State({ persona }: { persona: PersonaCardView }) {
  switch (persona.button) {
    case "start":
      return (
        <span className="ribbon ribbon-primary">
          <span className="ping" />
          Sẵn sàng
        </span>
      );
    case "continue":
      return (
        <span className="ribbon ribbon-amber">
          <PulseIcon size={14} />
          Đang làm dở
        </span>
      );
    case "review":
      return (
        <span className="ribbon ribbon-muted">
          <CheckIcon size={14} />
          Đã luyện · {persona.sessionDate}
        </span>
      );
  }
}

/** The button of the card (PRD §7). A link: a session is created on Màn 3, not here. */
function MainButton({ persona }: { persona: PersonaCardView }) {
  if (persona.button === "start" || persona.sessionId === null) {
    return (
      <Link className="btn btn-primary btn-card" href={`/prep/${persona.personaId}`}>
        Bắt đầu
        <ArrowRightIcon size={16} />
      </Link>
    );
  }
  // The session's own URL shows the screen of its state, Màn 3 included while no question was asked.
  return persona.button === "review" ? (
    <Link className="btn btn-surface btn-card" href={`/sessions/${persona.sessionId}`}>
      Xem lại kết quả
      <ArrowRightIcon size={16} />
    </Link>
  ) : (
    <Link className="btn btn-primary btn-card" href={`/sessions/${persona.sessionId}`}>
      <ReplayIcon size={16} />
      Tiếp tục buổi luyện
    </Link>
  );
}

/**
 * A persona of a topic (Màn 2b): who it is, the research question, how many things it holds
 * unsaid, and the button that fits the learner's session with it. `demo`: the account has no
 * one-session limit, so every card can also start one more (FR-45).
 */
export function PersonaCard({ persona, demo }: { persona: PersonaCardView; demo: boolean }) {
  return (
    <article className="card pcard" aria-labelledby={`persona-${persona.personaId}`}>
      <State persona={persona} />
      <div className="pcard-body">
        <div className="pcard-who">
          <PersonaAvatar size={64} avatarKey={persona.avatarKey} name={persona.displayName} />
          <div>
            <h2 id={`persona-${persona.personaId}`} className="headline-md">
              {persona.name}
            </h2>
            <p className="body-md c-variant">{persona.tagline}</p>
          </div>
        </div>
        <div className="ctx">
          <span className="ctx-k">Câu hỏi nghiên cứu</span>
          <p className="body-md">{persona.researchGoal}</p>
        </div>
        <div className="attr pcard-seal">
          <span className="attr-k">Niêm phong</span>
          <span className="attr-v c-tertiary">
            <LockIcon size={16} />
            Đang giữ {persona.itemCount} điều chưa nói
          </span>
        </div>
      </div>
      <div className="actionbar">
        {demo && (
          <form action={startSession}>
            <input type="hidden" name="personaId" value={persona.personaId} />
            <StartSessionButton another card />
          </form>
        )}
        <MainButton persona={persona} />
      </div>
    </article>
  );
}
