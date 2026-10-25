import type { BaseMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { MAX_QUESTION_CHARS, MAX_TURNS, MEMORY_LIMITS } from "@/config/limits";
import { buildAnalysisContext } from "@/engine/contexts";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildPersonaMessages } from "@/llm/prompts/persona";
import { chiThu, engineSession } from "../helpers/engine-fixtures";

const length = (messages: BaseMessage[]) => messages.reduce((sum, message) => sum + message.text.length, 0);

/** Most a prompt may grow in one turn once the window is full: one gist line, plus turn numbers, hooks and claims filling up. */
const PER_TURN = MEMORY_LIMITS.gistChars + 260;

/** A question close to the longest a learner may type, the same length every turn. */
const question = (turn: number) => `Câu hỏi ${String(turn).padStart(2, "0")} ${"chị kể thêm giúp em ".repeat(30)}`.trim().slice(0, MAX_QUESTION_CHARS - 20);

/** Words of a gist or a claim at its full length, on one line. */
const filler = (chars: number, turn: number) => `lượt ${turn} ${"chi tiết ".repeat(40)}`.slice(0, chars).trim();

/** Plays 30 neutral turns and measures both prompts each turn; with memory, Call 1 writes a full gist and two full claims. */
function play(withMemory: boolean) {
  const session = engineSession();
  const call1: number[] = [0];
  const call2: number[] = [0];
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const asked = question(turn);
    call1.push(length(buildAnalysisMessages(buildAnalysisContext(chiThu, session.state, [...session.transcript], asked, [...session.memory]))));
    const memory = withMemory
      ? { gist: filler(MEMORY_LIMITS.gistChars, turn), claims: [filler(MEMORY_LIMITS.claimChars, turn), filler(MEMORY_LIMITS.claimChars, turn + 100)] }
      : { gist: "", claims: [] };
    const plan = session.turn({ memory }, asked);
    call2.push(length(buildPersonaMessages(plan.personaContext)));
  }
  return { call1, call2 };
}

describe("prompt budget over a scripted 30-turn session", () => {
  const bounded = play(true);
  const whole = play(false);

  it.each(["call1", "call2"] as const)("keeps %s growing by at most one gist line a turn after turn 6", (call) => {
    const sizes = bounded[call];
    // Turn 7 is the first with memory: Call 2's notes header comes in once, with the first claims.
    for (let turn = 8; turn <= MAX_TURNS; turn += 1) expect(sizes[turn] - sizes[turn - 1], `turn ${turn}`).toBeLessThanOrEqual(PER_TURN);
    expect(sizes[MAX_TURNS]).toBeLessThanOrEqual(sizes[6] + (MAX_TURNS - 6) * PER_TURN);
  });

  it.each(["call1", "call2"] as const)("would outgrow that bound with the whole transcript in %s, so the check means something", (call) => {
    const sizes = whole[call];
    expect(sizes[MAX_TURNS] - sizes[6]).toBeGreaterThan((MAX_TURNS - 6) * PER_TURN);
  });
});
