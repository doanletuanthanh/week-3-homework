"use client";

import { useState } from "react";
import type { BrowserReveal } from "@/engine/seal";
import { CUSTOM_LABEL, PATH_LABEL, TRUST_MISSED, fillTemplate } from "@/strings/product-strings";
import { TurnRef } from "./turn-ref";

type Item = BrowserReveal["missedItems"][number];
type Persona = { displayName: string; displayNameCapitalized: string };

/** The trust line, filled by code from the ledger: the persona was not trusting enough, and which turns cost trust. */
function TrustLine({ turns, persona }: { turns: number[]; persona: Persona }) {
  const names = { persona: persona.displayName, Persona: persona.displayNameCapitalized };
  const [before, after] = TRUST_MISSED.turns.split("{turns}");
  return (
    <p className="body-md">
      {fillTemplate(TRUST_MISSED.not_enough, names)}
      {turns.length > 0 && (
        <>
          {" "}
          {fillTemplate(before, names)}
          <span className="trefs">
            {turns.map((turn) => (
              <TurnRef key={turn} turn={turn} />
            ))}
          </span>
          {fillTemplate(after, names)}
        </>
      )}
    </p>
  );
}

function MissedItem({ item, persona, fictional }: { item: Item; persona: Persona; fictional: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" className="li ex-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ring" />
        <span className={`${open ? "label-lg" : "body-md"} li-text`}>{item.content}</span>
        {fictional && <span className="pill pill-outline fict">{CUSTOM_LABEL.fictional}</span>}
        <span className="pill pill-neutral">{PATH_LABEL[item.path]}</span>
      </button>
      {open && (
        <div className="exp">
          <div className="ctx">
            <span className="ctx-k">Câu hỏi mẫu</span>
            <p className="q">“{item.sampleQuestion}”</p>
          </div>
          {item.path === "trust" && <TrustLine turns={item.trustTurns} persona={persona} />}
          {item.hook && (
            <>
              <div className="msg">
                <div className="msg-meta">
                  <span className="who who-p">
                    <i />
                    {persona.displayNameCapitalized}
                  </span>
                  <TurnRef turn={item.hook.turn} />
                </div>
                <div className="bubble-p">{item.hook.personaText}</div>
              </div>
              {item.hook.next && (
                <div className="msg">
                  <div className="msg-meta">
                    <span className="who who-me">
                      <i />
                      Bạn hỏi ngay sau
                    </span>
                    <TurnRef turn={item.hook.next.turn} />
                  </div>
                  <div className="bubble-me">{item.hook.next.learnerText}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Màn 6 item 4: what the persona did not tell, with how each could have been opened. The item
 * held for the replay is not in this list.
 */
export function MissedList({ items, persona, fictional = false }: { items: Item[]; persona: Persona; fictional?: boolean }) {
  return (
    <section className="card reveal-list" aria-labelledby="missed-title">
      <div className="sec-h">
        <h2 id="missed-title" className="headline-sm">
          Bỏ lỡ
        </h2>
        <span className="pill pill-amber">{items.length}</span>
      </div>
      <ul>
        {items.map((item) => (
          <MissedItem key={item.content} item={item} persona={persona} fictional={fictional} />
        ))}
      </ul>
    </section>
  );
}
