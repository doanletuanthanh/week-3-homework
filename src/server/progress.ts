import type { RevealJson } from "@/engine/reveal-types";
import type { Label, QuestionType } from "@/engine/types";

/** Sessions the trend covers: the newest ones with a result. */
export const PROGRESS_SESSIONS = 10;

/** One finished session as stored: its reveal, the guess, and the checked label of each main-branch question. */
export type ProgressSource = {
  sessionId: string;
  personaName: string;
  revealedAt: Date;
  guess: number;
  reveal: Pick<RevealJson, "counts" | "items" | "canvasEmpty">;
  /** In turn order. Null for a turn written before the engine stored its analysis. */
  questions: ({ label: Label; question_type: QuestionType } | null)[];
};

/** The habits the reveal comments on (its comment types `leading`, `hypothetical_future`, `heard_not_followed`), named for the learner. */
export const HABITS = {
  leading: "Câu hỏi dẫn dắt",
  hypothetical_future: "Hỏi về tương lai giả định",
  heard_not_followed: "Nghe được, nhưng chưa hỏi tiếp",
} as const;
export type Habit = keyof typeof HABITS;

/** Shares from 0 to 1. Null where the session gives nothing to measure. */
export type SessionProgress = {
  sessionId: string;
  personaName: string;
  revealedAt: Date;
  questions: number;
  /** Questions built on what the persona said (`confirm_grounded`, `boundary_probe`). */
  grounded: number | null;
  /** KHAI THÁC: items told, of all items. */
  told: number;
  /** NHẬN BIẾT: items the notes caught, of all items. Null when the notes were not judged or empty. */
  recognized: number | null;
  /** 1 for a guess equal to what was told, 0 for one as far off as the whole scenario. */
  guessAccuracy: number;
  habits: Record<Habit, number | null>;
};

export type Progress = {
  /** Oldest first, so a trend reads left to right. */
  sessions: SessionProgress[];
  /** The habit with the highest average rate; null when none showed. */
  weakest: { habit: Habit; name: string; rate: number } | null;
};

const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** What one session shows of each habit and score. Pure: computed from stored data only, no model call. */
export function sessionProgress(source: ProgressSource): SessionProgress {
  const judged = source.questions.filter((question) => question !== null);
  const count = (test: (question: (typeof judged)[number]) => boolean) => shareOf(judged.filter(test).length, judged.length);
  const { told, total, recognizedFull } = source.reveal.counts;
  const hooked = source.reveal.items.filter((item) => item.hook !== null);
  return {
    sessionId: source.sessionId,
    personaName: source.personaName,
    revealedAt: source.revealedAt,
    questions: source.questions.length,
    grounded: count((question) => question.label === "confirm_grounded" || question.label === "boundary_probe"),
    told: total > 0 ? told / total : 0,
    // Empty notes are never a zero (FR-49).
    recognized: recognizedFull === null || source.reveal.canvasEmpty ? null : shareOf(recognizedFull, total),
    guessAccuracy: total > 0 ? 1 - Math.min(1, Math.abs(source.guess - told) / total) : 0,
    habits: {
      leading: count((question) => question.label === "leading"),
      hypothetical_future: count((question) => question.question_type === "hypothetical_future"),
      heard_not_followed: shareOf(hooked.filter((item) => item.state !== "told").length, hooked.length),
    },
  };
}

/** The trend over the newest sessions (given newest first) and the habit to work on. */
export function progressOf(newestFirst: ProgressSource[]): Progress {
  const sessions = newestFirst.slice(0, PROGRESS_SESSIONS).map(sessionProgress).reverse();
  const averages = (Object.keys(HABITS) as Habit[]).flatMap((habit) => {
    const rates = sessions.map((session) => session.habits[habit]).filter((rate) => rate !== null);
    return rates.length > 0 ? [{ habit, rate: rates.reduce((sum, rate) => sum + rate, 0) / rates.length }] : [];
  });
  // Ties go to the habit listed first.
  const top = averages.reduce<(typeof averages)[number] | null>((best, entry) => (best === null || entry.rate > best.rate ? entry : best), null);
  return { sessions, weakest: top && top.rate > 0 ? { habit: top.habit, name: HABITS[top.habit], rate: top.rate } : null };
}
