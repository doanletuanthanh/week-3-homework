import { sql } from "drizzle-orm";
import { DAY_ZONE } from "@/config/limits";
import type { Executor } from "../client";
import type { LlmScope } from "../schema";

/**
 * Read-only aggregates over `llm_call`, for the operator's cost report and the admin dashboard.
 * Every figure counts failed attempts and retries, as the caps do. Spend whose rows were moved to
 * the `daily_spend` ledger (deleted accounts) has no role or session left: it appears only in
 * the per-day totals, so those match what the caps read.
 */

/** The last `days` calendar days in UTC+7, today included, so every day is whole, as the caps count it. */
export type ReportWindow = { days: number };

/** 00:00 UTC+7 of the first day of the window, with the day boundary of `src/server/cost-cap.ts`. */
const windowStart = ({ days }: ReportWindow) =>
  sql`(date_trunc('day', now() AT TIME ZONE ${DAY_ZONE}) - ${days - 1}::int * interval '1 day') AT TIME ZONE ${DAY_ZONE}`;

export type RoleSpend = {
  scope: LlmScope;
  role: string;
  model: string;
  calls: number;
  failedCalls: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  tokensReasoning: number;
  usd: number;
};

/** Spend per scope, role and model, most expensive first. */
export async function spendByRole(db: Executor, window: ReportWindow): Promise<RoleSpend[]> {
  return db.execute<RoleSpend>(sql`
    SELECT scope, role, model,
           count(*)::int AS "calls",
           count(*) FILTER (WHERE NOT ok)::int AS "failedCalls",
           sum(tokens_in)::float8 AS "tokensIn",
           sum(tokens_cached)::float8 AS "tokensCached",
           sum(tokens_out)::float8 AS "tokensOut",
           sum(tokens_reasoning)::float8 AS "tokensReasoning",
           sum(cost_usd)::float8 AS "usd"
    FROM llm_call
    WHERE created_at >= ${windowStart(window)}
    GROUP BY scope, role, model
    ORDER BY "usd" DESC, scope, role
  `);
}

export type DaySpend = { day: string; scope: LlmScope; usd: number };

/** Spend per calendar day (UTC+7) and scope, the `daily_spend` ledger included, oldest day first. */
export async function spendByDay(db: Executor, window: ReportWindow): Promise<DaySpend[]> {
  return db.execute<DaySpend>(sql`
    WITH spend AS (
      SELECT (created_at AT TIME ZONE ${DAY_ZONE})::date AS day, scope, cost_usd AS usd
      FROM llm_call WHERE created_at >= ${windowStart(window)}
      UNION ALL
      SELECT day, scope, usd FROM daily_spend WHERE day >= (${windowStart(window)} AT TIME ZONE ${DAY_ZONE})::date
    )
    SELECT to_char(day, 'YYYY-MM-DD') AS day, scope, sum(usd)::float8 AS usd
    FROM spend GROUP BY day, scope ORDER BY day, scope
  `);
}

export type SessionCostStats = {
  /** Sessions with at least one call in the window. */
  sessions: number;
  avgUsd: number;
  p50Usd: number;
  p95Usd: number;
  /** Average of the highest turn index a session's calls reached. */
  avgTurns: number;
};

/** Cost per interview session (replay calls included), over the sessions that made calls in the window. */
export async function sessionCostStats(db: Executor, window: ReportWindow): Promise<SessionCostStats> {
  const [row] = await db.execute<SessionCostStats>(sql`
    WITH per_session AS (
      SELECT session_id, sum(cost_usd) AS usd, max(turn_index) AS turns
      FROM llm_call
      WHERE scope = 'session' AND session_id IS NOT NULL AND created_at >= ${windowStart(window)}
      GROUP BY session_id
    )
    SELECT count(*)::int AS "sessions",
           COALESCE(avg(usd), 0)::float8 AS "avgUsd",
           COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY usd), 0)::float8 AS "p50Usd",
           COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY usd), 0)::float8 AS "p95Usd",
           COALESCE(avg(turns), 0)::float8 AS "avgTurns"
    FROM per_session
  `);
  return row;
}

