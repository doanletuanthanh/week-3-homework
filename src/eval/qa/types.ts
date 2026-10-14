import type { Label } from "@/engine/types";

/**
 * Where an action came from. The floor always runs and cannot be removed by the agent; `plan`
 * and `reflect` are what the agent added after reading the scenario or the first results.
 */
export type ActionSource = "floor" | "plan" | "reflect";

/**
 * One thing the QA agent can do to a persona through the engine. Every action is plain data:
 * the planner and the reflector choose actions, code runs them.
 */
export type Action =
  /** Call 1 only, on a state where the item is one question away: does the question open it? */
  | { tool: "check_unlock"; itemId: string; question: string; source: ActionSource }
  /** A whole turn on that state: does the item open, and does the persona then tell it? */
  | { tool: "deliver_item"; itemId: string; question: string; source: ActionSource }
  /** A scripted attack from `ATTACKS`, its opening turns only, from a fresh session. */
  | { tool: "attack"; attackId: string; source: ActionSource }
  /** One question the agent wrote, from a fresh session or from an item's ready state. */
  | { tool: "probe_question"; itemId: string | null; question: string; source: ActionSource };

export type ToolName = Action["tool"];

/** A persona reply the reply judge reads, with what it was allowed to say at that point. */
export type ProbeReply = {
  /** Stable within a run: `R1`, `R2`, ... */
  id: string;
  /** Key of the action that produced it. */
  action: string;
  question: string;
  personaText: string;
  /** Items open after this turn: telling them is allowed. */
  openItemIds: string[];
  /** Items whose hook line the persona had said or was asked to say: saying that line is allowed. */
  allowedHookItemIds: string[];
};

/** What running one action showed, before the reply judge has read its replies. */
export type Observation = {
  key: string;
  action: Action;
  /** Item the decision opened on the (last) turn; null when none did. */
  openedItemId: string | null;
  /**
   * Set when a probe that should have opened its item did not, and was run once more: what the
   * second run opened. Call 1 is not deterministic; one miss in two is instability, two is a defect.
   */
  retryOpenedItemId?: string | null;
  label: Label | null;
  opennessBefore: number | null;
  opennessAfter: number | null;
  replies: ProbeReply[];
};

/** A probe's result as the tool cache keeps it: reply ids are the run's own, so a reused reply gets a new one. */
export type CachedToolResult = Omit<Observation, "key" | "action" | "replies" | "retryOpenedItemId"> & { replies: Omit<ProbeReply, "id" | "action">[] };

/** The reply judge's reading of one reply, in scenario item ids. */
export type ReplyReading = {
  /** Items whose content the reply told. */
  told: string[];
  /** Items whose topic the reply raised beyond the hook lines it was allowed. */
  topics: string[];
};

/** A leak: a reply told or raised an item that was not open at that point. */
export type Leak = { replyId: string; action: string; itemId: string; kind: "content" | "topic"; excerpt: string };

/** Advice the agent gives about the scenario. It never blocks publishing on its own. */
export type Finding = { itemId: string | null; field: string | null; severity: "info" | "warning"; note: string };

export type QaThreshold = { key: string; label: string; met: boolean; detail: string };

export type QaReport = {
  profile: "lean";
  /** Scenario version the run evaluated. */
  version: number;
  thresholds: QaThreshold[];
  /** Checks that inform the admin without blocking: for example a paraphrase that did not open its item. */
  warnings: string[];
  /** `content` blocks publishing; `topic_hint` is reported as a warning. */
  publicLeaks: { field: string; itemId: string; kind: "content" | "topic_hint"; quote: string; reason: string }[];
  risks: { itemId: string; risk: "low" | "medium" | "high"; reason: string }[];
  observations: (Observation & { readings: Record<string, ReplyReading> })[];
  leaks: Leak[];
  findings: Finding[];
  /** What the agent decided in each reflect round, in order. */
  rounds: { decision: "done" | "probe_more" | "budget" | "max_rounds"; actions: number }[];
  cost: { capUsd: number; actualUsd: number; calls: number };
  /** Set when the report is the one of an earlier run with the very same inputs, returned without a call. */
  reusedFrom?: string;
};

/** The key of an action: equal actions share it, so the agent cannot pay twice for the same probe. */
export function actionKey(action: Action): string {
  return JSON.stringify(action, Object.keys(action).filter((name) => name !== "source").sort());
}
