import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { TurnDecision } from "@/engine/plan-turn";
import type { RevealJson, RevealParts } from "@/engine/reveal-types";
import { REPLAY_RESULTS } from "@/engine/replay-result";
import { LABELS, type HookEntry, type RawAnalysis, type UnlockedItem, type Verdict } from "@/engine/types";
import type { EpisodeResult, EvalReport, LeakKind } from "@/eval/types";
import type { Scenario } from "@/scenario/schema";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** App-side learner row. `id` is the Supabase Auth user id; there is no FK into the `auth` schema. */
export const users = pgTable("user", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  visibilityAckVersion: integer("visibility_ack_version"),
  visibilityAckAt: timestamp("visibility_ack_at", { withTimezone: true }),
  /** The one free playable custom scenario was used (FR-56). An operator can give it back. */
  freeCustomUsed: boolean("free_custom_used").notNull().default(false),
  /** Custom-topic attempts that failed their checks. System errors and refusals are not in it. */
  customFailedCount: integer("custom_failed_count").notNull().default(0),
  createdAt,
});

export const TOPIC_KINDS = ["curated", "custom"] as const;

export const topics = pgTable(
  "topic",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    kind: text("kind", { enum: TOPIC_KINDS }).notNull().default("curated"),
    /** Set for a custom topic: only this learner (and operators) can see it and its persona. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt,
  },
  (table) => [index("topic_owner_idx").on(table.ownerUserId)],
);

export const SCENARIO_STATUSES = [
  "draft",
  "evaluating",
  "eval_failed",
  "ready_for_review",
  "published",
  "unpublished",
  "archived",
  "taken_down",
] as const;

/**
 * One version of a persona. A new import is a new row; a row's content is never rewritten, so a
 * published version stays what it was when it was published.
 */
export const scenarios = pgTable(
  "scenario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable across versions; the one-session-per-persona rule counts by it. */
    personaId: text("persona_id").notNull(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    version: integer("version").notNull(),
    status: text("status", { enum: SCENARIO_STATUSES }).notNull().default("draft"),
    origin: text("origin", { enum: ["authored", "generated"] }).notNull().default("authored"),
    /** Published through the interim CLI gate; cleared once the full gate has passed. */
    interimGate: boolean("interim_gate").notNull().default(false),
    // Copies of fields inside `content`, so lists do not have to read the sealed JSON.
    displayName: text("display_name").notNull(),
    avatarKey: text("avatar_key"),
    tagline: text("tagline").notNull(),
    language: text("language").notNull(),
    /** The validated scenario file. Holds the sealed items: never send it to the browser whole. */
    content: jsonb("content").$type<Scenario>().notNull(),
    createdAt,
  },
  (table) => [unique("scenario_persona_version_key").on(table.personaId, table.version)],
);

export const SESSION_STATUSES = [
  "generating",
  "interviewing",
  "revealed",
  "replaying",
  "done",
  "failed_eval",
  "withdrawn",
] as const;

/** What a learner asked to practise in a custom topic (FR-53). `general` is the answer to anything else. */
export const FOCUSES = ["follow_up", "past_story", "trust", "no_leading", "general"] as const;
export type Focus = (typeof FOCUSES)[number];

export const DEVICE_CLASSES = ["mobile", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** Marks the one turn request allowed to call the models for a session right now. */
export type TurnClaim = { token: string; at: string };

export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Empty while a custom scenario is being prepared (`generating`) and when it never passed (`failed_eval`). */
    scenarioId: uuid("scenario_id").references(() => scenarios.id),
    personaId: text("persona_id"),
    status: text("status", { enum: SESSION_STATUSES }).notNull().default("interviewing"),
    /** Custom topics only: what the learner wants to practise, from the closed set. Orders the takeaway comments. */
    focus: text("focus", { enum: FOCUSES }),
    /** "Kịch bản này có vấn đề" was pressed on the reveal of a custom scenario. */
    problemReportedAt: timestamp("problem_reported_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Set by "Kết thúc buổi" or by turn 30. No turn is written after it. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    turnClaim: jsonb("turn_claim").$type<TurnClaim>(),
    /** The learner's notes: autosaved while they type, never read by any call of the interview. */
    canvasText: text("canvas_text").notNull().default(""),
    /** Whitespace tokens of the frozen notes, numbered from 0. Written once, by the freeze. */
    canvasTokens: jsonb("canvas_tokens").$type<string[]>(),
    /** Set when the session ends. The notes cannot change after it. */
    canvasFrozenAt: timestamp("canvas_frozen_at", { withTimezone: true }),
    /** Screen the learner asked their first question on: mobile is narrower than 768px. */
    deviceClass: text("device_class", { enum: DEVICE_CLASSES }),
    /** How many items the learner thinks the persona told (FR-18). Never an input of a model call. */
    guess: integer("guess"),
    /** When the guess was stored and the session became `revealed`. */
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    /** Processed output of each reveal call, written as the call completes, so no call is made twice. */
    revealParts: jsonb("reveal_parts").$type<RevealParts>().notNull().default({}),
    /** The frozen reveal. Holds what is sealed: a browser only gets what `engine/seal.ts` builds from it. */
    revealJson: jsonb("reveal_json").$type<RevealJson>(),
    /** Set with `revealJson`. After it, nothing about the reveal is written again. */
    revealReadyAt: timestamp("reveal_ready_at", { withTimezone: true }),
    /** The one runner allowed to write reveal results right now; every write checks it. */
    revealRunToken: uuid("reveal_run_token"),
    /** Runners that have claimed this reveal so far. */
    revealRunAttempt: integer("reveal_run_attempt").notNull().default(0),
    /** Refreshed while the runner lives; a stale one means the runner died and may be replaced. */
    revealHeartbeatAt: timestamp("reveal_heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FR-5: one session per persona per learner. Demo accounts are exempt, and a withdrawn
    // session does not count, so the learner can start again when the persona returns.
    uniqueIndex("session_user_persona_key")
      .on(table.userId, table.personaId)
      .where(sql`${table.isDemo} = false AND ${table.status} <> 'withdrawn'`),
  ],
);

/**
 * A line of play inside a session: the main interview, and later one replay. The replay columns
 * are empty on the main branch.
 */
export const branches = pgTable(
  "branch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["main", "replay"] }).notNull(),
    /** The last main turn the replay shares with the interview; its own turns are numbered from the next one. */
    forkAfterTurn: integer("fork_after_turn"),
    /** The item a primary replay is about. Sealed until the replay has ended. */
    targetItemId: text("target_item_id"),
    fallbackLevel: text("fallback_level", { enum: ["primary", "fallback1"] }),
    /** How the replay ended. Empty while it runs; written once, with the session's move to `done`. */
    result: text("result", { enum: REPLAY_RESULTS }),
    createdAt,
  },
  (table) => [
    uniqueIndex("branch_session_main_key").on(table.sessionId).where(sql`${table.kind} = 'main'`),
    // One replay per session, whichever way it was started or skipped.
    uniqueIndex("branch_session_replay_key").on(table.sessionId).where(sql`${table.kind} = 'replay'`),
  ],
);

export const turns = pgTable(
  "turn",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    /** Turn 0 is the persona's opening line and has no learner text. */
    index: integer("index").notNull(),
    /** Chosen by the browser for one question, so a resend finds the turn it already wrote. */
    turnKey: uuid("turn_key"),
    learnerText: text("learner_text"),
    /** Whitespace tokens of the line, numbered from 0; quotes are cut by these indexes. */
    learnerTokens: jsonb("learner_tokens").$type<string[]>(),
    personaText: text("persona_text").notNull(),
    personaTokens: jsonb("persona_tokens").$type<string[]>().notNull(),
    /** Call 1 output as returned, before any check. */
    analysisJson: jsonb("analysis_json").$type<RawAnalysis>(),
    /** What code made of it: checked analysis, corrections, rules run, item opened, openness. */
    decisionJson: jsonb("decision_json").$type<TurnDecision>(),
    /** Verdict about this persona turn. Written in the transaction of the next turn. */
    verdictJson: jsonb("verdict_json").$type<Verdict>(),
    /** Item whose hook the persona was asked to drop in this turn. */
    hookSelected: text("hook_selected"),
    /** True when the verdict found a do-not-assert violation in this persona turn. */
    flagged: boolean("flagged").notNull().default(false),
    /** Replay turns of a leading-question replay: the judge's own label for the learner's question. */
    judgeLabel: text("judge_label", { enum: LABELS }),
    latencyMs: integer("latency_ms"),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.index] }),
    unique("turn_session_turn_key_key").on(table.sessionId, table.turnKey),
    index("turn_session_idx").on(table.sessionId),
  ],
);

