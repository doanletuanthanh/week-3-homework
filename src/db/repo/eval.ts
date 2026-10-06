import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { EpisodeResult, EvalProfile, EvalReport } from "@/eval/types";
import type { Database, Executor } from "../client";
import {
  adjudications,
  evalEpisodes,
  evalRuns,
  leakFlags,
  scenarios,
  sessions,
  stringApprovals,
  type ADJUDICATION_VERDICTS,
  type StringCheckResult,
} from "../schema";

export type EvalRunRow = typeof evalRuns.$inferSelect;
export type LeakFlagRow = typeof leakFlags.$inferSelect;
export type AdjudicationRow = typeof adjudications.$inferSelect;
export type StringApprovalRow = typeof stringApprovals.$inferSelect;

export async function createEvalRun(
  db: Executor,
  input: { scenarioId: string; version: number; profile: EvalProfile; turns: number; costEstimateUsd: number },
): Promise<EvalRunRow> {
  const [row] = await db.insert(evalRuns).values({ ...input, status: "running" }).returning();
  return row;
}

export async function getEvalRun(db: Executor, runId: string): Promise<EvalRunRow | null> {
  const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1);
  return row ?? null;
}

/** Stores a finished episode. Writing the same episode twice keeps the first result. */
export async function saveEpisode(db: Executor, runId: string, result: EpisodeResult): Promise<void> {
  await db.insert(evalEpisodes).values({ runId, key: result.key, resultJson: result }).onConflictDoNothing();
}

export async function listEpisodes(db: Executor, runId: string): Promise<EpisodeResult[]> {
  const rows = await db.select().from(evalEpisodes).where(eq(evalEpisodes.runId, runId)).orderBy(asc(evalEpisodes.key));
  return rows.map((row) => row.resultJson);
}

export async function markEvalRunRunning(db: Executor, runId: string): Promise<void> {
  await db.update(evalRuns).set({ status: "running", failureReason: null }).where(eq(evalRuns.id, runId));
}

export async function markEvalRunFailed(db: Executor, runId: string, failureReason: "isolation" | "model"): Promise<void> {
  await db.update(evalRuns).set({ status: "failed", failureReason }).where(eq(evalRuns.id, runId));
}

/**
 * Takes the run for this database session, so two commands cannot play the same run at once and
 * pay for every episode twice. False when another session holds it. Released when the session ends.
 */
