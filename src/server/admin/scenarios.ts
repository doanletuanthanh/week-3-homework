import { z } from "zod";
import { CUSTOM_TOPIC_CHARS, GENERATION_DEADLINE_MS } from "@/config/limits";
import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import {
  attemptRunIsDue,
  createAdminDraftAttempt,
  draftClaimsPersona,
  findRunningAttempt,
  generationCommittedToday,
  getAdminDraftAttempt,
  lockGenerationBudget,
  sweepStaleAttempts,
  type AttemptRow,
} from "@/db/repo/custom-topics";
import { getFlag, latestApproval, latestLeanRun, listFlags, saveAdjudication, unpublishPersona, type EvalRunRow, type FlagWithRulings, type VersionApprovalRow } from "@/db/repo/eval";
import { evalRunIsDue } from "@/db/repo/eval-jobs";
import { isCuratedPersona, listCuratedPersonas, listCuratedTopics, listPersonaVersions } from "@/db/repo/scenarios";
import { getScenarioByPersona, type ScenarioRow } from "@/db/repo/sessions";
import { logAdminAccess } from "@/db/repo/turns";
import { FOCUSES } from "@/db/schema";
import { flagStatus, type FlagStatus, type GateResult } from "@/eval/publish-gate";
import type { QaReport } from "@/eval/qa/types";
import type { StringState } from "@/eval/string-check";
import { isEpisodeReport } from "@/eval/types";
import type { CallModelDeps } from "@/llm/call-model";
import { diffScenario, type FieldChange } from "@/scenario/diff";
import { assertAdmin, type AppUser } from "../auth";
import { startLeanEval, type StartLeanEvalResult } from "../eval-job";
import {
  PRODUCT_TARGET,
  approveNewestVersion,
  approveStrings,
  checkPublishGate,
  checkStrings,
  loadStringStates,
  loadStringTarget,
  publishNewest,
  type ApproveStringsResult,
  type ApproveVersionResult,
  type PublishResult,
} from "../scenario-review";
import { isUuid } from "../uuid";

/**
 * The admin's scenario review: the same server functions as the CLI, behind the admin check.
 * Every change writes one `admin_access_log` row (channel `console`) before it acts, so a refused
 * attempt is on record too. Reads show locked item content, so they are for admins only.
 */

/**
 * The console reviews curated personas only. A learner's custom persona is their data: it is
 * reached through the custom-topic tools, which log the learner it belongs to.
 */
const reviewable = (db: Database, personaId: string) => isCuratedPersona(db, personaId);

/** A string target the console may touch: `product`, or a curated persona. */
const reviewableTarget = async (db: Database, name: string) => name === PRODUCT_TARGET || reviewable(db, name);

async function logAction(db: Database, user: AppUser, action: string): Promise<void> {
  await logAdminAccess(db, { adminEmail: user.email, channel: "console", action });
}

const isLive = (run: EvalRunRow | null) => run !== null && (run.status === "queued" || run.status === "running");

export type ScenarioListRow = {
  personaId: string;
  displayName: string;
  topicTitle: string;
  version: number;
  status: ScenarioRow["status"];
  gate: GateResult;
  lean: { status: EvalRunRow["status"]; costUsd: number } | null;
};

/** Every curated persona at its newest version, with its gate result and its newest lean run. */
export async function listScenarioReviews(db: Database, user: AppUser | null): Promise<ScenarioListRow[]> {
  assertAdmin(user);
  const personas = await listCuratedPersonas(db);
  return Promise.all(
    personas.map(async ({ scenario, topicTitle }) => {
      const checked = (await checkPublishGate(db, scenario.personaId))!;
      return {
        personaId: scenario.personaId,
        displayName: scenario.displayName,
        topicTitle,
        version: scenario.version,
        status: scenario.status,
        gate: checked.gate,
        lean: checked.run ? { status: checked.run.status, costUsd: checked.run.costActualUsd ?? 0 } : null,
      };
    }),
  );
}

export type ReviewFlag = FlagWithRulings & { status: FlagStatus };

export type ScenarioReview = {
  scenario: ScenarioRow;
  topic: { id: string; title: string };
  versions: Pick<ScenarioRow, "id" | "version" | "status" | "createdAt">[];
  /** Fields changed since the previous version; null for a first version. */
  diff: FieldChange[] | null;
  gate: GateResult;
  run: EvalRunRow | null;
  /** The lean run is queued or running: the page follows it. */
  runLive: boolean;
  /** Set when the newest lean run lost its runner and should be started again. */
  dueRunId: string | null;
  report: QaReport | null;
  flags: ReviewFlag[];
  strings: { persona: StringState[]; product: StringState[] };
  approval: (VersionApprovalRow & { onCurrentRun: boolean }) | null;
};