/**
 * Engine state after each turn. Append-only, with one exception: `ledger` and `disclosed` of
 * snapshot t are updated once, by the verdict that arrives in the transaction of turn t+1.
 */
export const snapshots = pgTable(
  "snapshot",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    unlocked: jsonb("unlocked").$type<UnlockedItem[]>().notNull(),
    ledger: jsonb("ledger").$type<HookEntry[]>().notNull(),
    disclosed: jsonb("disclosed").$type<UnlockedItem[]>().notNull(),
    openness: integer("openness").notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.branchId, table.index] }), index("snapshot_session_idx").on(table.sessionId)],
);

/** Payload per kind of action a learner can start before sign-in or consent. */
export type PendingActionPayload = { kind: "start_session"; personaId: string };

/**
 * A write the learner asked for before they could perform it. The row id is the single-use
 * token (kept in an httpOnly cookie), so nothing in a URL can trigger the write.
 */
export const pendingActions = pgTable("pending_action", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Set when the learner was already signed in; a guest's action is owned by the cookie alone. */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<PendingActionPayload>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
});

export const LLM_SCOPES = ["session", "generation", "eval", "moderation"] as const;
export type LlmScope = (typeof LLM_SCOPES)[number];

/** One row per model attempt, including failures and technical retries. */
export const llmCalls = pgTable(
  "llm_call",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope", { enum: LLM_SCOPES }).notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    /** Set for the calls of a replay turn, whose turn numbers repeat those of the main interview. */
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    /** The turn the call belongs to, so the calls of one turn can be counted. */
    turnIndex: integer("turn_index"),
    attemptId: uuid("attempt_id"),
    role: text("role").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    tokensCached: integer("tokens_cached").notNull(),
    tokensReasoning: integer("tokens_reasoning").notNull(),
    costUsd: numeric("cost_usd", { precision: 14, scale: 9, mode: "number" }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    /** 1 for the first try, 2 and 3 for technical retries. */
    attempt: integer("attempt").notNull(),
    ok: boolean("ok").notNull(),
    createdAt,
  },
  (table) => [index("llm_call_scope_created_at_idx").on(table.scope, table.createdAt)],
);

