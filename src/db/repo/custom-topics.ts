import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DAY_ZONE, GENERATION_MAX_RUNS, GENERATION_STALE_MS } from "@/config/limits";
import type { Scenario } from "@/scenario/schema";
import type { Database, Executor } from "../client";
import {
  generationAttempts,
  scenarios,
  sessions,
  topics,
  users,
  type AttemptReport,
  type AttemptStep,
  type FailureCode,
  type Focus,
  type ModerationConstraint,
  type REFUSAL_CODES,
} from "../schema";
import { insertOpening, type SessionRow } from "./sessions";

export type AttemptRow = typeof generationAttempts.$inferSelect;

/** 00:00 today in UTC+7, as a timestamp. */
const TODAY_START = sql`(date_trunc('day', now() AT TIME ZONE ${DAY_ZONE}) AT TIME ZONE ${DAY_ZONE})`;
const TODAY = sql`(now() AT TIME ZONE ${DAY_ZONE})::date`;

export type SweepOptions = {
  staleMs?: number;
  /** Also close an attempt that only lost its runner, whatever runs it has left: for the learner who is deleting their account. */
  abandon?: boolean;
};

/**
 * Closes, as a system error, every running attempt nobody will finish: its time is up, or it is
 * unowned (given back, or no heartbeat for `staleMs`) and has used all its runs. Its session becomes
 * `failed_eval`, the budget it held is released, and what it spent is written down. An attempt
 * that lost its runner but has runs left is not closed: the next run takes it over. One
 * statement, so an attempt is closed once whoever calls. A runner that comes back afterwards
 * finds the attempt no longer running and writes nothing.
 */
export async function sweepStaleAttempts(db: Executor, userId?: string, options: SweepOptions = {}): Promise<number> {
  const mine = userId === undefined ? sql`` : sql`AND a.user_id = ${userId}`;
  const staleMs = options.staleMs ?? GENERATION_STALE_MS;
  const outOfRuns = options.abandon ? sql`true` : sql`a.run_attempt >= ${GENERATION_MAX_RUNS}`;
  const closed = await db.execute<{ id: string }>(sql`
    WITH swept AS (
      UPDATE generation_attempt a
      SET outcome = 'system_error',
          failure_code = 'system_error',
          finished_at = now(),
          run_token = NULL,
          draft = NULL,
          cost_actual_usd = COALESCE((SELECT sum(c.cost_usd) FROM llm_call c WHERE c.attempt_id = a.id AND c.scope = 'generation'), 0),
          report = a.report || '{"error":"runner_lost_or_timed_out"}'::jsonb
      WHERE a.outcome = 'running'
        AND (a.deadline_at < now() OR ((a.run_token IS NULL OR a.heartbeat_at < now() - make_interval(secs => ${staleMs / 1000})) AND ${outOfRuns}))
        ${mine}
      RETURNING a.id, a.session_id
    ), closed AS (
      UPDATE "session" SET status = 'failed_eval', updated_at = now()
      WHERE id IN (SELECT session_id FROM swept) AND status = 'generating'
    )
    SELECT id FROM swept
  `);
  return closed.length;
}

export async function findRunningAttempt(db: Executor, userId: string): Promise<AttemptRow | null> {
  const [row] = await db
    .select()
    .from(generationAttempts)
    .where(and(eq(generationAttempts.userId, userId), eq(generationAttempts.outcome, "running")))
    .limit(1);
  return row ?? null;
}

/** What the learner used of today's limits: attempts that count (FR-56) and topics moderation refused. */
export async function countAttemptsToday(db: Executor, userId: string): Promise<{ attempts: number; refusals: number }> {
  const [row] = await db.execute<{ attempts: number; refusals: number }>(sql`
    SELECT
      count(*) FILTER (WHERE outcome IN ('running', 'passed', 'failed'))::int AS attempts,
      count(*) FILTER (WHERE outcome = 'refused')::int AS refusals
    FROM generation_attempt
    WHERE user_id = ${userId} AND created_at >= ${TODAY_START}
  `);
  return { attempts: row.attempts, refusals: row.refusals };
}