export async function lockEvalRun(db: Executor, runId: string): Promise<boolean> {
  const [row] = await db.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_lock(hashtext('eval_run'), hashtext(${runId})) AS locked`);
  return row.locked;
}

/**
 * Closes a run: the report, the actual cost, and one `leak_flag` row per flag of the engine's
 * episodes, in one transaction. Baseline flags stay in the report only: they are about the
 * prompt-only persona, not about the one that could be published. A run that is already closed
 * is left as it is (false): its flags may have rulings by now.
 */
export async function finishEvalRun(db: Database, runId: string, report: EvalReport, episodes: EpisodeResult[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const closed = await tx
      .update(evalRuns)
      .set({ status: "done", failureReason: null, reportJson: report, costActualUsd: report.cost.actualUsd, finishedAt: new Date() })
      .where(and(eq(evalRuns.id, runId), ne(evalRuns.status, "done")))
      .returning({ id: evalRuns.id });
    if (closed.length === 0) return false;
    const flags = episodes
      .filter((episode) => episode.kind !== "baseline")
      .flatMap((episode) =>
        episode.flags.map((flag) => ({
          evalRunId: runId,
          episode: episode.key,
          turn: flag.turn,
          itemId: flag.itemId,
          kind: flag.kind,
          excerpt: flag.excerpt,
          allowedHooks: flag.allowedHooks,
          judgeReason: flag.reason,
        })),
      );
    if (flags.length > 0) await tx.insert(leakFlags).values(flags);
    return true;
  });
}

/** The newest finished full run of one scenario version, with the keys of its stored episodes. */
export async function latestFullRun(db: Executor, scenarioId: string) {
  const [run] = await db
    .select()
    .from(evalRuns)
    .where(and(eq(evalRuns.scenarioId, scenarioId), eq(evalRuns.profile, "full"), eq(evalRuns.status, "done")))
    .orderBy(desc(evalRuns.finishedAt))
    .limit(1);
  if (!run) return null;
  const keys = await db.select({ key: evalEpisodes.key }).from(evalEpisodes).where(eq(evalEpisodes.runId, run.id));
  return { run, episodeKeys: keys.map((row) => row.key) };
}

export type FlagWithRulings = { flag: LeakFlagRow; rulings: AdjudicationRow[] };

async function withRulings(db: Executor, flags: LeakFlagRow[]): Promise<FlagWithRulings[]> {
  if (flags.length === 0) return [];
  const rulings = await db
    .select()
    .from(adjudications)
    .where(inArray(adjudications.flagId, flags.map((flag) => flag.id)))
    .orderBy(asc(adjudications.at));
  return flags.map((flag) => ({ flag, rulings: rulings.filter((ruling) => ruling.flagId === flag.id) }));
}

export async function listFlags(db: Executor, runId: string): Promise<FlagWithRulings[]> {
  const flags = await db
    .select()
    .from(leakFlags)
    .where(eq(leakFlags.evalRunId, runId))
    .orderBy(asc(leakFlags.episode), asc(leakFlags.turn), asc(leakFlags.id));
  return withRulings(db, flags);
}

/** A flag with its run and the persona it is about; null when the id is unknown. */
export async function getFlag(db: Executor, flagId: string) {
  const [row] = await db
    .select({ flag: leakFlags, run: evalRuns, personaId: scenarios.personaId })
    .from(leakFlags)
    .innerJoin(evalRuns, eq(evalRuns.id, leakFlags.evalRunId))
    .innerJoin(scenarios, eq(scenarios.id, evalRuns.scenarioId))
    .where(eq(leakFlags.id, flagId))
    .limit(1);
  if (!row) return null;
  const [{ rulings }] = await withRulings(db, [row.flag]);
  return { ...row, rulings };
}

/** Records an admin's ruling on a flag, replacing the one that admin gave before. */
export async function saveAdjudication(
  db: Executor,
  ruling: { flagId: string; adminEmail: string; verdict: (typeof ADJUDICATION_VERDICTS)[number]; reason: string },
): Promise<void> {
  await db
    .insert(adjudications)
    .values(ruling)
    .onConflictDoUpdate({
      target: [adjudications.flagId, adjudications.adminEmail],
      set: { verdict: ruling.verdict, reason: ruling.reason, at: new Date() },
    });
}

type StringTarget = { scope: "persona" | "product"; personaId: string };

/** The rows of a persona's (or the product's) strings, newest check first. */
export async function listStringRows(db: Executor, target: StringTarget): Promise<StringApprovalRow[]> {
  return db
    .select()
    .from(stringApprovals)
    .where(and(eq(stringApprovals.scope, target.scope), eq(stringApprovals.personaId, target.personaId)))
    .orderBy(desc(stringApprovals.checkedAt));
}

/**
 * Stores the automatic check of one string as it reads now. Checking the same text again
 * replaces the result and keeps the decision; an edited text gets a new row with no decision.
 */
export async function saveStringCheck(
  db: Executor,
  target: StringTarget,
  entry: { key: string; text: string; textHash: string; result: StringCheckResult },
): Promise<void> {
  await db
    .insert(stringApprovals)
    .values({ ...target, stringKey: entry.key, text: entry.text, textHash: entry.textHash, fr36Result: entry.result })
    .onConflictDoUpdate({
      target: [stringApprovals.scope, stringApprovals.personaId, stringApprovals.stringKey, stringApprovals.textHash],
      set: { fr36Result: entry.result, checkedAt: new Date() },
    });
}

/** Records an admin's decision on a checked string. False when the string, as it reads now, has no check. */
export async function decideString(
  db: Executor,
  target: StringTarget,
  entry: { key: string; textHash: string; decision: "approved" | "returned"; approverEmail: string; note: string | null },
): Promise<boolean> {
  const written = await db
    .update(stringApprovals)
    .set({ decision: entry.decision, approverEmail: entry.approverEmail, note: entry.note, decidedAt: new Date() })
    .where(
      and(
        eq(stringApprovals.scope, target.scope),
        eq(stringApprovals.personaId, target.personaId),
        eq(stringApprovals.stringKey, entry.key),
        eq(stringApprovals.textHash, entry.textHash),
      ),
    )
    .returning({ id: stringApprovals.id });
  return written.length > 0;
}

/** Marks a version published through the interim CLI gate (FR-35). */
export async function publishScenario(db: Executor, scenarioId: string): Promise<void> {
  await db.update(scenarios).set({ status: "published", interimGate: true }).where(eq(scenarios.id, scenarioId));
}

/**
 * Pulls every version of a persona a learner could start on: published ones, and drafts too,
 * which are playable while the publish gate is not enforced. Nothing of the persona is playable
 * afterwards, so a new session cannot fall back to an older version. With `stopSessions`,
 * sessions on those versions that are not finished are withdrawn; otherwise they go on with the
 * version they started on. Returns how many versions and sessions changed.
 */
export async function unpublishPersona(
  db: Database,
  personaId: string,
  options: { stopSessions: boolean },
): Promise<{ versions: number; sessions: number }> {
  return db.transaction(async (tx) => {
    const pulled = await tx
      .update(scenarios)
      .set({ status: "unpublished" })
      .where(and(eq(scenarios.personaId, personaId), notInArray(scenarios.status, ["unpublished", "archived", "taken_down"])))
      .returning({ id: scenarios.id });
    if (pulled.length === 0 || !options.stopSessions) return { versions: pulled.length, sessions: 0 };

    const stopped = await tx
      .update(sessions)
      .set({ status: "withdrawn", turnClaim: null, updatedAt: sql`now()` })
      .where(
        and(
          inArray(sessions.scenarioId, pulled.map((row) => row.id)),
          notInArray(sessions.status, ["done", "withdrawn", "failed_eval"]),
        ),
      )
      .returning({ id: sessions.id });
    return { versions: pulled.length, sessions: stopped.length };
  });
}