/**
 * Ledger for spend whose `llm_call` rows no longer exist, so caps always read
 * `llm_call` + `daily_spend`. `day` is the calendar date in UTC+7.
 */
export const dailySpend = pgTable(
  "daily_spend",
  {
    day: date("day").notNull(),
    scope: text("scope", { enum: LLM_SCOPES }).notNull(),
    usd: numeric("usd", { precision: 14, scale: 9, mode: "number" }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.scope] })],
);

export const MODERATION_DECISIONS = ["refuse", "allow_with_constraints", "allow"] as const;
export const REFUSAL_CODES = ["real_person", "real_org_or_brand", "sexual", "illegal", "harassment", "other"] as const;
export const MODERATION_CONSTRAINTS = ["adult_persona_only", "no_crisis_content", "service_use_only"] as const;
export type ModerationConstraint = (typeof MODERATION_CONSTRAINTS)[number];

export const ATTEMPT_OUTCOMES = ["refused", "running", "passed", "failed", "system_error"] as const;
export const ATTEMPT_STEPS = ["generating", "validating"] as const;
export type AttemptStep = (typeof ATTEMPT_STEPS)[number];

/** Why a generated scenario was not given to its learner (FR-54). Each code has one fixed sentence on Màn 11. */
export const FAILURE_CODES = ["invalid", "unsafe_output", "system_error"] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** What the checks of an attempt found, for the operator. Holds no learner text. */
export type AttemptReport = {
  /** `validate` violations of the last generated file, as messages. */
  violations?: string[];
  /** What the output safety check objected to. */
  unsafe?: { field: string; kind: string; reason: string }[];
  /** What stopped an attempt that ended as a system error. */
  error?: string;
};

