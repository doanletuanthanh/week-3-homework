import { MAX_TURNS } from "@/config/limits";
import { costUsd } from "@/llm/pricing";
import type { Role, RoleSpec } from "@/llm/roles";
import type { Scenario } from "@/scenario/schema";
import { ATTACKS } from "./attacks";
import { IsolationError } from "./isolation";
import { runEpisode, type EpisodeOptions } from "./run-episode";
import type { EpisodeResult, EpisodeSpec, EvalProfile } from "./types";

/** Learner turns per episode of a reduced run (custom topics). */
export const REDUCED_TURNS = 10;
const REDUCED_ATTACKS = 5;

const numbered = (name: string, index: number, width = 1) => `${name}-${String(index + 1).padStart(width, "0")}`;

/**
 * The episodes of a run (FR-34). `quick` is one good and one bad run, for tuning. `full` is three
 * of each, the 20 attacks on the engine, and the same 20 attacks on the prompt-only baseline.
 * `reduced` is the shape a generated scenario is checked with.
 */
export function episodeSpecs(profile: EvalProfile, turns: number = profile === "reduced" ? REDUCED_TURNS : MAX_TURNS): EpisodeSpec[] {
  const learners = (count: number): EpisodeSpec[] =>
    (["good", "bad"] as const).flatMap((kind) => Array.from({ length: count }, (_, index) => ({ key: numbered(kind, index), kind, turns })));
  const attacks = (kind: "adversarial" | "baseline", count: number): EpisodeSpec[] =>
    ATTACKS.slice(0, count).map((attack, index) => ({ key: numbered(kind, index, 2), kind, attackId: attack.id, turns }));

  if (profile === "quick") return learners(1);
  if (profile === "reduced") return [...learners(1), ...attacks("adversarial", REDUCED_ATTACKS)];
  return [...learners(3), ...attacks("adversarial", ATTACKS.length), ...attacks("baseline", ATTACKS.length)];
}

/**
 * Tokens one call is assumed to use, averaged over a 30-turn episode. Not measured: these only
 * feed the estimate printed before a run, and the report shows the actual spend next to it.
 */
const ASSUMED_TOKENS: Record<"EVAL_INTERVIEWER" | "ANALYSIS" | "PERSONA" | "REPLAY_JUDGE" | "EVAL_LEAK_JUDGE", { input: number; output: number }> = {
  EVAL_INTERVIEWER: { input: 1_800, output: 150 },
  ANALYSIS: { input: 3_200, output: 500 },
  PERSONA: { input: 2_600, output: 300 },
  REPLAY_JUDGE: { input: 2_800, output: 300 },
  EVAL_LEAK_JUDGE: { input: 7_000, output: 1_200 },
};

/** Model calls and cost a run is expected to need, from its episodes and the configured models. */
export function estimateRun(specs: EpisodeSpec[], roleSpec: (role: Role) => RoleSpec): { calls: number; usd: number } {
  const calls: Partial<Record<keyof typeof ASSUMED_TOKENS, number>> = {};
  const add = (role: keyof typeof ASSUMED_TOKENS, count: number) => (calls[role] = (calls[role] ?? 0) + count);
  for (const spec of specs) {
    add("EVAL_INTERVIEWER", spec.turns);
    add("PERSONA", spec.turns);
    add("EVAL_LEAK_JUDGE", 1);
    if (spec.kind !== "baseline") {
      add("ANALYSIS", spec.turns);
      add("REPLAY_JUDGE", 1);
    }
  }
  let total = 0;
  let usd = 0;
  for (const [role, count] of Object.entries(calls) as [keyof typeof ASSUMED_TOKENS, number][]) {
    const { input, output } = ASSUMED_TOKENS[role];
    total += count;
    usd += count * costUsd(roleSpec(role).model, { inputTokens: input, cachedInputTokens: 0, outputTokens: output, reasoningTokens: 0 });
  }
  return { calls: total, usd };
}

export type RunEpisodesOptions = EpisodeOptions & {
  /** Episodes played at the same time. */
  concurrency: number;
  /** Called as each episode ends, before the next one starts: the place to store it. */
  onEpisode?: (result: EpisodeResult) => Promise<void>;
};

/**
 * Plays the episodes with a limit on how many run at once. The first failure stops new episodes
 * from starting; the ones in flight finish and are still handed to `onEpisode`, so their cost is
 * not paid twice when the run is resumed. Then the failure is thrown; when several episodes
 * failed, an isolation failure is the one reported.
 */
export async function runEpisodes(scenario: Scenario, specs: EpisodeSpec[], options: RunEpisodesOptions): Promise<EpisodeResult[]> {
  const { concurrency, onEpisode, ...episodeOptions } = options;
  const queue = [...specs];
  const results: EpisodeResult[] = [];
  const failures: unknown[] = [];

  const worker = async () => {
    for (let spec = queue.shift(); spec && failures.length === 0; spec = queue.shift()) {
      try {
        const result = await runEpisode(scenario, spec, episodeOptions);
        await onEpisode?.(result);
        results.push(result);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, specs.length)) }, worker));
  // A broken context is a defect, not an outage: it is never hidden behind another episode's failure.
  if (failures.length > 0) throw failures.find((error) => error instanceof IsolationError) ?? failures[0];
  return results;
}
