import { UnlockIcon } from "@/components/icons";
import type { CanvasMatchKind } from "@/engine/reveal-types";
import type { NoteSegment } from "@/engine/seal";
import { CANVAS_EXPLANATION, CANVAS_REPLAY_OPENED, fillTemplate } from "@/strings/product-strings";
import { TurnRef } from "./turn-ref";

type Persona = { displayName: string; displayNameCapitalized: string };

/** Every colour on the notes comes with these words (NFR-15). */
const LABEL: Record<CanvasMatchKind, string> = {
  told: "Đã kể",
  unconfirmed: "Chưa xác nhận",
  unrevealed: "Chưa từng lộ ra",
  never_said: "Chưa từng được nói",
};
const CLASS: Record<CanvasMatchKind, string> = { told: "told", unconfirmed: "unconf", unrevealed: "unrev", never_said: "never" };
const KINDS = Object.keys(LABEL) as CanvasMatchKind[];

/**
 * The fixed sentence under a marked note (FR-48a), chosen by what the note turned out to be. It
 * is never the judge's own reason. Its turn is the one link from the notes into the transcript.
 */
function Explanation({ match, persona }: { match: NonNullable<NoteSegment["match"]>; persona: Persona }) {
  const names = { persona: persona.displayName, Persona: persona.displayNameCapitalized };
  const template = CANVAS_EXPLANATION[match.kind];
  if (match.kind === "told" && match.turn !== null) {
    const [before, after] = template.split("lượt {turn}");
    return (
      <p className="cv-why">
        {fillTemplate(before, names)}
        <TurnRef turn={match.turn} lower />
        {fillTemplate(after, names)}
      </p>
    );
  }
  return (
    <p className="cv-why">
      {fillTemplate(template, names)}
      {match.turn !== null && (
        <>
          {" "}
          <TurnRef turn={match.turn} />
        </>
      )}
    </p>
  );
}

type Props = { notes: NoteSegment[]; ungraded: boolean; persona: Persona };

/**
 * Màn 6 item 5: the frozen notes as written, with each judged stretch marked, named in words and
 * explained right under it. Plain stretches (surface facts, and anything not judged) carry no mark.
 * The notes are learner text and are rendered as text nodes only.
 */
export function NotesReview({ notes, ungraded, persona }: Props) {
  return (
    <section className="card notes-review" aria-labelledby="notes-title">
      <div className="notes-head">
        <h2 id="notes-title" className="headline-sm">
          Ghi chú của bạn
        </h2>
        {!ungraded && (
          <ul className="legend" aria-label="Chú giải">
            {KINDS.map((kind) => (
              <li key={kind} className={`lab lab-${CLASS[kind]}`}>
                {LABEL[kind]}
              </li>
            ))}
          </ul>
        )}
      </div>
      {ungraded && <p className="note-box note-info body-md">Chưa chấm được ghi chú lần này</p>}
      <div className="paper">
        {notes.map((segment, position) =>
          segment.match === null ? (
            segment.text.trim() !== "" && (
              <p key={position} className="cv-line cv-plain">
                {segment.text.trim()}
              </p>
            )
          ) : (
            <div key={position} className="cv-line" data-kind={segment.match.kind}>
              <div className="cv-mark">
                <mark className={`hl hl-${CLASS[segment.match.kind]}`}>{segment.text}</mark>
                <span className={`lab lab-${CLASS[segment.match.kind]}`}>{LABEL[segment.match.kind]}</span>
              </div>
              {segment.match.itemContent && <p className="cv-item">{segment.match.itemContent}</p>}
              <Explanation match={segment.match} persona={persona} />
              {segment.match.openedInReplay && (
                <p className="cv-why cv-replay">
                  <UnlockIcon size={14} />
                  {fillTemplate(CANVAS_REPLAY_OPENED, { persona: persona.displayName })}
                </p>
              )}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
