import { and, asc, eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { branches, events, llmCalls, sessions, snapshots, turns } from "@/db/schema";
import type { RawAnalysis, Verdict } from "@/engine/types";
import { recordCallToDb } from "@/llm/call-model";
import type { AppUser } from "@/server/auth";
import { runReplayTurn, type RunReplayTurnOptions } from "@/server/replay";
import { runReveal, submitGuess } from "@/server/reveal";
import { NO_VERDICT, a, rawAnalysis } from "./engine-fixtures";
import { roleModels } from "./eval-models";
import { NOTES } from "./reveal-fixtures";
import type { ScriptedStep } from "./scripted-model";
import { LEADING_ONLY, PLAYED, agreeAll, endedSession, judgeStep, revealModels, revealScript, type ScriptedTurn } from "./session-fixtures";

/** The replay moment of `PLAYED`: `paid-app`, whose hook was dropped at turn 2 and ignored at turn 3. */
export const TARGET_ID = "paid-app";
export const PRIMARY_FORK = 2;

/** A replay question that picks up the target's hook: a good label resting on the turn that dropped it. */
export const PICK_UP: Partial<RawAnalysis> = { hook_id: a("hook", TARGET_ID), label: "confirm_grounded", grounded_turn_id: PRIMARY_FORK };

export const LEADING_QUESTION = "Chắc tại chị lười nên mới bỏ đúng không ạ?";
/** Call 1 finding `LEADING_QUESTION` leading: the words "tại chị lười". */
export const LEADING: Partial<RawAnalysis> = { label: "leading", introduced_span: [1, 3] };

/** What the replay judge answers: a verdict, and (read on a leading-question replay only) its label for the question. */
export const judged = (verdict: Verdict = NO_VERDICT, label: string = "open", span: number[] | null = null): ScriptedStep => ({
  structured: { prev_turn_verdict: verdict, label, introduced_span: span },
});
export const toldItems = (...itemIds: string[]): Verdict => ({ hook_dropped: false, disclosed_item_ids: itemIds.map((id) => a("item", id)), violations: [] });
export const failingJudge = (): ScriptedStep[] => Array.from({ length: 3 }, () => ({ error: new Error("judge down") }));

/** The reveal replies of a session whose only fault is leading questions (`LEADING_ONLY`), with one comment about turn 1. */
export const FALLBACK_NOTES = "ghi vội vài dòng";
export const FALLBACK_CLAIM = "NHẬN XÉT TRÍCH LƯỢT L.";
export const fallbackRevealScript = () => ({
  END_JUDGE: [judgeStep(FALLBACK_NOTES, [])],
  FEEDBACK: [
    {
      structured: {
        claims: [{ slot: "S1", text: FALLBACK_CLAIM, cited_turns: [1, 3], item_id: null, canvas_range: null, suggested_question: "Chị ghi thế nào ạ?" }],
      },
    } satisfies ScriptedStep,
  ],
  VERIFIER: [agreeAll()],
});

/** A learner whose session was played, ended, revealed and guessed: the replay is on offer (or, with no moment, the session is done). */
export async function revealedSession(
  script: ScriptedTurn[] = PLAYED,
  notes: string = NOTES,
  reveal: Parameters<typeof revealModels>[0] = revealScript(),
  email = "linh@example.com",
) {
  const { learner, sessionId } = await endedSession(email, script, notes);
  const outcome = await runReveal(getDb(), sessionId, { llmDeps: revealModels(reveal).llmDeps });
  if (outcome !== "finalised") throw new Error(`reveal was not finalised: ${outcome}`);
  const guessed = await submitGuess(getDb(), learner, sessionId, { guess: 4 });
  if (!guessed.ok) throw new Error(`guess was refused: ${guessed.error}`);
  return { learner, sessionId };
}

export const fallbackSession = (email?: string) => revealedSession(LEADING_ONLY, FALLBACK_NOTES, fallbackRevealScript(), email);

export type ReplayStep = {
  question?: string;
  analysis?: Partial<RawAnalysis>;
  persona?: string;
  /** The judge's attempts, in order; one neutral answer when left out. */
  judge?: ScriptedStep[];
  turnKey?: string;
  /** Steps for Call 1 and Call 2 when a test needs more than one attempt of them. */
  analysisSteps?: ScriptedStep[];
  personaSteps?: ScriptedStep[];
};

/** Sends replay question `turn` (1 to 3) through the real service, with scripted providers that write `llm_call` rows. */
export async function replayTurn(learner: AppUser, sessionId: string, turn: number, step: ReplayStep = {}, options: Partial<RunReplayTurnOptions> = {}) {
  const models = roleModels({
    ANALYSIS: step.analysisSteps ?? [{ structured: rawAnalysis(step.analysis) }],
    PERSONA: step.personaSteps ?? [{ text: step.persona ?? `Câu trả lời luyện lại ${turn}.` }],
    REPLAY_JUDGE: step.judge ?? [judged()],
  });
  const result = await runReplayTurn(
    getDb(),
    learner,
    sessionId,
    { text: step.question ?? `Câu hỏi luyện lại ${turn} của em ạ?`, expectedIndex: turn, turnKey: step.turnKey ?? randomUUID() },
    { llmDeps: { ...models.llmDeps, recordCall: recordCallToDb }, ...options },
  );
  return { result, models };
}

export const branchRows = (sessionId: string) => getDb().select().from(branches).where(eq(branches.sessionId, sessionId));
export const replayBranch = async (sessionId: string) => (await branchRows(sessionId)).find((branch) => branch.kind === "replay");
export const mainBranch = async (sessionId: string) => (await branchRows(sessionId)).find((branch) => branch.kind === "main")!;
export const branchTurns = (branchId: string) => getDb().select().from(turns).where(eq(turns.branchId, branchId)).orderBy(asc(turns.index));
export const branchSnapshots = (branchId: string) => getDb().select().from(snapshots).where(eq(snapshots.branchId, branchId)).orderBy(asc(snapshots.index));
export const eventNames = async (sessionId: string) =>
  (await getDb().select().from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.at))).map((event) => event.name);

/** Model attempts made for replay turns, in the order they were made. */
export const replayCalls = (sessionId: string) =>
  getDb()
    .select()
    .from(llmCalls)
    .where(and(eq(llmCalls.sessionId, sessionId), isNotNull(llmCalls.branchId)))
    .orderBy(asc(llmCalls.createdAt));

/**
 * Everything of the main interview a replay must leave alone: the session row (its notes, guess
 * and stored reveal) without the status flag and its timestamp, the main branch, its turns with
 * their verdicts, and its snapshots. Serialised, so two readings can be compared byte for byte.
 */
export async function mainData(sessionId: string): Promise<string> {
  const [session] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId));
  const kept = Object.fromEntries(Object.entries(session).filter(([column]) => column !== "status" && column !== "updatedAt"));
  const main = await mainBranch(sessionId);
  return JSON.stringify({ session: kept, branch: main, turns: await branchTurns(main.id), snapshots: await branchSnapshots(main.id) });
}
