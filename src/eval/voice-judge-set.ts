import { z } from "zod";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { VOICE_TEXT_KINDS, VOICE_VERDICTS, buildVoiceJudgeMessages, voiceJudgeSchema, type VoiceTextKind, type VoiceVerdict } from "@/llm/prompts/eval-voice-judge";
import { rate, type JudgementOptions, type SetScore } from "./judgement-eval";
import { mapPooled } from "./pool";

/**
 * `voice-judge`: one text per line, with whether it reads as a real person or as model-written.
 * Plain speech and identity cases come from the hand-written library; plain feedback cases,
 * which the library has none of, and every AI-voice case are written by hand.
 */
export const voiceCaseSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(Object.keys(VOICE_TEXT_KINDS) as [VoiceTextKind, ...VoiceTextKind[]]),
  text: z.string().min(1),
  expected: z.enum(VOICE_VERDICTS),
  note: z.string().optional(),
});
export type VoiceCase = z.infer<typeof voiceCaseSchema>;

/** The gate: model-written texts the judge lets through, and hand-written ones it calls model-written. */
export const MAX_AI_VOICE_PASSED = 0.1;
export const MAX_PLAIN_FLAGGED = 0.1;
/**
 * Below NFR-7's 100: each case is one short text with a two-way label, so 20 a side, with hard
 * cases on both (a named feeling tied to an event; an event that ends in a moral), already
 * separates a judge that reads the voice from one that matches cue words.
 */
export const MIN_VOICE_SET_SIZE = 40;

export type VoiceRow = { id: string; expected: VoiceVerdict; predicted: VoiceVerdict };

export function scoreVoiceSet(rows: VoiceRow[]): SetScore {
  const aiVoice = rows.filter((row) => row.expected === "ai_voice");
  const plain = rows.filter((row) => row.expected === "plain");
  return {
    size: rows.length,
    minSize: MIN_VOICE_SET_SIZE,
    rates: [
      rate("ai_voice_passed", "Văn kiểu AI bị coi là lời người thật", aiVoice.filter((row) => row.predicted === "plain").length, aiVoice.length, MAX_AI_VOICE_PASSED),
      rate("plain_flagged", "Lời viết tay bị coi là văn kiểu AI", plain.filter((row) => row.predicted === "ai_voice").length, plain.length, MAX_PLAIN_FLAGGED),
    ],
    mismatches: rows.filter((row) => row.predicted !== row.expected).map((row) => `${row.id}: gán tay ${row.expected}, máy ${row.predicted}`),
  };
}

export type VoiceReading = { voice: VoiceVerdict; reason: string };

/** One reading per text, by the eval role STRING_CHECK: the role that already reads fixed text for eval. */
export async function judgeVoice(
  texts: { kind: VoiceTextKind; text: string }[],
  call: { scope: CallScope; meta: Record<string, string | number>; llmDeps?: Partial<CallModelDeps>; concurrency?: number },
): Promise<VoiceReading[]> {
  return mapPooled(texts, call.concurrency ?? 1, async (entry) => {
    const reply = await callModel("STRING_CHECK", buildVoiceJudgeMessages(entry), { schema: voiceJudgeSchema, meta: call.meta, scope: call.scope }, call.llmDeps);
    return reply.output;
  });
}

export async function runVoiceSet(cases: VoiceCase[], options: JudgementOptions): Promise<SetScore> {
  const readings = await judgeVoice(cases, { scope: options.scope, meta: { judgement_set: "voice-judge" }, llmDeps: options.llmDeps, concurrency: options.concurrency });
  return scoreVoiceSet(cases.map((entry, index) => ({ id: entry.id, expected: entry.expected, predicted: readings[index].voice })));
}
