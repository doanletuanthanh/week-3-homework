import type { LoadedReplay } from "@/db/repo/replay";
import type { ScenarioRow, SessionRow } from "@/db/repo/sessions";
import type { ReplayLevel, ReplayOutcome } from "@/engine/replay-result";
import { toBrowserReveal, type BrowserReveal } from "@/engine/seal";
import { personaCard } from "@/scenario/persona-card";
import { replayOutcomeOf } from "./replay-outcome";

export type ViewTurn = { index: number; learnerText: string | null; personaText: string };

/** A replay turn on its screen. `unchecked`: the judge failed, so the turn counts with nothing told. */
export type ReplayViewTurn = ViewTurn & { unchecked: boolean };

/** The small line over a result: who, when, how long. */
export type RevealHeader = { personaName: string; date: string; turnCount: number };

type Persona = { displayName: string; displayNameCapitalized: string };

/**
 * What the session page renders, and everything it hands to a client component. Props travel to
 * the browser inside the page payload, so this is a browser payload like any API response: the
 * reveal in it comes from `toBrowserReveal`, and nothing else of the stored reveal or of the
 * scenario's items is here.
 */
export type SessionView = { /** A generated scenario plays: every screen carries the custom-topic labels. */ custom: boolean } & (
  | {
      screen: "withdrawn";
      personaName: string;
      topicTitle: string;
      /** The day the session started, as "dd/mm". */
      date: string;
      /** The learner turn the session stopped at. */
      turnCount: number;
      turns: ViewTurn[];
    }
  | {
      screen: "interview";
      sessionId: string;
      persona: Persona & { avatarKey: string | null; researchGoal: string; itemCount: number };
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
      /** How the replay ended, with how many questions it had. Set for a `done` session that had a replay moment. */
      replay: { outcome: ReplayOutcome; turnCount: number } | null;
      /** "Kịch bản này có vấn đề" was pressed already. Read for a custom session only. */
      problemReported: boolean;
    }
  | {
      screen: "replay";
      sessionId: string;
      persona: Persona;
      /** The day the session started, as "dd/mm". */
      date: string;
      level: ReplayLevel;
      forkAfterTurn: number;
      /** The last two turns before the fork, ending on what the persona said there. */
      contextTurns: ViewTurn[];
      replayTurns: ReplayViewTurn[];
    }
  /** A state no screen exists for yet. */
  | { screen: "ended" }
);

/**
 * PRD §7: a session nobody has asked a question in opens on Màn 3, with "Tiếp tục buổi luyện"
 * leading into the interview. `entered` is that button (or "Bắt đầu") having been pressed in this
 * browser. Once a question exists, or the session ended, its own state decides the screen.
 */
export function opensOnPrep(session: Pick<SessionRow, "status" | "endedAt">, learnerTurns: number, entered: boolean): boolean {
  return session.status === "interviewing" && session.endedAt === null && learnerTurns === 0 && !entered;
}

const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

/** The day a session started, as the learners' calendar has it (UTC+7). */
export function dayOf(date: Date): { day: string; month: string; year: string } {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: parts.day, month: parts.month, year: parts.year };
}

const clockParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The time of day on the learners' clock (UTC+7), as "hh:mm". */
export function clockOf(date: Date): string {
  return clockParts.format(date);
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
  /** The session's replay branch with its turns, when it has one. */
  replay?: LoadedReplay | null;
}): SessionView {
  const { session, scenario, topicTitle, waitlisted } = input;
  const replay = input.replay ?? null;
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
  const custom = scenario.origin === "generated";

  if (session.status === "withdrawn") {
    return { custom, screen: "withdrawn", personaName: card.displayNameCapitalized, topicTitle, date: header.date, turnCount: header.turnCount, turns };
  }

  if (session.status === "interviewing") {
    if (session.canvasFrozenAt !== null) return { custom, screen: "guess", sessionId, personaName: card.displayName, itemCount: card.itemCount };
    return {
      custom,
      screen: "interview",
      sessionId,
      persona: { ...persona, avatarKey: scenario.avatarKey, researchGoal: card.researchGoal, itemCount: card.itemCount },
      initialTurns: turns,
      initialNotes: session.canvasText,
      endedOnServer: session.endedAt !== null,
    };
  }

  // Màn 7 shows the two speakers' words up to the fork and on the branch, and nothing of the result.
  if (session.status === "replaying" && replay && replay.branch.result === null && replay.branch.fallbackLevel !== null && replay.branch.forkAfterTurn !== null) {
    const forkAfterTurn = replay.branch.forkAfterTurn;
    return {
      custom,
      screen: "replay",
      sessionId,
      persona,
      date: header.date,
      level: replay.branch.fallbackLevel,
      forkAfterTurn,
      contextTurns: turns.filter((turn) => turn.index <= forkAfterTurn).slice(-2),
      replayTurns: replay.turns.map((turn) => ({
        index: turn.index,
        learnerText: turn.learnerText,
        personaText: turn.personaText,
        unchecked: turn.verdictJson === null,
      })),
    };
  }

  if (session.status === "revealed" || session.status === "replaying" || session.status === "done") {
    // What the replay held is in its outcome, so the outcome exists for a `done` session only.
    const outcome = session.status === "done" && replay ? replayOutcomeOf(scenario.content, replay) : null;
    const reveal = toBrowserReveal({
      status: session.status,
      guess: session.guess,
      canvasText: session.canvasText,
      reveal: session.revealJson,
      replaySucceeded: outcome?.level === "primary" && outcome.result === "success",
    });
    if (reveal) {
      return {
        custom,
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
        replay: outcome && replay ? { outcome, turnCount: replay.turns.length } : null,
        problemReported: session.problemReportedAt !== null,
      };
    }
    if (session.guess !== null && session.revealReadyAt === null) return { custom, screen: "computing", sessionId, guess: session.guess, header };
  }
  return { custom, screen: "ended" };
}
