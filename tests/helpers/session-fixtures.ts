import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { events, llmCalls, sessions, turns } from "@/db/schema";
import type { RawAnalysis, Verdict } from "@/engine/types";
import { recordCallToDb } from "@/llm/call-model";
import type { AppUser } from "@/server/auth";
import { endSession } from "@/server/canvas";
import { runTurn } from "@/server/turns";
import { DROPPED, NO_VERDICT, a, rawAnalysis, told } from "./engine-fixtures";
import { roleModels } from "./eval-models";
import { NOTES, QUESTIONS, rangeOf } from "./reveal-fixtures";
import { scriptedModel, type ScriptedStep } from "./scripted-model";
import { createLearner, startSession } from "./test-db";

export type ScriptedTurn = { analysis?: Partial<RawAnalysis>; question?: string; persona?: string };

const DEFAULT_QUESTION = "Chị kể thêm cho em nghe được không ạ?";

/** Plays learner turns through the real turn engine, with a scripted provider. */
export async function playTurns(learner: AppUser, sessionId: string, script: ScriptedTurn[]): Promise<void> {
  for (const [position, turn] of script.entries()) {
    const { model } = scriptedModel([{ structured: rawAnalysis(turn.analysis) }, { text: turn.persona ?? `Câu trả lời ở lượt ${position + 1}.` }]);
    const result = await runTurn(
      getDb(),
      learner,
      sessionId,
      { text: turn.question ?? DEFAULT_QUESTION, expectedIndex: position + 1, turnKey: randomUUID() },
      { llmDeps: { roleSpec: () => ({ provider: "openai", model: "gpt-6-luna", effort: "low" }), createModel: () => model } },
    );
    if (!result.ok) throw new Error(`turn ${position + 1} failed: ${result.error}`);
  }
}

/**
 * The six turns of `playedSession` in `reveal-fixtures`: two items told, the hooks of `paid-app`
 * and `shame` ignored, a leading question at turn 4, two questions about the future. The replay
 * moment is `paid-app`, whose hook was dropped at turn 2.
 */
export const PLAYED: ScriptedTurn[] = [
  { analysis: { topic_tags: [a("tag", "money-home")], question_type: "open" } },
  { analysis: { prev_turn_verdict: told("money-home"), topic_tags: [a("tag", "paid-app")] } },
  { analysis: { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "last-attempt")], question_type: "past_specific", label: "confirm_grounded", grounded_turn_id: 2 } },
  { analysis: { prev_turn_verdict: told("last-attempt"), label: "leading", introduced_span: [1, 3] } },
  { analysis: { question_type: "hypothetical_future" } },
  { analysis: { question_type: "hypothetical_future" } },
].map((turn, position) => ({ ...turn, question: QUESTIONS[(position + 1) as keyof typeof QUESTIONS] }) as ScriptedTurn);

/** A session with no ignored hook and no leading question: it has no replay moment. */
export const NO_REPLAY: ScriptedTurn[] = [{ analysis: { topic_tags: [a("tag", "money-home")] } }, { analysis: { prev_turn_verdict: told("money-home") } }];

/** A session whose only fault is a leading question at turn 1: fallback 1. */
export const LEADING_ONLY: ScriptedTurn[] = [{ analysis: { label: "leading", introduced_span: [0, 1] } }, {}, { analysis: { label: "leading", introduced_span: [2, 3] } }];

/** A learner with a session that was played and ended with these notes. */
export async function endedSession(email: string, script: ScriptedTurn[] = PLAYED, notes: string = NOTES) {
  const learner = await createLearner(email);
  const sessionId = (await startSession(learner)).id;
  await playTurns(learner, sessionId, script);
  const ended = await endSession(getDb(), learner, sessionId, { canvasText: notes });
  if (!ended.ok) throw new Error(`end failed: ${ended.error}`);
  return { learner, sessionId };
}

/** Scripted reveal models that write `llm_call` rows to the database, as production does. */
export function revealModels(script: Parameters<typeof roleModels>[0]) {
  const models = roleModels(script);
  return { ...models, llmDeps: { ...models.llmDeps, recordCall: recordCallToDb } };
}

/** The end judge finding these phrases of the notes to be these items. */
export const judgeStep = (notes: string = NOTES, noted: [phrase: string, itemId: string][] = NOTED, verdict: Verdict = NO_VERDICT): ScriptedStep => ({
  structured: {
    last_turn_verdict: verdict,
    canvas_matches: noted.map(([phrase, itemId]) => ({ range: rangeOf(notes, phrase), kind: "item", item_id: a("item", itemId), reason: "lý do nội bộ của judge" })),
  },
});

/** What `NOTES` holds: a told item, the replay target, an item that never showed. */
export const NOTED: [string, string][] = [
  ["mỗi tháng gửi ba mẹ 3 triệu", "money-home"],
  ["đang trả phí cho một app mà không dùng?", "paid-app"],
  ["chắc có nợ thẻ tín dụng", "installment"],
];

/** One claim per slot of `PLAYED`: S1 praise [3], S2 future [5, 6], S3 leading [4], S4 habit [3, 4]. */
export const generatorStep = (): ScriptedStep => ({
  structured: {
    claims: [
      { slot: "S1", text: "Bạn bám vào lời chị Thu vừa nói.", cited_turns: [3], item_id: null, canvas_range: null, suggested_question: null },
      { slot: "S2", text: "Bạn hỏi về điều sẽ làm.", cited_turns: [5, 6], item_id: null, canvas_range: null, suggested_question: "Lần gần nhất chị định ghi lại là khi nào ạ?" },
      { slot: "S3", text: "Bạn tự thêm một nguyên nhân.", cited_turns: [4], item_id: null, canvas_range: null, suggested_question: "Vì sao chị dừng ghi ạ?" },
      { slot: "S4", text: "Câu ngay sau thường hỏi sang chuyện khác.", cited_turns: [3, 4], item_id: null, canvas_range: null, suggested_question: null },
    ],
  },
});

export const noClaims = (): ScriptedStep => ({ structured: { claims: [] } });

/** A verifier that agrees with every check it could have been given. */
export const agreeAll = (): ScriptedStep => ({
  structured: { claims: Array.from({ length: 60 }, (_, index) => ({ claim_id: `V${index + 1}`, verdict: "agree", reason: "đúng", label: null })) },
});

/** The three reveal replies of `PLAYED` with `NOTES`, all successful. */
export const revealScript = () => ({ END_JUDGE: [judgeStep()], FEEDBACK: [generatorStep()], VERIFIER: [agreeAll()] });

export const failing = (): ScriptedStep[] => Array.from({ length: 3 }, () => ({ error: new Error("provider down") }));

export const sessionRow = async (sessionId: string) => (await getDb().select().from(sessions).where(eq(sessions.id, sessionId)))[0];
export const turnRows = (sessionId: string) => getDb().select().from(turns).where(eq(turns.sessionId, sessionId)).orderBy(asc(turns.index));
export const eventRows = (sessionId: string, name: string) =>
  getDb()
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .then((rows) => rows.filter((row) => row.name === name));
/** Model attempts of the reveal, in the order they were made. */
export const revealCalls = async (sessionId: string) =>
  (await getDb().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId)).orderBy(asc(llmCalls.createdAt))).filter((row) =>
    ["END_JUDGE", "FEEDBACK", "VERIFIER"].includes(row.role),
  );
