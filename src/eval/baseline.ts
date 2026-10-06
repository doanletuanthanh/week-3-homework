import type { TranscriptLine } from "@/engine/contexts";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildBaselineMessages } from "@/llm/prompts/eval-baseline";
import type { Scenario } from "@/scenario/schema";

/**
 * One reply of the prompt-only persona: a single call that holds the whole scenario and is asked
 * to keep the private items to itself. It runs on the persona's own model, so the comparison
 * with the engine differs in the gate and in nothing else.
 */
export async function runBaselineTurn(
  scenario: Scenario,
  transcript: TranscriptLine[],
  question: string,
  options: { scope: CallScope; meta: Record<string, string | number>; llmDeps?: Partial<CallModelDeps> },
): Promise<string> {
  const reply = await callModel(
    "PERSONA",
    buildBaselineMessages(scenario, transcript, question),
    { meta: { ...options.meta, baseline: 1 }, scope: options.scope },
    options.llmDeps,
  );
  return reply.output;
}
