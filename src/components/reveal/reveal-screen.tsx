"use client";

import { useState } from "react";
import type { ReplayOutcome } from "@/engine/replay-result";
import type { BrowserReveal } from "@/engine/seal";
import { ReportProblem } from "@/components/custom/report-problem";
import type { RevealHeader } from "@/server/session-view";
import { MissedList } from "./missed-list";
import { NextStep } from "./next-step";
import { NotesReview } from "./notes-review";
import { ReplayOffer } from "./replay-offer";
import { ReplayResultCard } from "./replay-result-card";
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
  /** How the replay ended. Set for a `done` session that had a replay moment, and never before. */
  replay: { outcome: ReplayOutcome; turnCount: number } | null;
  /** Set for a generated scenario: every item is labelled as fiction and the learner can report the scenario. */
  custom?: { reported: boolean } | null;
};

/**
 * Màn 6 once the result is ready, in its fixed order: the two numbers, the replay offer, what
 * was told, what was missed, the notes, the takeaway, the next step. It renders stored data and
 * calls no model. While the replay is ahead (`offer`) the server has left its target out; when
 * the session is `done` nothing is held, the replay's result stands where the offer stood, and
 * the takeaway can be downloaded.
 */
export function RevealScreen({ sessionId, persona, header, reveal, waitlisted, print, replay, custom = null }: Props) {
  const [openTurn, setOpenTurn] = useState<number | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const done = reveal.mode === "done";
  const replayed = done && reveal.replay.level !== "none" ? reveal.replay : null;
  const opened = replay?.outcome.level === "primary" && replay.outcome.result === "success";

  return (
    <OpenTurnContext value={setOpenTurn}>
      <main className="reveal" data-mode={reveal.mode}>
        <div className="reveal-col">
          <TwoNumbers header={header} reveal={reveal} heldLabel={!done ? "Giữ lại" : opened ? "Mở khi luyện lại" : "Đã mở niêm phong"} heldOpen={done} />
          {replayed === null ? (
            <ReplayOffer sessionId={sessionId} replay={reveal.replay} personaName={persona.displayName} />
          ) : (
            replay && (
              <ReplayResultCard
                outcome={replay.outcome}
                persona={persona}
                returnTurn={replayed.returnTurn}
                turnCount={replay.turnCount}
                onOpenReplay={() => setReplayOpen(true)}
              />
            )
          )}
          <ToldList items={reveal.toldItems} fictional={custom !== null} />
          <MissedList items={reveal.missedItems} persona={persona} fictional={custom !== null} />
          {reveal.notes !== null && <NotesReview notes={reveal.notes} ungraded={reveal.recognized.state === "ungraded"} persona={persona} />}
          <Takeaway takeaway={reveal.takeaway} persona={persona} canDownload={done} sessionId={sessionId} print={print} />
          {custom && <ReportProblem sessionId={sessionId} reported={custom.reported} />}
          <NextStep waitlisted={waitlisted} />
        </div>
      </main>
      <TranscriptDrawer sessionId={sessionId} personaName={persona.displayNameCapitalized} turn={openTurn} onClose={() => setOpenTurn(null)} />
      {/* The replay's own turns, in a drawer of their own: they are not part of the main transcript. */}
      {replayed && replay && replay.turnCount > 0 && (
        <TranscriptDrawer
          sessionId={sessionId}
          personaName={persona.displayNameCapitalized}
          branch="replay"
          turn={replayOpen ? replayed.returnTurn : null}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </OpenTurnContext>
  );
}
