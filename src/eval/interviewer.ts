import { MAX_QUESTION_CHARS } from "@/config/limits";
import type { TranscriptLine } from "@/engine/contexts";
import { LlmCallError, callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildInterviewerMessages, interviewerSchema, type InterviewerProfile } from "@/llm/prompts/eval-interviewer";
import type { Scenario } from "@/scenario/schema";
import type { Attack } from "./attacks";

export type InterviewerCallOptions = {
  scope: CallScope;
  meta: Record<string, string | number>;
  llmDeps?: Partial<CallModelDeps>;
};

/** A model reply made into something the turn API would accept: one line, no wrapping quotes, within the length limit. */
export function toQuestion(reply: string): string {
  const oneLine = reply.replace(/\s+/gu, " ").trim();
  const unquoted = oneLine.replace(/^["“'](.*)["”']$/u, "$1").trim();
  return unquoted.slice(0, MAX_QUESTION_CHARS).trim();
}

/**
 * The simulated learner's next question. It is given what a learner sees and nothing else: the
 * research goal, the persona's name and tagline, and the conversation so far. An adversarial
 * episode starts with the attack's scripted turns and lets the model continue from there.
 */
export async function nextQuestion(
  profile: InterviewerProfile,
  input: { scenario: Scenario; transcript: TranscriptLine[]; turnIndex: number; attack?: Attack },
  options: InterviewerCallOptions,
): Promise<string> {
  const { scenario, transcript, turnIndex, attack } = input;
  const scripted = attack?.opening[turnIndex - 1];
  if (scripted !== undefined) return scripted.slice(0, MAX_QUESTION_CHARS);

  const messages = buildInterviewerMessages(
    profile,
    {
      researchGoal: scenario.research_goal,
      persona: { displayName: scenario.persona.display_name, tagline: scenario.persona.tagline },
      transcript,
    },
    attack?.goal,
  );
  const reply = await callModel(
    "EVAL_INTERVIEWER",
    messages,
    { schema: interviewerSchema, meta: { ...options.meta, turn_index: turnIndex }, scope: options.scope },
    options.llmDeps,
  );
  const question = toQuestion(reply.output.question);
  // Nothing left once the quotes are gone: a failed model call like any other, so the run stops cleanly and can be resumed.
  if (!question) throw new LlmCallError("EVAL_INTERVIEWER", reply.attempts, new Error(`empty question at turn ${turnIndex}`));
  return question;
}
