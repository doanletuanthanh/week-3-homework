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

/** What the skeleton needs from a scenario. Phase 2 replaces this with the full validated schema. */
export type ScenarioContent = {
  persona: { displayName: string; tagline: string; identity: string };
  researchGoal: string;
  openingLine: string;
  surfaceFacts: string[];
};

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
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    content: jsonb("content").$type<ScenarioContent>().notNull(),
    createdAt,
  },
  (table) => [unique("scenario_persona_version_key").on(table.personaId, table.version)],
);

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
    status: text("status", { enum: ["interviewing"] }).notNull().default("interviewing"),
    isDemo: boolean("is_demo").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FR-5: one session per persona per learner; demo accounts are exempt.
    uniqueIndex("session_user_persona_key").on(table.userId, table.personaId).where(sql`${table.isDemo} = false`),
  ],
);

export const turns = pgTable(
  "turn",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Turn 0 is the persona's opening line and has no learner text. */
    index: integer("index").notNull(),
    learnerText: text("learner_text"),
    personaText: text("persona_text").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.index] })],
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
