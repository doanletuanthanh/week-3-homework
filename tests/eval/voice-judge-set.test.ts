import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTestSet, type SetScore } from "@/eval/judgement-eval";
import { MIN_VOICE_SET_SIZE, runVoiceSet, scoreVoiceSet, voiceCaseSchema } from "@/eval/voice-judge-set";
import { VOICE_TEXT_KINDS } from "@/llm/prompts/eval-voice-judge";
import { curatedPersonas } from "../helpers/curated-scenarios";
import { respondingModels } from "../helpers/custom-fixtures";

const voiceSet = () => parseTestSet(readFileSync("evalsets/voice-judge.jsonl", "utf8"), voiceCaseSchema);
const rateOf = (score: SetScore, key: string) => score.rates.find((rate) => rate.key === key)!;

describe("the voice-judge starter set", () => {
  it("is big enough, balanced, and covers both kinds of text on both sides", () => {
    const cases = voiceSet();
    expect(cases.length).toBeGreaterThanOrEqual(MIN_VOICE_SET_SIZE);
    const plain = cases.filter((entry) => entry.expected === "plain");
    expect(Math.abs(plain.length * 2 - cases.length)).toBeLessThanOrEqual(2);
    for (const kind of Object.keys(VOICE_TEXT_KINDS)) {
      for (const expected of ["plain", "ai_voice"]) expect(cases.some((entry) => entry.kind === kind && entry.expected === expected), `${kind} ${expected}`).toBe(true);
    }
  });

  it("takes every plain case word for word from the hand-written library", () => {
    const library = curatedPersonas()
      .map(({ scenario }) => JSON.stringify(scenario))
      .join("\n");
    for (const entry of voiceSet().filter((entry) => entry.expected === "plain")) expect(library, entry.id).toContain(JSON.stringify(entry.text).slice(1, -1));
  });
});

describe("scoreVoiceSet", () => {
  it("gates on model-written text let through and on hand-written text flagged", () => {
    const score = scoreVoiceSet([
      { id: "a", expected: "ai_voice", predicted: "plain" },
      { id: "b", expected: "ai_voice", predicted: "ai_voice" },
      { id: "c", expected: "plain", predicted: "plain" },
      { id: "d", expected: "plain", predicted: "plain" },
    ]);
    expect(rateOf(score, "ai_voice_passed")).toMatchObject({ count: "1/2", met: false });
    expect(rateOf(score, "plain_flagged")).toMatchObject({ count: "0/2", met: true });
    expect(score.mismatches).toEqual(["a: gán tay ai_voice, máy plain"]);
  });
});

describe("runVoiceSet", () => {
  it("asks STRING_CHECK once per case, with the kind of text and the text as data", async () => {
    const cases = voiceSet().slice(0, 2);
    const models = respondingModels(() => ({ structured: { voice: "plain", reason: "kể việc cụ thể" } }));
    const score = await runVoiceSet(cases, { scope: { scope: "eval" }, llmDeps: models.llmDeps });
    const calls = models.calls.filter((call) => call.role === "STRING_CHECK");
    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).toContain(`Đoạn văn này là: ${VOICE_TEXT_KINDS[cases[0].kind]}.\n<doan_van>\n${cases[0].text}\n</doan_van>`);
    expect(score.size).toBe(2);
  });
});
