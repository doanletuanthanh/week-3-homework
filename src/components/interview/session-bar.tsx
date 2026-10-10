"use client";

import { useState } from "react";
import { ChevronDownIcon, LockIcon, StopIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { MAX_TURNS } from "@/config/limits";

type Props = {
  personaName: string;
  avatarKey: string | null;
  researchGoal: string;
  /** The seal counter. It is the same number for the whole session. */
  itemCount: number;
  /** Learner turns played so far. */
  turnCount: number;
  onEnd: () => void;
  endDisabled: boolean;
};

/** The bar above the chat: who, the research question, the turn count, the seal counter, the end button. */
export function SessionBar({ personaName, avatarKey, researchGoal, itemCount, turnCount, onEnd, endDisabled }: Props) {
  const [goalOpen, setGoalOpen] = useState(false);

  return (
    <div className="sbar">
      <PersonaAvatar size={40} avatarKey={avatarKey} name={personaName} />
      <h1 className="label-lg sbar-name">
        <span className="sr">Buổi phỏng vấn người dùng với </span>
        {personaName}
      </h1>
      {/* One line until it is opened: on a phone the whole question rarely fits. */}
      <button type="button" className="rq body-sm" aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
        <span className="rq-text">
          <span className="rq-prefix">Câu hỏi nghiên cứu: </span>
          {researchGoal}
        </span>
        <ChevronDownIcon size={16} className="c-outline rq-chevron" />
      </button>
      <div className="sbar-meta">
        <div className="sbar-turns">
          <span className="label-sm c-variant">Lượt</span>
          <span className="code">
            {turnCount}/{MAX_TURNS}
          </span>
          <div className="bar" aria-hidden="true">
            <i className="f-primary" style={{ width: `${(turnCount / MAX_TURNS) * 100}%` }} />
          </div>
        </div>
        <span className="pill pill-tertiary">
          <LockIcon size={12} strokeWidth={2.4} />
          <span className="wide-only">{personaName} đang giữ </span>
          {itemCount} điều chưa nói
        </span>
      </div>
      <button type="button" className="btn btn-surface btn-md sbar-end" onClick={onEnd} disabled={endDisabled}>
        <StopIcon size={16} />
        Kết thúc buổi
      </button>
    </div>
  );
}
