import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { events, generationAttempts, llmCalls, scenarios, sessions, topics, users } from "@/db/schema";
import { recordCallToDb } from "@/llm/call-model";
import type { AppUser } from "@/server/auth";
import { submitCustomTopic } from "@/server/custom-topic";
import { runGeneration } from "@/server/generation";
import { generatedFrom, pipelineModels, type PipelineScript } from "./custom-fixtures";

export const TOPIC = "app hẹn hò trong khu dân cư đang sống";

const db = () => getDb();

/** A reply `validate` refuses on every try, so an attempt fails as `invalid`. */
export const INVALID: PipelineScript = { generated: [{ ...generatedFrom(), items: generatedFrom().items.slice(0, 3) }] };

/** The pipeline's replies, with every call written to `llm_call` as production writes it. */
export const dbModels = (script: PipelineScript = {}) => pipelineModels(script, { recordCall: recordCallToDb });

export async function submit(learner: AppUser, script: PipelineScript = {}, body: Record<string, unknown> = {}, requestStartedAt?: number) {
  const models = dbModels(script);
  const result = await submitCustomTopic(db(), learner, { topic: TOPIC, ...body }, { llmDeps: models.llmDeps, requestStartedAt });
  return { result, models };
}

/** Submits a topic and runs its attempt to the end. Fails the test when the submit was not accepted. */
export async function attempt(learner: AppUser, script: PipelineScript = {}, body: Record<string, unknown> = {}) {
  const { result } = await submit(learner, script, body);
  if (!result.ok) throw new Error(`submit was not accepted: ${JSON.stringify(result)}`);
  const models = dbModels(script);
  const outcome = await runGeneration(db(), result.attemptId, { llmDeps: models.llmDeps });
  return { ...result, outcome, models };
}

export const attemptRow = async (attemptId: string) => (await db().select().from(generationAttempts).where(eq(generationAttempts.id, attemptId)))[0];
export const attemptsOf = (userId: string) => db().select().from(generationAttempts).where(eq(generationAttempts.userId, userId)).orderBy(desc(generationAttempts.createdAt));
export const sessionsOf = (userId: string) => db().select().from(sessions).where(eq(sessions.userId, userId));
export const userRow = async (userId: string) => (await db().select().from(users).where(eq(users.id, userId)))[0];
export const customTopics = () => db().select().from(topics).where(eq(topics.kind, "custom"));
export const generatedScenarios = () => db().select().from(scenarios).where(eq(scenarios.origin, "generated"));
export const eventNames = async (sessionId: string) => (await db().select().from(events).where(eq(events.sessionId, sessionId)).orderBy(events.at)).map((row) => row.name);
export const generationCalls = (attemptId: string) => db().select().from(llmCalls).where(eq(llmCalls.attemptId, attemptId));

/** Moves every attempt of the learner to an earlier day, so today's limits start again. */
export const backdateAttempts = (userId: string, days = 2) =>
  db().execute(sql`UPDATE generation_attempt SET created_at = created_at - make_interval(days => ${days}) WHERE user_id = ${userId}`);

/** Generation spend of today that belongs to no attempt, as if other learners had used it. */
export const addGenerationSpend = (usd: number, attemptId?: string) =>
  db().insert(llmCalls).values({ scope: "generation", attemptId, role: "TEST_SPEND", model: "gpt-6-luna", tokensIn: 0, tokensOut: 0, tokensCached: 0, tokensReasoning: 0, costUsd: usd, latencyMs: 0, attempt: 1, ok: true });

export const setBudget = async (budgetUsd: number, reserveUsd: number) => {
  await setConfig(db(), "generation_daily_budget_usd", budgetUsd, "test");
  await setConfig(db(), "generation_reserve_usd", reserveUsd, "test");
};

/** Makes the runner of an attempt look dead: its heartbeat is older than the stale limit. */
export const stopHeartbeat = (attemptId: string) =>
  db().update(generationAttempts).set({ heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(generationAttempts.id, attemptId));

/** Moves an attempt past its ten minutes: the next sweep closes it as a system error. */
export const expireAttempt = (attemptId: string) =>
  db().update(generationAttempts).set({ deadlineAt: sql`now() - interval '1 second'` }).where(eq(generationAttempts.id, attemptId));
