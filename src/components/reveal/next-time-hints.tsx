"use client";

import { useId, useState } from "react";
import type { BrowserHint } from "@/engine/seal";
import { CUSTOM_LABEL, HINTS, PATH_LABEL, PATH_TIP, TRUST_MISSED, fillTemplate } from "@/strings/product-strings";
import { TurnRef } from "./turn-ref";

type Persona = { displayName: string; displayNameCapitalized: string };

/** The questions that made the persona more guarded, filled by code from the ledger. */
function TrustTurns({ turns, persona }: { turns: number[]; persona: Persona }) {
  const names = { persona: persona.displayName, Persona: persona.displayNameCapitalized };
  const [before, after] = TRUST_MISSED.turns.split("{turns}");
  return (
    <p className="body-md">
      {fillTemplate(before, names)}
      <span className="trefs">
        {turns.map((turn) => (
          <TurnRef key={turn} turn={turn} />
        ))}
      </span>
      {fillTemplate(after, names)}
    </p>
  );
}

/**
 * One item the persona did not tell, as a hint: the topic to ask about, its path and how that is
 * asked, the moment the persona hinted at it, and, only once asked for, a question that would have
 * opened it. Never the item itself. Persona and learner words are rendered as text nodes.
 */
export function HintBody({ hint, persona, fictional = false }: { hint: BrowserHint; persona: Persona; fictional?: boolean }) {
  const [asked, setAsked] = useState(false);
  // Every hint has the same button: its topic tells a screen reader which one this is.
  const topicId = useId();
  const names = { persona: persona.displayName, Persona: persona.displayNameCapitalized };
  return (
    <div className="hint-body">
      <div className="hint-top">
        <p id={topicId} className="label-lg hint-topic">
          {fillTemplate(HINTS.ask_about, { topic: hint.topic })}
        </p>
        {fictional && <span className="pill pill-outline fict">{CUSTOM_LABEL.fictional}</span>}
        <span className="pill pill-neutral">{PATH_LABEL[hint.path]}</span>
      </div>
      <p className="body-md c-variant">{fillTemplate(PATH_TIP[hint.path], names)}</p>
      {hint.hook && (
        <>
          <div className="msg">
            <div className="msg-meta">
              <span className="who who-p">
                <i />
                {fillTemplate(HINTS.hinted, names)}
              </span>
              <TurnRef turn={hint.hook.turn} />
            </div>
            <div className="bubble-p">{hint.hook.personaText}</div>
          </div>
          {hint.hook.next && (
            <div className="msg">
              <div className="msg-meta">
                <span className="who who-me">
                  <i />
                  {HINTS.asked_next}
                </span>
                <TurnRef turn={hint.hook.next.turn} />
              </div>
              <div className="bubble-me">{hint.hook.next.learnerText}</div>
            </div>
          )}
        </>
      )}
      {hint.trustTurns.length > 0 && <TrustTurns turns={hint.trustTurns} persona={persona} />}
      <div className="hint-ask">
        <button type="button" className="btn btn-tonal btn-sm" aria-expanded={asked} aria-describedby={topicId} onClick={() => setAsked(!asked)}>
          {HINTS.show_question}
        </button>
        {asked && (
          <div className="ctx">
            <p className="q">“{hint.sampleQuestion}”</p>
          </div>
        )}
      </div>
    </div>
  );
}

type Props = {
  hints: BrowserHint[];
  /** Every missed item, the hinted ones included: the rest are counted in one line. */
  missed: number;
  persona: Persona;
  /** A generated scenario: each hint is labelled as fiction. */
  fictional?: boolean;
};

/**
 * Màn 6: up to three items the persona did not tell, the heaviest first, as hints for playing the
 * persona again, and one line for the rest. Not shown when nothing is left untold.
 */
export function NextTimeHints({ hints, missed, persona, fictional = false }: Props) {
  if (hints.length === 0) return null;
  const more = missed - hints.length;
  return (
    <section className="card reveal-list hints" aria-labelledby="hints-title">
      <div className="sec-h">
        <h2 id="hints-title" className="headline-sm">
          {HINTS.title}
        </h2>
      </div>
      <ul>
        {hints.map((hint) => (
          <li key={hint.topic}>
            <HintBody hint={hint} persona={persona} fictional={fictional} />
          </li>
        ))}
      </ul>
      {more > 0 && <p className="body-md c-variant hints-more">{fillTemplate(HINTS.more, { count: more, persona: persona.displayName })}</p>}
    </section>
  );
}
