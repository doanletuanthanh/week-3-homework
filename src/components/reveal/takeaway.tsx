"use client";

import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import type { BrowserClaim, BrowserReveal } from "@/engine/seal";
import { LEADING_NEVER_SAID, fillTemplate } from "@/strings/product-strings";
import { TurnRef } from "./turn-ref";

type Persona = { displayName: string; displayNameCapitalized: string };
type Props = {
  takeaway: BrowserReveal["takeaway"];
  persona: Persona;
  /** The session is `done`: nothing is held back, so the sheet may be taken away. */
  canDownload: boolean;
  sessionId: string;
  print: { topicTitle: string; date: string; fileName: string };
};

const TITLE = "Thói quen hỏi của bạn — đọc lại trước buổi thật";
const EMPTY = "Buổi này không có câu dẫn dắt hay hook bị bỏ qua nào được ghi nhận.";

/** What the comment is about, in fixed words around the learner's own (FR-30); the generator's sentence follows it. */
function Evidence({ claim, persona, printed }: { claim: BrowserClaim; persona: Persona; printed?: boolean }) {
  const [first, ...others] = claim.turns;
  const turn = (value: number) => (printed ? <span className="code c-primary">Lượt {value}</span> : <TurnRef turn={value} />);
  return (
    <>
      <p className="body-md">
        {first !== undefined && <>{turn(first)} </>}
        {claim.type === "leading" && claim.addedWords && (
          <>
            Bạn tự thêm <strong className="added">“{claim.addedWords}”</strong>; {fillTemplate(LEADING_NEVER_SAID, { persona: persona.displayName })}{" "}
          </>
        )}
        {claim.type === "heard_not_followed" && claim.canvasQuote && (
          <>
            Bạn đã ghi lại <span className="hl hl-unconf">{claim.canvasQuote}</span>.{" "}
          </>
        )}
        {claim.text}
      </p>
      {others.length > 0 && !printed && (
        <p className="body-sm c-variant also">
          Cũng thấy ở
          {others.map((value) => (
            <TurnRef key={value} turn={value} />
          ))}
        </p>
      )}
    </>
  );
}

/** "Thay vì hỏi" is the learner's question word for word; "Hãy hỏi" passed the verifier's label check. */
function Pair({ claim, printed }: { claim: BrowserClaim; printed?: boolean }) {
  if (claim.quote === null || claim.suggestedQuestion === null) return null;
  return (
    <div className="pair">
      <div className="pair-c pair-instead">
        <span className="label-sm c-error up wider">Thay vì hỏi</span>
        <p className="q2">“{claim.quote}”</p>
      </div>
      {!printed && (
        <span className="pair-arr" aria-hidden="true">
          <ArrowRightIcon size={18} />
        </span>
      )}
      <div className="pair-c pair-ask">
        <span className="label-sm c-primary up wider">Hãy hỏi</span>
        <p className="q2">“{claim.suggestedQuestion}”</p>
      </div>
    </div>
  );
}

function Habit({ claim, printed }: { claim: BrowserClaim; printed?: boolean }) {
  return (
    <div className="signal habit">
      <p className="body-md">
        <strong className="label-md c-primary">Thói quen cần để ý:</strong> {claim.text}
        {printed && <span className="code c-variant"> (lượt {claim.turns.join(", ")})</span>}
      </p>
      {!printed && (
        <span className="trefs">
          {claim.turns.map((value) => (
            <TurnRef key={value} turn={value} />
          ))}
        </span>
      )}
    </div>
  );
}

/** The A4 sheet (FR-29): the comments with a blank line for the learner's own question, no praise. */
function PrintSheet({ takeaway, persona, print }: Pick<Props, "takeaway" | "persona" | "print">) {
  return (
    <div className="print-sheet">
      <div className="print-top">
        <span className="logo-word">InterviewLab</span>
        <span className="code c-variant">
          {persona.displayNameCapitalized} · {print.topicTitle}
          <br />
          {print.date}
        </span>
      </div>
      <div>
        <span className="eyebrow">Mang về</span>
        <h1 className="headline-lg">{TITLE}</h1>
      </div>
      {takeaway.comments.map((claim) => (
        <div key={claim.id} className="print-blk">
          <Evidence claim={claim} persona={persona} printed />
          <Pair claim={claim} printed />
          <div className="print-fill">
            <span className="body-sm c-variant">Câu của bạn, cho đề tài của bạn: </span>
            <i />
            <i />
          </div>
        </div>
      ))}
      {takeaway.habit && (
        <div className="print-blk">
          <Habit claim={takeaway.habit} printed />
        </div>
      )}
      {takeaway.emptyLine && <p className="body-md print-blk">{EMPTY}</p>}
    </div>
  );
}

/**
 * Màn 6 item 6, "Mang về": at most three comments, the grounded praise first, and the habit card.
 * Every sentence is the learner's own words, a fixed string, or a generator claim the verifier
 * passed. "Tải về" prints this section alone, and only once the session is `done`.
 */
export function Takeaway({ takeaway, persona, canDownload, sessionId, print }: Props) {
  function download() {
    // Reported to the server, which writes the event; printing does not wait for it or depend on it.
    void fetch(`/api/sessions/${sessionId}/download`, { method: "POST", keepalive: true }).catch(() => {});
    // The browser names the saved PDF after the page title.
    const title = document.title;
    document.title = print.fileName;
    window.addEventListener("afterprint", () => (document.title = title), { once: true });
    window.print();
  }

  return (
    <section className="card-lg takeaway" aria-labelledby="takeaway-title">
      <div className="takeaway-head">
        <div>
          <span className="eyebrow">Mang về</span>
          <h2 id="takeaway-title" className="headline-lg">
            {TITLE}
          </h2>
        </div>
        <div className="takeaway-dl">
          <button type="button" className="btn btn-surface btn-md" onClick={download} disabled={!canDownload}>
            Tải về
          </button>
          {!canDownload && <span className="body-sm c-outline">Tải về sau khi luyện lại hoặc bỏ qua.</span>}
        </div>
      </div>

      {takeaway.praise && (
        <div className="praise">
          <span className="check">
            <CheckIcon size={12} />
          </span>
          <p className="body-md">
            {takeaway.praise.text}
            {takeaway.praise.quote && <span className="q2"> “{takeaway.praise.quote}”</span>}{" "}
            {takeaway.praise.turns.map((value) => (
              <TurnRef key={value} turn={value} />
            ))}
          </p>
        </div>
      )}
      {takeaway.comments.map((claim) => (
        <div key={claim.id} className="cmt" data-type={claim.type}>
          <Evidence claim={claim} persona={persona} />
          <Pair claim={claim} />
        </div>
      ))}
      {takeaway.habit && <Habit claim={takeaway.habit} />}
      {takeaway.emptyLine && <p className="body-md c-variant">{EMPTY}</p>}

      {/* Printing by the browser's own shortcut gets the same lock as the button. */}
      {canDownload && <PrintSheet takeaway={takeaway} persona={persona} print={print} />}
    </section>
  );
}
