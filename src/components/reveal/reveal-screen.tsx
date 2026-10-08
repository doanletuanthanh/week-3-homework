"use client";

import { useState } from "react";
import type { BrowserReveal } from "@/engine/seal";
import type { RevealHeader } from "@/server/session-view";
import { MissedList } from "./missed-list";
import { NextStep } from "./next-step";
import { NotesReview } from "./notes-review";
import { ReplayOffer } from "./replay-offer";
import { Takeaway } from "./takeaway";
import { ToldList } from "./told-list";
import { TranscriptDrawer } from "./transcript-drawer";
import { OpenTurnContext } from "./turn-ref";
import { TwoNumbers } from "./two-numbers";

type Props = {
  sessionId: string;
  persona: { displayName: string; displayNameCapitalized: string };
  header: RevealHeader;
  /** Built by the server's seal: whatever is held back for the replay is not in it. */
  reveal: BrowserReveal;
  waitlisted: boolean;
  print: { topicTitle: string; date: string; fileName: string };
};

/**
 * Màn 6 once the result is ready, in its fixed order: the two numbers, the replay offer, what
 * was told, what was missed, the notes, the takeaway, the next step. It renders stored data and
 * calls no model. While the replay is ahead (`offer`) the server has left its target out; when
 * the session is `done` nothing is held and the takeaway can be downloaded.
 */
export function RevealScreen({ sessionId, persona, header, reveal, waitlisted, print }: Props) {
  const [openTurn, setOpenTurn] = useState<number | null>(null);
  const done = reveal.mode === "done";

  return (
    <OpenTurnContext value={setOpenTurn}>
      <main className="reveal" data-mode={reveal.mode}>
        <div className="reveal-col">
          <TwoNumbers header={header} reveal={reveal} />
          {/* A finished replay shows its result card in place of the offer; that card comes with the replay. */}
          {(!done || reveal.replay.level === "none") && <ReplayOffer replay={reveal.replay} personaName={persona.displayName} />}
          <ToldList items={reveal.toldItems} />
          <MissedList items={reveal.missedItems} persona={persona} />
          {reveal.notes !== null && <NotesReview notes={reveal.notes} ungraded={reveal.recognized.state === "ungraded"} persona={persona} />}
          <Takeaway takeaway={reveal.takeaway} persona={persona} canDownload={done} print={print} />
          <NextStep waitlisted={waitlisted} />
        </div>
      </main>
      <TranscriptDrawer sessionId={sessionId} personaName={persona.displayNameCapitalized} turn={openTurn} onClose={() => setOpenTurn(null)} />
    </OpenTurnContext>
  );
}
