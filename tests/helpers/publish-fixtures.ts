import { getDb } from "@/db/client";
import { approveVersion, createEvalRun, finishEvalRun, finishQaRun, latestLeanRun, saveEpisode } from "@/db/repo/eval";
import { claimEvalRun, queueLeanRun } from "@/db/repo/eval-jobs";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { THRESHOLDS } from "@/eval/qa/thresholds";
import type { QaReport } from "@/eval/qa/types";
import { buildReport } from "@/eval/report";
import { episodeSpecs } from "@/eval/run-eval";
import type { EpisodeResult } from "@/eval/types";
import { productStrings } from "@/strings/product-strings";
import { runApproveStrings, runCheckStrings } from "../../cli/commands/strings";
import { repeat, roleModels } from "./eval-models";

const silent = { out: () => {}, err: () => {} };

export const CLEAN_STRING = { structured: { real_user_claim: false, reason: "ok" } };

/** A Call 1 reply that labels a question `open`, written out so this file does not load a scenario. */
const OPEN_QUESTION = {
  structured: {
    prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] },
    question_type: "other",
    label: "open",
    grounded_turn_id: null,
    introduced_span: null,
    hook_id: null,
    topic_tags: [],
  },
};

/** Replies for a clean check of chị Thu's 24 strings: one claim check each, one classifier call per sample question. */
export const cleanPersonaCheck = () => roleModels({ STRING_CHECK: repeat(24, CLEAN_STRING), ANALYSIS: repeat(11, OPEN_QUESTION) });

export async function newestVersion(personaId = "chi-thu") {
  return (await getScenarioByPersona(getDb(), personaId))!.scenario;
}

/**
 * A finished full run of the newest version: every episode stored, the given leak flags, and a
 * report in which every threshold is met. Each engine episode ran the reveal, with the verifier
 * disagreeing with 1 unlock in 25; with `verifierMeasured: false` no episode ran it.
 */
export async function seedFullRun(flags: { episode: string; turn: number }[] = [], options = { verifierMeasured: true }) {
  const db = getDb();
  const scenario = await newestVersion();
  const run = await createEvalRun(db, { scenarioId: scenario.id, version: scenario.version, profile: "full", turns: 30, costEstimateUsd: 25 });
  const episodes: EpisodeResult[] = episodeSpecs("full").map((spec) => ({
    key: spec.key,
    kind: spec.kind,
    attackId: spec.attackId,
    turns: [
      { index: 1, question: "Câu hỏi?", personaText: "Câu trả lời.", label: "open", questionType: "open", unlockedItemId: null, hookSelected: "paid-app", hookDropped: true },
    ],
    openedItemIds: spec.kind === "good" ? scenario.content.items.slice(0, 7).map((item) => item.id) : spec.kind === "bad" ? ["money-home"] : [],
    flags: flags
      .filter((flag) => flag.episode === spec.key)
      .map((flag) => ({ turn: flag.turn, itemId: "shame", kind: "content" as const, excerpt: "Câu trả lời.", allowedHooks: ["Hook được phép."], reason: "Lý do của judge." })),
    contradictions: [],
    ...(options.verifierMeasured && spec.reveal ? { verifier: { unlock: { agree: 24, disagree: 1 } } } : {}),
    costUsd: 0.5,
  }));
  for (const episode of episodes) await saveEpisode(db, run.id, episode);
  const report = buildReport(scenario.content, { profile: "full", turns: 30, estimateUsd: 25 }, episodes);
  await finishEvalRun(db, run.id, report, episodes);
  return run;
}

/** Checks and approves every fixed string of chị Thu and of the product, through the commands. */
export async function approveEverything(operator: () => string) {
  await runCheckStrings(["chi-thu"], silent, getDb(), cleanPersonaCheck().llmDeps);
  await runCheckStrings(["product"], silent, getDb(), roleModels({ STRING_CHECK: repeat(productStrings().length, CLEAN_STRING) }).llmDeps);
  await runApproveStrings(["chi-thu", "approve", "--all"], silent, getDb(), operator);
  await runApproveStrings(["product", "approve", "--all"], silent, getDb(), operator);
}

/**
 * A finished lean run of the newest version, written the way the job writes it: one leak, and so
 * one flag, per item in `leaks`, each on its own probe reply. Every threshold but `no_leaks` is met
 * unless `unmet` names more.
 */
export async function seedLeanRun(leaks: string[] = [], options: { unmet?: string[] } = {}) {
  const db = getDb();
  const scenario = await newestVersion();
  const run = (await queueLeanRun(db, { scenarioId: scenario.id, version: scenario.version, capUsd: 0.1, requestedBy: null }))!;
  const { token } = (await claimEvalRun(db, run.id))!;
  const failing = new Set([...(options.unmet ?? []), ...(leaks.length > 0 ? ["no_leaks"] : [])]);
  const replies = leaks.map((_, index) => ({ id: `R${index + 1}`, action: "attack", question: "Câu hỏi?", personaText: "Câu trả lời.", openItemIds: [], allowedHookItemIds: [] }));
  const report: QaReport = {
    profile: "lean",
    version: scenario.version,
    thresholds: THRESHOLDS.map((row) => ({ key: row.key, label: row.label, met: !failing.has(row.key), detail: failing.has(row.key) ? "thiếu" : "đạt" })),
    warnings: [],
    publicLeaks: [],
    risks: [],
    observations: replies.length > 0 ? [{ replies } as unknown as QaReport["observations"][number]] : [],
    leaks: leaks.map((itemId, index) => ({ replyId: `R${index + 1}`, action: "attack", itemId, kind: "topic" as const, excerpt: "Câu trả lời." })),
    findings: [],
    rounds: [{ decision: "done", actions: 0 }],
    cost: { capUsd: 0.1, actualUsd: 0.05, calls: 40 },
  };
  await finishQaRun(db, { runId: run.id, token, report, costActualUsd: 0.05 });
  return run;
}

/** An admin's approval of the newest version on its newest lean run, as `il approve` writes it. */
export async function approveNewest(adminEmail = "thanh@example.com") {
  const scenario = await newestVersion();
  const run = (await latestLeanRun(getDb(), scenario.id))!;
  return approveVersion(getDb(), { scenarioId: scenario.id, version: scenario.version, evalRunId: run.id, adminEmail, note: "Đã đọc báo cáo." });
}
