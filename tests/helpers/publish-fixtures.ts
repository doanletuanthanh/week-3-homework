import { getDb } from "@/db/client";
import { createEvalRun, finishEvalRun, saveEpisode } from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
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
