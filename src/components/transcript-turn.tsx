import type { ReactNode } from "react";

type Props = {
  index: number;
  personaName: string;
  /** Null for the persona's opening line, which answers no question. */
  learnerText: ReactNode | null;
  personaText: string;
  /** The verifier agreed this question led the persona. */
  leading?: boolean;
  /** The turn the learner jumped to, for a moment. */
  highlighted?: boolean;
};

/**
 * One turn of a transcript that is read, not played: its number, the question, the answer. An
 * item of a list. The texts are text nodes, so what a learner typed is shown as typed.
 */
export function TranscriptTurn({ index, personaName, learnerText, personaText, leading = false, highlighted = false }: Props) {
  return (
    <li className={highlighted ? "turn now" : "turn"} data-turn={index}>
      <div className="turn-k">
        <span className="k">Lượt {String(index).padStart(2, "0")}</span>
        {leading && <span className="lab lab-never">Dẫn dắt</span>}
      </div>
      <div>
        {learnerText !== null && (
          <p className="tl">
            <span className="who-l">BẠN</span>
            {learnerText}
          </p>
        )}
        <p className="tl">
          <span className="who-l">{personaName.toLocaleUpperCase("vi")}</span>
          {personaText}
        </p>
      </div>
    </li>
  );
}