/**
 * What is already taken of today's generation budget: the spend of every attempt that stopped
 * (its `llm_call` rows, plus the ledger for rows that no longer exist), and for every attempt
 * still running the whole amount it reserved. A running attempt is stopped at its reservation,
 * so the total cannot pass the budget.
 */
export async function generationCommittedToday(db: Executor): Promise<number> {
  const [row] = await db.execute<{ usd: number }>(sql`
    SELECT (
      COALESCE((
        SELECT sum(c.cost_usd) FROM llm_call c
        WHERE c.scope = 'generation' AND c.created_at >= ${TODAY_START}
          AND NOT EXISTS (SELECT 1 FROM generation_attempt a WHERE a.id = c.attempt_id AND a.outcome = 'running')
      ), 0)
      + COALESCE((SELECT sum(usd) FROM daily_spend WHERE scope = 'generation' AND day = ${TODAY}), 0)
      + COALESCE((SELECT sum(cost_reserved_usd) FROM generation_attempt WHERE outcome = 'running'), 0)
    )::float8 AS usd
  `);
  return row.usd;
}

/** The same for one account, from its own attempts. What a deleted account spent today is added by the caller. */
export async function accountCommittedToday(db: Executor, userId: string): Promise<number> {
  const [row] = await db.execute<{ usd: number }>(sql`
    SELECT (
      COALESCE((
        SELECT sum(c.cost_usd) FROM llm_call c
        JOIN generation_attempt a ON a.id = c.attempt_id
        WHERE a.user_id = ${userId} AND a.outcome <> 'running' AND c.scope = 'generation' AND c.created_at >= ${TODAY_START}
      ), 0)
      + COALESCE((SELECT sum(cost_reserved_usd) FROM generation_attempt WHERE user_id = ${userId} AND outcome = 'running'), 0)
    )::float8 AS usd
  `);
  return row.usd;
}