/** Everything an admin reads to review the newest version of a persona; null for an unknown persona. */
export async function getScenarioReview(db: Database, user: AppUser | null, personaId: string): Promise<ScenarioReview | null> {
  assertAdmin(user);
  const found = (await reviewable(db, personaId)) ? await getScenarioByPersona(db, personaId) : null;
  if (!found) return null;
  const { scenario, topic } = found;
  const [checked, versions, approval, personaTarget, productTarget] = await Promise.all([
    checkPublishGate(db, personaId),
    listPersonaVersions(db, personaId),
    latestApproval(db, scenario.id),
    loadStringTarget(db, personaId),
    loadStringTarget(db, PRODUCT_TARGET),
  ]);
  const { run, gate } = checked!;
  const previous = versions.find((row) => row.version < scenario.version);
  const flags = run ? await listFlags(db, run.id) : [];
  const report = run?.reportJson && !isEpisodeReport(run.reportJson) ? run.reportJson : null;

  return {
    scenario,
    topic: { id: topic.id, title: topic.title },
    versions: versions.map(({ id, version, status, createdAt }) => ({ id, version, status, createdAt })),
    diff: previous ? diffScenario(previous.content, scenario.content) : null,
    gate,
    run,
    runLive: isLive(run),
    dueRunId: run && evalRunIsDue(run) ? run.id : null,
    report,
    flags: flags.map((entry) => ({ ...entry, status: flagStatus(entry.rulings) })),
    strings: { persona: await loadStringStates(db, personaTarget!), product: await loadStringStates(db, productTarget!) },
    approval: approval ? { ...approval, onCurrentRun: approval.evalRunId === run?.id } : null,
  };
}

/** Queues a lean evaluation of the newest version; the caller starts `runEvalJob` on the run. */
export async function requestLeanEval(db: Database, user: AppUser | null, personaId: string): Promise<StartLeanEvalResult> {
  assertAdmin(user);
  await logAction(db, user, `scenario eval ${personaId}`);
  const found = (await reviewable(db, personaId)) ? await getScenarioByPersona(db, personaId) : null;
  if (!found) return { ok: false, reason: "not_found" };
  return startLeanEval(db, found.scenario.id, user.email);
}

export const flagRulingSchema = z.object({
  personaId: z.string().min(1),
  flagId: z.string().refine(isUuid),
  verdict: z.enum(["leak", "not_leak"]),
  reason: z.string().trim().min(1).max(2000),
});

/** `stale`: the flag is not one of the persona's newest lean run, so ruling on it would change nothing. */
export type RuleFlagResult = { ok: true } | { ok: false; error: "invalid_input" | "not_found" | "stale" };

/** An admin rules on a leak flag of the newest lean run. One ruling settles it; the latest ruling counts. */
export async function ruleOnFlag(db: Database, user: AppUser | null, raw: unknown): Promise<RuleFlagResult> {
  assertAdmin(user);
  const input = flagRulingSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { personaId, flagId, verdict, reason } = input.data;
  await logAction(db, user, `scenario adjudicate ${personaId} ${flagId} ${verdict}`);
  const [flag, persona] = await Promise.all([getFlag(db, flagId), getScenarioByPersona(db, personaId)]);
  if (!flag || !persona || flag.personaId !== personaId || !(await reviewable(db, personaId))) return { ok: false, error: "not_found" };
  const newest = await latestLeanRun(db, persona.scenario.id);
  if (newest?.id !== flag.run.id) return { ok: false, error: "stale" };
  await saveAdjudication(db, { flagId, adminEmail: user.email, verdict, reason });
  return { ok: true };
}

/** FR-36 on the strings of a persona or of `product` that have no check for their current text. */
export async function checkStringsFor(
  db: Database,
  user: AppUser | null,
  name: string,
  llmDeps?: Partial<CallModelDeps>,
): Promise<{ ok: true; checked: number; failing: number } | { ok: false; error: "not_found" }> {
  assertAdmin(user);
  await logAction(db, user, `scenario check-strings ${name}`);
  const target = (await reviewableTarget(db, name)) ? await loadStringTarget(db, name) : null;
  if (!target) return { ok: false, error: "not_found" };
  const { checked, states } = await checkStrings(db, target, { llmDeps });
  return { ok: true, checked, failing: states.filter((entry) => !entry.checkOk).length };
}

/** FR-60: approves every string of a persona or of `product` that passed the check. */
export async function approveStringsFor(db: Database, user: AppUser | null, name: string): Promise<ApproveStringsResult | { ok: false; error: "not_found" }> {
  assertAdmin(user);
  await logAction(db, user, `scenario approve-strings ${name}`);
  const target = (await reviewableTarget(db, name)) ? await loadStringTarget(db, name) : null;
  if (!target) return { ok: false, error: "not_found" };
  return approveStrings(db, target, "all", user.email);
}

/** Approves the newest version on its newest finished lean run, with the admin's note. */
export async function approveVersionFor(db: Database, user: AppUser | null, personaId: string, note: string): Promise<ApproveVersionResult | { outcome: "invalid_input" }> {
  assertAdmin(user);
  await logAction(db, user, `scenario approve ${personaId}`);
  const trimmed = note.trim();
  if (trimmed === "" || trimmed.length > 2000) return { outcome: "invalid_input" };
  if (!(await reviewable(db, personaId))) return { outcome: "not_found" };
  return approveNewestVersion(db, personaId, user.email, trimmed);
}

