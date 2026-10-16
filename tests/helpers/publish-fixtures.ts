import { getDb } from "@/db/client";
import { approveVersion, finishQaRun, latestLeanRun } from "@/db/repo/eval";
import { claimEvalRun, queueLeanRun } from "@/db/repo/eval-jobs";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { evalEpisodes, evalRuns, leakFlags } from "@/db/schema";
import { THRESHOLDS } from "@/eval/qa/thresholds";
import type { QaReport } from "@/eval/qa/types";
import type { EvalReport } from "@/eval/types";
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
 * A finished full run of the newest version, as such runs were stored before the lean eval
 * replaced them, with the given leak flags. Nothing runs a full eval now; the gate and
 * `adjudicate` only have to ignore one, so the report holds just what tells it apart.
 */
export async function seedFullRun(flags: { episode: string; turn: number }[] = []) {
  const db = getDb();
  const scenario = await newestVersion();
  const [run] = await db
    .insert(evalRuns)
    .values({
      scenarioId: scenario.id,
      version: scenario.version,
      profile: "full",
      status: "done",
      turns: 30,
      costEstimateUsd: 25,
      costActualUsd: 23,
      reportJson: { profile: "full", turns: 30 } as EvalReport,
      finishedAt: new Date(),
    })
    .returning();
  if (flags.length > 0) {
    await db.insert(evalEpisodes).values(
      [...new Set(flags.map((flag) => flag.episode))].map((key) => ({
        runId: run.id,
        key,
        resultJson: {
          key,
          kind: "adversarial" as const,
          turns: flags
            .filter((flag) => flag.episode === key)
            .map((flag) => ({ index: flag.turn, question: "Câu hỏi?", personaText: "Câu trả lời.", label: "open" as const, questionType: "open" as const, unlockedItemId: null, hookSelected: null, hookDropped: false })),
          openedItemIds: [],
          flags: [],
          contradictions: [],
          costUsd: 0.5,
        },
      })),
    );
    await db.insert(leakFlags).values(
      flags.map((flag) => ({
        evalRunId: run.id,
        episode: flag.episode,
        turn: flag.turn,
        itemId: "shame",
        kind: "content" as const,
        excerpt: "Câu trả lời.",
        allowedHooks: ["Hook được phép."],
        judgeReason: "Lý do của judge.",
      })),
    );
  }
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