export type EvalRunCost = {
  runId: string;
  personaId: string;
  version: number;
  profile: string;
  status: string;
  calls: number;
  failedCalls: number;
  usd: number;
  estimateUsd: number;
  /** ISO-like text: raw queries return timestamps unparsed. */
  createdAt: string;
};

/**
 * Cost of evaluation runs, newest first. An eval call carries its run in `attempt_id`
 * (`src/eval/run-episode.ts`); calls of a run that was deleted are not listed.
 */
export async function evalRunCosts(db: Executor, window: ReportWindow & { runId?: string }): Promise<EvalRunCost[]> {
  return db.execute<EvalRunCost>(sql`
    SELECT r.id AS "runId", s.persona_id AS "personaId", r.version, r.profile, r.status,
           count(c.id)::int AS "calls",
           count(c.id) FILTER (WHERE NOT c.ok)::int AS "failedCalls",
           COALESCE(sum(c.cost_usd), 0)::float8 AS "usd",
           r.cost_estimate_usd::float8 AS "estimateUsd",
           r.created_at::text AS "createdAt"
    FROM eval_run r
    JOIN scenario s ON s.id = r.scenario_id
    LEFT JOIN llm_call c ON c.scope = 'eval' AND c.attempt_id = r.id
    WHERE ${window.runId ? sql`r.id = ${window.runId}` : sql`r.created_at >= ${windowStart(window)}`}
    GROUP BY r.id, s.persona_id
    ORDER BY r.created_at DESC
  `);
}

export type TurnTokens = { turnIndex: number; role: string; calls: number; avgTokensIn: number; avgTokensCached: number; avgTokensOut: number };

/**
 * Average tokens per call by turn index and role, for interview sessions: shows how the input
 * grows as the transcript does, and how much of it the provider served from its cache. Replay
 * turns repeat the main interview's turn numbers, so they are left out.
 */
export async function tokensByTurn(db: Executor, window: ReportWindow): Promise<TurnTokens[]> {
  return db.execute<TurnTokens>(sql`
    SELECT turn_index AS "turnIndex", role,
           count(*)::int AS "calls",
           avg(tokens_in)::float8 AS "avgTokensIn",
           avg(tokens_cached)::float8 AS "avgTokensCached",
           avg(tokens_out)::float8 AS "avgTokensOut"
    FROM llm_call
    WHERE scope = 'session' AND ok AND turn_index IS NOT NULL AND branch_id IS NULL AND created_at >= ${windowStart(window)}
    GROUP BY turn_index, role
    ORDER BY turn_index, role
  `);
}

export type UsageCounts = {
  /** Sessions learners started in the window. Demo accounts are left out. */
  sessionsStarted: number;
  /**
   * Learners (not demo accounts) whose sessions made a model call in the window: they interviewed
   * or replayed. A session's `updated_at` would also count writes the system makes (sweeps, unpublish).
   */
  activeLearners: number;
  /** Custom-topic attempts learners submitted in the window (admin drafts are not counted). */
  customAttempts: number;
};

/** How much the product was used in the window, for the admin overview. */
export async function usageCounts(db: Executor, window: ReportWindow): Promise<UsageCounts> {
  const [row] = await db.execute<UsageCounts>(sql`
    SELECT
      (SELECT count(*) FROM "session" WHERE NOT is_demo AND started_at >= ${windowStart(window)})::int AS "sessionsStarted",
      (SELECT count(DISTINCT s.user_id) FROM llm_call c JOIN "session" s ON s.id = c.session_id
        WHERE c.scope = 'session' AND NOT s.is_demo AND c.created_at >= ${windowStart(window)})::int AS "activeLearners",
      (SELECT count(*) FROM generation_attempt WHERE persona_id IS NULL AND created_at >= ${windowStart(window)})::int AS "customAttempts"
  `);
  return row;
}
