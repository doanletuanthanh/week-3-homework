import type { ScenarioRow, SessionRow } from "@/db/repo/sessions";
import { toBrowserReveal, type BrowserReveal } from "@/engine/seal";
import { personaCard } from "@/scenario/persona-card";

export type ViewTurn = { index: number; learnerText: string | null; personaText: string };

/** The small line over a result: who, when, how long. */
export type RevealHeader = { personaName: string; date: string; turnCount: number };

type Persona = { displayName: string; displayNameCapitalized: string };

/**
 * What the session page renders, and everything it hands to a client component. Props travel to
 * the browser inside the page payload, so this is a browser payload like any API response: the
 * reveal in it comes from `toBrowserReveal`, and nothing else of the stored reveal or of the
 * scenario's items is here.
 */
export type SessionView =
  | { screen: "withdrawn"; personaName: string; turns: ViewTurn[] }
  | {
      screen: "interview";
      sessionId: string;
      persona: Persona & { researchGoal: string; itemCount: number };
      initialTurns: ViewTurn[];
      initialNotes: string;
      /** Turn 30 ended the session but the notes are not frozen yet: the screen sends the end request. */
      endedOnServer: boolean;
    }
  | { screen: "guess"; sessionId: string; personaName: string; itemCount: number }
  | { screen: "computing"; sessionId: string; guess: number; header: RevealHeader }
  | {
      screen: "reveal";
      sessionId: string;
      persona: Persona;
      header: RevealHeader;
      reveal: BrowserReveal;
      waitlisted: boolean;
      /** What the printed takeaway is headed with, and the name its PDF is saved under. */
      print: { topicTitle: string; date: string; fileName: string };
    }
  /** A state no screen exists for yet. */
  | { screen: "ended" };

const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

/** The day a session started, as the learners' calendar has it (UTC+7). */
function dayOf(date: Date): { day: string; month: string; year: string } {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: parts.day, month: parts.month, year: parts.year };
}

/**
 * The screen of a session's current state (PRD §7), from stored rows. Pure, so the props of every
 * state can be checked for sealed data without a browser.
 */
export function buildSessionView(input: {
  session: SessionRow;
  scenario: ScenarioRow;
  topicTitle: string;
  turns: ViewTurn[];
  waitlisted: boolean;
}): SessionView {
  const { session, scenario, topicTitle, waitlisted } = input;
  const card = personaCard(scenario.content);
  const persona: Persona = { displayName: card.displayName, displayNameCapitalized: card.displayNameCapitalized };
  const turns = input.turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));
  const { day, month, year } = dayOf(session.startedAt);
  const header: RevealHeader = {
    personaName: card.displayNameCapitalized,
    date: `${day}/${month}`,
    turnCount: Math.max(0, turns.length - 1),
  };
  const sessionId = session.id;

  if (session.status === "withdrawn") return { screen: "withdrawn", personaName: card.displayNameCapitalized, turns };

  if (session.status === "interviewing") {
    if (session.canvasFrozenAt !== null) return { screen: "guess", sessionId, personaName: card.displayName, itemCount: card.itemCount };
    return {
      screen: "interview",
      sessionId,
      persona: { ...persona, researchGoal: card.researchGoal, itemCount: card.itemCount },
      initialTurns: turns,
      initialNotes: session.canvasText,
      endedOnServer: session.endedAt !== null,
    };
  }

  if (session.status === "revealed" || session.status === "replaying" || session.status === "done") {
    const reveal = toBrowserReveal({ status: session.status, guess: session.guess, canvasText: session.canvasText, reveal: session.revealJson });
    if (reveal) {
      return {
        screen: "reveal",
        sessionId,
        persona,
        header,
        reveal,
        waitlisted,
        print: {
          topicTitle,
          date: `${day}/${month}/${year}`,
          fileName: `thoi-quen-hoi-${scenario.personaId}-${year}-${month}-${day}`,
        },
      };
    }
    if (session.guess !== null && session.revealReadyAt === null) return { screen: "computing", sessionId, guess: session.guess, header };
  }
  return { screen: "ended" };
}