/**
 * One request to create a custom topic (FR-52 to FR-56). A refused request has no topic and no
 * session. The limits of FR-56 are counted from these rows.
 */
export const generationAttempts = pgTable(
  "generation_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    /** Set when the attempt passed: the scenario the session then plays. */
    scenarioId: uuid("scenario_id").references(() => scenarios.id, { onDelete: "set null" }),
    topicText: text("topic_text").notNull(),
    focus: text("focus", { enum: FOCUSES }).notNull(),
    /** The learner's own words about what to practise. Read by the moderation call and by nothing else. */
    focusRaw: text("focus_raw").notNull().default(""),
    moderationDecision: text("moderation_decision", { enum: MODERATION_DECISIONS }).notNull(),
    reasonCode: text("reason_code", { enum: REFUSAL_CODES }),
    constraints: jsonb("constraints").$type<ModerationConstraint[]>().notNull().default([]),
    outcome: text("outcome", { enum: ATTEMPT_OUTCOMES }).notNull(),
    failureCode: text("failure_code", { enum: FAILURE_CODES }),
    step: text("step", { enum: ATTEMPT_STEPS }),
    /** The scenario once it passed `validate`, kept so a later run does not generate it again. Sealed like any scenario. */
    draft: jsonb("draft").$type<Scenario>(),
    /** The one runner allowed to write this attempt; every write checks it and that the attempt still runs. */
    runToken: uuid("run_token"),
    /** Runs that have claimed this attempt so far. */
    runAttempt: integer("run_attempt").notNull().default(0),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /** The submit request's start plus ten minutes. Past it the attempt is a system error. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    /** Held of the daily generation budget while the attempt runs. */
    costReservedUsd: numeric("cost_reserved_usd", { precision: 14, scale: 9, mode: "number" }).notNull().default(0),
    /** What the attempt spent. Written once, when it stops running. */
    costActualUsd: numeric("cost_actual_usd", { precision: 14, scale: 9, mode: "number" }).notNull().default(0),
    report: jsonb("report").$type<AttemptReport>().notNull().default({}),
    createdAt,
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // FR-56: one running attempt per learner, whatever two parallel requests do.
    uniqueIndex("generation_attempt_running_key").on(table.userId).where(sql`${table.outcome} = 'running'`),
    uniqueIndex("generation_attempt_session_key").on(table.sessionId),
    index("generation_attempt_user_idx").on(table.userId, table.createdAt),
  ],
);

/**
 * What stays of a deleted account, so that deleting it and signing in again resets no limit. The
 * key is a keyed hash of the Google account; the row holds counters and persona ids only: no
 * email, name, text, user id or session id.
 */
export const quotaTombstones = pgTable("quota_tombstone", {
  key: text("key").primaryKey(),
  /** Personas the account had a session with that counted for the one-session rule. */
  playedPersonaIds: jsonb("played_persona_ids").$type<string[]>().notNull().default([]),
  /** The custom-topic limits of FR-56, carried over a deletion. */
  freeCustomUsed: boolean("free_custom_used").notNull().default(false),
  customFailedCount: integer("custom_failed_count").notNull().default(0),
  /** The day (UTC+7) the three counters below belong to; on any other day they count as zero. */
  customDay: date("custom_day"),
  customAttempts: integer("custom_attempts").notNull().default(0),
  customRefusals: integer("custom_refusals").notNull().default(0),
  customSpendUsd: numeric("custom_spend_usd", { precision: 14, scale: 9, mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** FR-38 events, written by the server only. Demo sessions write none. */
export const events = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("event_name_at_idx").on(table.name, table.at)],
);

/** `custom_topics`: the learner used their free custom scenario and asked to be told when more can be made. */
export const WAITLIST_CONTEXTS = ["no_more_personas", "custom_topics"] as const;
export type WaitlistContext = (typeof WAITLIST_CONTEXTS)[number];

/** FR-32: a learner who asked to be told about new content. One row per learner and context. */
export const waitlist = pgTable(
  "waitlist",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    context: text("context", { enum: WAITLIST_CONTEXTS }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.context] })],
);