/** Serialises the transactions that take from the generation budget, so two of them cannot both take the last of it. */
export async function lockGenerationBudget(tx: Executor): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('generation_budget'))`);
}

type Moderated = { topicText: string; focus: Focus; focusRaw: string };

/** A topic moderation refused: no topic, no session, and it is not an attempt (FR-55). Kept to count refusals. */
export async function recordRefusal(db: Executor, input: Moderated & { userId: string; reasonCode: (typeof REFUSAL_CODES)[number] }): Promise<void> {
  await db.insert(generationAttempts).values({
    userId: input.userId,
    topicText: input.topicText,
    focus: input.focus,
    focusRaw: input.focusRaw,
    moderationDecision: "refuse",
    reasonCode: input.reasonCode,
    outcome: "refused",
    finishedAt: sql`now()`,
  });
}

/** The learner's own custom topic, when `topicId` names one. */
export async function findOwnCustomTopic(db: Executor, userId: string, topicId: string) {
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.ownerUserId, userId), eq(topics.kind, "custom")));
  return row ?? null;
}

/**
 * Creates what an accepted topic starts with: the custom topic (unless this is another try in an
 * existing one), a `generating` session, and the running attempt holding its part of the budget.
 * Call inside the transaction that checked the limits.
 */
export async function createRunningAttempt(
  tx: Executor,
  input: Moderated & {
    userId: string;
    isDemo: boolean;
    topicId: string | null;
    constraints: ModerationConstraint[];
    reserveUsd: number;
    deadlineAt: Date;
  },
): Promise<{ attempt: AttemptRow; session: SessionRow }> {
  let { topicId } = input;
  if (topicId === null) {
    topicId = `custom-${randomUUID()}`;
    await tx.insert(topics).values({ id: topicId, title: input.topicText, summary: "Chủ đề tự tạo", kind: "custom", ownerUserId: input.userId });
  } else {
    // Another try in the same topic: the topic is named after what the learner typed last.
    await tx.update(topics).set({ title: input.topicText }).where(eq(topics.id, topicId));
  }
  const [session] = await tx.insert(sessions).values({ userId: input.userId, status: "generating", isDemo: input.isDemo, focus: input.focus }).returning();
  const [attempt] = await tx
    .insert(generationAttempts)
    .values({
      userId: input.userId,
      topicId,
      sessionId: session.id,
      topicText: input.topicText,
      focus: input.focus,
      focusRaw: input.focusRaw,
      moderationDecision: input.constraints.length > 0 ? "allow_with_constraints" : "allow",
      constraints: input.constraints,
      outcome: "running",
      step: "generating",
      heartbeatAt: sql`now()`,
      deadlineAt: input.deadlineAt,
      costReservedUsd: input.reserveUsd,
    })
    .returning();
  return { attempt, session };
}

export async function getAttemptForUser(db: Executor, userId: string, attemptId: string): Promise<AttemptRow | null> {
  const [row] = await db
    .select()
    .from(generationAttempts)
    .where(and(eq(generationAttempts.id, attemptId), eq(generationAttempts.userId, userId)));
  return row ?? null;
}

/**
 * A learner's own custom session that has no scenario: one being prepared, or one whose scenario
 * never passed. Null for any other session and for someone else's.
 */
export async function getPendingCustomSession(db: Executor, userId: string, sessionId: string) {
  const [row] = await db
    .select({ session: sessions, attempt: generationAttempts })
    .from(sessions)
    .innerJoin(generationAttempts, eq(generationAttempts.sessionId, sessions.id))
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), inArray(sessions.status, ["generating", "failed_eval"])));
  return row ?? null;
}

/** A running attempt nobody is working on: it was never claimed, was given back, or its runner's heartbeat went stale. */
const unowned = (staleMs: number) =>
  sql`(${generationAttempts.runToken} IS NULL OR ${generationAttempts.heartbeatAt} < now() - make_interval(secs => ${staleMs / 1000}))`;

/**
 * Makes one runner the owner of a running attempt, in a single conditional update, so of any
 * number of runners started together exactly one proceeds. An attempt can be claimed while it is
 * running, within its deadline, unowned, and has runs left. The runner it is taken from, if it
 * still lives, loses every write: they are conditional on the token. `spentUsd` is what earlier
 * runs of the attempt already cost.
 */
export async function claimAttempt(
  db: Executor,
  attemptId: string,
  staleMs: number = GENERATION_STALE_MS,
): Promise<{ attempt: AttemptRow; token: string; spentUsd: number } | null> {
  const token = randomUUID();
  const [attempt] = await db
    .update(generationAttempts)
    .set({ runToken: token, runAttempt: sql`${generationAttempts.runAttempt} + 1`, heartbeatAt: sql`now()` })
    .where(
      and(
        eq(generationAttempts.id, attemptId),
        eq(generationAttempts.outcome, "running"),
        sql`${generationAttempts.deadlineAt} > now()`,
        unowned(staleMs),
        sql`${generationAttempts.runAttempt} < ${GENERATION_MAX_RUNS}`,
      ),
    )
    .returning();
  if (!attempt) return null;
  const [spent] = await db.execute<{ usd: number }>(
    sql`SELECT COALESCE(sum(cost_usd), 0)::float8 AS usd FROM llm_call WHERE attempt_id = ${attemptId} AND scope = 'generation'`,
  );
  return { attempt, token, spentUsd: spent.usd };
}

/** True when a run should be started for the attempt: it is running, unowned, within its deadline, and has runs left. */
export function attemptRunIsDue(attempt: AttemptRow, now: Date = new Date(), staleMs: number = GENERATION_STALE_MS): boolean {
  if (attempt.outcome !== "running" || attempt.runAttempt >= GENERATION_MAX_RUNS) return false;
  if (attempt.deadlineAt === null || attempt.deadlineAt.getTime() <= now.getTime()) return false;
  return attempt.runToken === null || attempt.heartbeatAt === null || now.getTime() - attempt.heartbeatAt.getTime() > staleMs;
}

const owned = (attemptId: string, token: string) =>
  and(eq(generationAttempts.id, attemptId), eq(generationAttempts.runToken, token), eq(generationAttempts.outcome, "running"));

/** Refreshes the heartbeat, and the step when given. False when the attempt is no longer this runner's: it must stop. */
export async function touchAttempt(db: Executor, attemptId: string, token: string, step?: AttemptStep): Promise<boolean> {
  const rows = await db
    .update(generationAttempts)
    .set({ heartbeatAt: sql`now()`, ...(step ? { step } : {}) })
    .where(owned(attemptId, token))
    .returning({ id: generationAttempts.id });
  return rows.length > 0;
}

/** Stores the validated scenario on the attempt. False when the attempt is no longer this runner's. */
export async function saveDraft(db: Executor, attemptId: string, token: string, draft: Scenario): Promise<boolean> {
  const rows = await db
    .update(generationAttempts)
    .set({ draft, heartbeatAt: sql`now()` })
    .where(owned(attemptId, token))
    .returning({ id: generationAttempts.id });
  return rows.length > 0;
}

/** Gives the attempt back, unfinished, so the next run can claim it at once. Does nothing when it is no longer this runner's. */
export async function releaseAttempt(db: Executor, attemptId: string, token: string): Promise<void> {
  await db.update(generationAttempts).set({ runToken: null }).where(owned(attemptId, token));
}

export type AttemptResult =
  | { outcome: "passed"; scenario: Scenario }
  | { outcome: "failed"; code: Exclude<FailureCode, "system_error"> }
  | { outcome: "system_error" };

/**
 * Ends a running attempt, once: under its row lock and only while it is this runner's and still
 * running. A pass stores the scenario for its owner alone, gives the session its opening turn and
 * moves it to `interviewing`, and uses up the free scenario. A fail moves the session to
 * `failed_eval` and counts towards the lifetime limit; a system error counts for nothing. Either
 * way the budget the attempt held is released and what it spent is written down. False when
 * nothing was written.
 */
export async function finishAttempt(
  db: Database,
  write: { attemptId: string; token: string; result: AttemptResult; report: AttemptReport; costActualUsd: number },
  inTransaction?: (tx: Executor, attempt: AttemptRow, session: SessionRow) => Promise<void>,
): Promise<boolean> {
  const { result } = write;
  return db.transaction(async (tx) => {
    // The learner's row first, then the attempt: the order account deletion takes them in.
    const [owner] = await tx.select({ userId: generationAttempts.userId }).from(generationAttempts).where(eq(generationAttempts.id, write.attemptId));
    if (!owner) return false;
    await tx.select({ id: users.id }).from(users).where(eq(users.id, owner.userId)).for("update");
    const [attempt] = await tx.select().from(generationAttempts).where(eq(generationAttempts.id, write.attemptId)).for("update");
    if (!attempt || attempt.outcome !== "running" || attempt.runToken !== write.token || attempt.sessionId === null || attempt.topicId === null) return false;

    let scenarioId: string | null = null;
    let personaId: string | null = null;
    if (result.outcome === "passed") {
      personaId = `custom-${attempt.id}`;
      const content: Scenario = { ...result.scenario, persona_id: personaId, topic_id: attempt.topicId, version: 1 };
      const [row] = await tx
        .insert(scenarios)
        .values({
          personaId,
          topicId: attempt.topicId,
          version: 1,
          // Nobody reviews it: it is "published" for its owner, who is the only one the topic is visible to.
          status: "published",
          origin: "generated",
          displayName: content.persona.display_name,
          tagline: content.persona.tagline,
          language: content.language,
          content,
        })
        .returning({ id: scenarios.id });
      scenarioId = row.id;
      await insertOpening(tx, attempt.sessionId, content);
      await tx.update(users).set({ freeCustomUsed: true }).where(eq(users.id, attempt.userId));
    } else if (result.outcome === "failed") {
      await tx
        .update(users)
        .set({ customFailedCount: sql`${users.customFailedCount} + 1` })
        .where(eq(users.id, attempt.userId));
    }

    const [after] = await tx
      .update(generationAttempts)
      .set({
        outcome: result.outcome,
        failureCode: result.outcome === "failed" ? result.code : result.outcome === "system_error" ? "system_error" : null,
        scenarioId,
        runToken: null,
        // The scenario is stored as a scenario row now, or was turned down: the copy is not kept.
        draft: null,
        finishedAt: sql`now()`,
        costActualUsd: write.costActualUsd,
        report: write.report,
      })
      .where(eq(generationAttempts.id, attempt.id))
      .returning();
    const [session] = await tx
      .update(sessions)
      .set(
        result.outcome === "passed"
          ? { status: "interviewing", scenarioId, personaId, startedAt: sql`now()`, updatedAt: sql`now()` }
          : { status: "failed_eval", updatedAt: sql`now()` },
      )
      .where(and(eq(sessions.id, attempt.sessionId), eq(sessions.status, "generating")))
      .returning();
    if (!session) throw new Error(`attempt ${attempt.id} is running but its session is not generating`);
    await inTransaction?.(tx, after, session);
    return true;
  });
}

/** "Kịch bản này có vấn đề": marks the learner's own custom session. False when it is not one. */
export async function reportProblem(db: Executor, userId: string, sessionId: string): Promise<boolean> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE "session" s SET problem_reported_at = COALESCE(s.problem_reported_at, now())
    FROM scenario sc
    WHERE s.id = ${sessionId} AND s.user_id = ${userId} AND sc.id = s.scenario_id AND sc.origin = 'generated'
      AND s.status IN ('revealed', 'replaying', 'done')
    RETURNING s.id
  `);
  return rows.length > 0;
}

