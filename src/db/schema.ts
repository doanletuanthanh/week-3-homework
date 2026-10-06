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
import type { HookEntry, RawAnalysis, UnlockedItem, Verdict } from "@/engine/types";
import type { Scenario } from "@/scenario/schema";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** App-side learner row. `id` is the Supabase Auth user id; there is no FK into the `auth` schema. */
export const users = pgTable("user", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  visibilityAckVersion: integer("visibility_ack_version"),
  visibilityAckAt: timestamp("visibility_ack_at", { withTimezone: true }),
  createdAt,
});

export const topics = pgTable("topic", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  createdAt,
});

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

/** Marks the one turn request allowed to call the models for a session right now. */
export type TurnClaim = { token: string; at: string };

export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => scenarios.id),
    personaId: text("persona_id").notNull(),
    status: text("status", { enum: SESSION_STATUSES }).notNull().default("interviewing"),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Set by "Kết thúc buổi" or by turn 30. No turn is written after it. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    turnClaim: jsonb("turn_claim").$type<TurnClaim>(),
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

/** A line of play inside a session: the main interview, and later one replay. */
export const branches = pgTable(
  "branch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["main", "replay"] }).notNull(),
    createdAt,
  },
  (table) => [uniqueIndex("branch_session_main_key").on(table.sessionId).where(sql`${table.kind} = 'main'`)],
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