/** Publishes the newest version through the publish gate. */
export async function publishFor(db: Database, user: AppUser | null, personaId: string): Promise<PublishResult> {
  assertAdmin(user);
  await logAction(db, user, `scenario publish ${personaId}`);
  if (!(await reviewable(db, personaId))) return { outcome: "not_found" };
  return publishNewest(db, personaId);
}

/** Pulls every playable version of the persona; with `stopSessions`, unfinished sessions on them are withdrawn. */
export async function unpublishFor(
  db: Database,
  user: AppUser | null,
  personaId: string,
  stopSessions: boolean,
): Promise<{ ok: true; versions: number; sessions: number } | { ok: false; error: "not_found" | "nothing_playable" }> {
  assertAdmin(user);
  await logAction(db, user, `scenario unpublish ${personaId}${stopSessions ? " --stop-sessions" : ""}`);
  if (!(await reviewable(db, personaId))) return { ok: false, error: "not_found" };
  const result = await unpublishPersona(db, personaId, { stopSessions });
  if (result.versions === 0) return { ok: false, error: "nothing_playable" };
  return { ok: true, ...result };
}

/** Curated topics an admin can draft a persona for. */
export async function listDraftTopics(db: Database, user: AppUser | null) {
  assertAdmin(user);
  return listCuratedTopics(db);
}

export const draftInputSchema = z.object({
  topicId: z.string().min(1),
  // `custom-` is the prefix of learners' generated personas.
  personaId: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60)
    .refine((id) => !id.startsWith("custom-")),
  topicText: z.string().trim().min(CUSTOM_TOPIC_CHARS.min).max(CUSTOM_TOPIC_CHARS.max),
  focus: z.enum(FOCUSES),
});

export type StartDraftResult =
  | { ok: true; attemptId: string }
  /** `running`: this admin already has a draft (or a custom topic) being prepared. `over_budget`: today's generation budget cannot hold one more. */
  | { ok: false; error: "invalid_input" | "topic_not_found" | "persona_exists" | "running" | "over_budget" };

/**
 * Starts drafting a new persona for a curated topic with the scenario generator: generate,
 * `validate`, output safety check. It holds part of the daily generation budget the way a
 * learner's attempt does, under the same lock. The admin wrote the topic text, so there is no
 * moderation call. A pass is saved as a draft version and never published by this. The caller
 * starts `runGeneration` on the attempt.
 */
export async function startAdminDraft(db: Database, user: AppUser | null, raw: unknown, now: number = Date.now()): Promise<StartDraftResult> {
  assertAdmin(user);
  const input = draftInputSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { topicId, personaId, topicText, focus } = input.data;
  await logAction(db, user, `scenario draft ${topicId} ${personaId}`);
  if (!(await listCuratedTopics(db)).some((topic) => topic.id === topicId)) return { ok: false, error: "topic_not_found" };
  if (await getScenarioByPersona(db, personaId)) return { ok: false, error: "persona_exists" };

  return db.transaction(async (tx): Promise<StartDraftResult> => {
    await lockGenerationBudget(tx);
    await sweepStaleAttempts(tx);
    if (await findRunningAttempt(tx, user.id)) return { ok: false, error: "running" };
    // Again under the budget lock, which every draft start holds: two admins cannot both claim one id.
    if ((await getScenarioByPersona(tx, personaId)) || (await draftClaimsPersona(tx, personaId))) return { ok: false, error: "persona_exists" };
    const [budget, reserveUsd, committed] = await Promise.all([
      getConfig(tx, "generation_daily_budget_usd"),
      getConfig(tx, "generation_reserve_usd"),
      generationCommittedToday(tx),
    ]);
    if (committed + reserveUsd > budget) return { ok: false, error: "over_budget" };
    const attempt = await createAdminDraftAttempt(tx, {
      userId: user.id,
      topicId,
      personaId,
      topicText,
      focus,
      reserveUsd,
      deadlineAt: new Date(now + GENERATION_DEADLINE_MS),
    });
    return { ok: true, attemptId: attempt.id };
  });
}

export type DraftView = Pick<AttemptRow, "id" | "outcome" | "step" | "failureCode" | "personaId" | "topicId" | "report" | "costActualUsd"> & { due: boolean };

/** Where an admin's draft stands; `due` when nobody works on it and it can still be finished. Null for any other attempt. */
export async function getAdminDraft(db: Database, user: AppUser | null, attemptId: string): Promise<DraftView | null> {
  assertAdmin(user);
  if (!isUuid(attemptId)) return null;
  // Any admin may look at any draft, so every stale attempt is closed, not only this admin's.
  await sweepStaleAttempts(db);
  const attempt = await getAdminDraftAttempt(db, attemptId);
  if (!attempt) return null;
  const { id, outcome, step, failureCode, personaId, topicId, report, costActualUsd } = attempt;
  return { id, outcome, step, failureCode, personaId, topicId, report, costActualUsd, due: attemptRunIsDue(attempt) };
}
