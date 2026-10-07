export type Turn = { index: number; learnerText: string | null; personaText: string };

/** The question being answered, and as much of the reply as has arrived. */
export type PendingTurn = { index: number; text: string; reply: string };

type Props = { turns: Turn[]; pending: PendingTurn | null; personaName: string };

const turnLabel = (index: number) => `lượt ${String(index).padStart(2, "0")}`;

function LearnerLine({ index, text }: { index: number; text: string }) {
  return (
    <div className="msg chat-me">
      <div className="msg-meta">
        <span className="time">{turnLabel(index)}</span>
        <span className="who who-me">
          <i />
          Bạn
        </span>
      </div>
      <div className="bubble-me">{text}</div>
    </div>
  );
}

function PersonaLine({ name, text, streaming }: { name: string; text: string; streaming?: boolean }) {
  return (
    <div className="msg chat-p" data-streaming={streaming ? "" : undefined}>
      <span className="who who-p">
        <i />
        {name}
      </span>
      <div className="bubble-p">{text}</div>
    </div>
  );
}

/**
 * The conversation so far. All text is rendered as text nodes, so learner input is always
 * escaped. Nothing but the two speakers' words and the turn number is shown.
 */
export function TranscriptList({ turns, pending, personaName }: Props) {
  return (
    <ol className="chat-log">
      {turns.map((turn) => (
        <li key={turn.index} className="chat-turn">
          {turn.learnerText !== null && <LearnerLine index={turn.index} text={turn.learnerText} />}
          <PersonaLine name={personaName} text={turn.personaText} />
        </li>
      ))}
      {pending !== null && (
        <li className="chat-turn">
          <LearnerLine index={pending.index} text={pending.text} />
          {pending.reply === "" ? (
            // Screen readers hear this from the screen's live region.
            <span className="typing">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              {personaName} đang gõ…
            </span>
          ) : (
            // Not a turn yet: it is dropped when the stream fails.
            <PersonaLine name={personaName} text={pending.reply} streaming />
          )}
        </li>
      )}
    </ol>
  );
}