/** Operator settings changed with `pnpm il config set`. A missing row means the default in code. */
export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row each time an operator opens learner data. Rows outlive the data they point at. */
export const adminAccessLog = pgTable("admin_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminEmail: text("admin_email").notNull(),
  channel: text("channel", { enum: ["console", "cli"] }).notNull(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** A note a practising BA or PM left after reading the transcripts of a run. */
export type ReaderNote = { reader_type: string; initials: string; note: string };

/** One evaluation of one scenario version. Only a `full` run that is `done` can satisfy the publish gate. */
export const evalRuns = pgTable(
  "eval_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    profile: text("profile", { enum: ["quick", "full", "reduced"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "failed", "done"] }).notNull().default("running"),
    /** Learner turns per episode. */
    turns: integer("turns").notNull(),
    reportJson: jsonb("report_json").$type<EvalReport>(),
    costEstimateUsd: numeric("cost_estimate_usd", { precision: 14, scale: 9, mode: "number" }).notNull(),
    costActualUsd: numeric("cost_actual_usd", { precision: 14, scale: 9, mode: "number" }).notNull().default(0),
    readerNotes: jsonb("reader_notes").$type<ReaderNote[]>().notNull().default([]),
    /** Why a `failed` run stopped. `isolation` is a defect in the engine: such a run is never resumed. */
    failureReason: text("failure_reason", { enum: ["isolation", "model"] }),
    createdAt,
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("eval_run_scenario_idx").on(table.scenarioId)],
);

/**
 * A finished episode of a run, written as soon as it ends, so a run that stops halfway (rate
 * limit, closed terminal) is resumed without paying for these again.
 */
export const evalEpisodes = pgTable(
  "eval_episode",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    resultJson: jsonb("result_json").$type<EpisodeResult>().notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.runId, table.key] })],
);

/** A possible leak the judge or the secret-term match found in an episode of the engine. */
export const leakFlags = pgTable(
  "leak_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evalRunId: uuid("eval_run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    episode: text("episode").notNull(),
    turn: integer("turn").notNull(),
    itemId: text("item_id").notNull(),
    kind: text("kind").$type<LeakKind>().notNull(),
    excerpt: text("excerpt").notNull(),
    allowedHooks: jsonb("allowed_hooks").$type<string[]>().notNull(),
    judgeReason: text("judge_reason").notNull(),
    createdAt,
  },
  (table) => [index("leak_flag_run_idx").on(table.evalRunId)],
);

export const ADJUDICATION_VERDICTS = ["leak", "not_leak"] as const;

/** One admin's ruling on a flag. An admin rules once per flag. */
export const adjudications = pgTable(
  "adjudication",
  {
    flagId: uuid("flag_id")
      .notNull()
      .references(() => leakFlags.id, { onDelete: "cascade" }),
    adminEmail: text("admin_email").notNull(),
    verdict: text("verdict", { enum: ADJUDICATION_VERDICTS }).notNull(),
    reason: text("reason").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.flagId, table.adminEmail] })],
);

/** Outcome of the automatic check of one fixed string (FR-36). */
export type StringCheckResult = { ok: boolean; problems: string[] };

/**
 * The check and the human decision for one fixed string, keyed by a hash of its text: a string
 * that is edited has no row, so it is neither checked nor approved until both are done again.
 */
export const stringApprovals = pgTable(
  "string_approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope", { enum: ["persona", "product"] }).notNull(),
    /** Empty for product strings. */
    personaId: text("persona_id").notNull().default(""),
    stringKey: text("string_key").notNull(),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
    fr36Result: jsonb("fr36_result").$type<StringCheckResult>().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    decision: text("decision", { enum: ["approved", "returned"] }),
    approverEmail: text("approver_email"),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [unique("string_approval_text_key").on(table.scope, table.personaId, table.stringKey, table.textHash)],
);