/** The newest requests with what became of them. Not filtered by learner: the operator's view. */
export async function listAttempts(db: Executor, limit: number) {
  return db
    .select({ attempt: generationAttempts, email: users.email, problemReportedAt: sessions.problemReportedAt, sessionStatus: sessions.status })
    .from(generationAttempts)
    .innerJoin(users, eq(users.id, generationAttempts.userId))
    .leftJoin(sessions, eq(sessions.id, generationAttempts.sessionId))
    .orderBy(desc(generationAttempts.createdAt))
    .limit(limit);
}

/**
 * Takes a generated scenario away from its owner: the scenario is `taken_down`, so no session
 * can start on it, and every unfinished session on it becomes `withdrawn`. Null when the id is
 * not a generated scenario. `beforeChange` runs in the same transaction once the scenario is
 * found: the place for the access log, so the change and its log exist together or not at all.
 */
export async function takeDownCustomScenario(
  db: Database,
  scenarioId: string,
  beforeChange?: (tx: Executor, ownerUserId: string | null) => Promise<void>,
): Promise<{ ownerUserId: string | null; withdrawn: number } | null> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: scenarios.id, ownerUserId: topics.ownerUserId })
      .from(scenarios)
      .innerJoin(topics, eq(topics.id, scenarios.topicId))
      .where(and(eq(scenarios.id, scenarioId), eq(scenarios.origin, "generated")))
      .for("update");
    if (!found) return null;
    await beforeChange?.(tx, found.ownerUserId);
    await tx.update(scenarios).set({ status: "taken_down" }).where(eq(scenarios.id, scenarioId));
    const withdrawn = await tx
      .update(sessions)
      .set({ status: "withdrawn", turnClaim: null, updatedAt: sql`now()` })
      .where(and(eq(sessions.scenarioId, scenarioId), inArray(sessions.status, ["interviewing", "revealed", "replaying"])))
      .returning({ id: sessions.id });
    return { ownerUserId: found.ownerUserId, withdrawn: withdrawn.length };
  });
}

/**
 * Gives a learner their free custom scenario back. `quotaKey` is the key of what was kept of an
 * account the same Google account deleted earlier: the flag is cleared there too, or a learner who
 * deleted and signed in again would stay blocked. False when there is no such learner.
 */
export async function refundFreeScenario(db: Executor, userId: string, quotaKey: string | null): Promise<boolean> {
  const rows = await db.update(users).set({ freeCustomUsed: false }).where(eq(users.id, userId)).returning({ id: users.id });
  if (rows.length > 0 && quotaKey !== null) await db.execute(sql`UPDATE quota_tombstone SET free_custom_used = false, updated_at = now() WHERE key = ${quotaKey}`);
  return rows.length > 0;
}

/** Removes a learner's custom topics with their scenarios. Their sessions must be gone already. */
export async function deleteCustomContent(tx: Executor, userId: string): Promise<void> {
  await tx.execute(sql`DELETE FROM scenario WHERE topic_id IN (SELECT id FROM topic WHERE owner_user_id = ${userId})`);
  await tx.delete(topics).where(eq(topics.ownerUserId, userId));
}
