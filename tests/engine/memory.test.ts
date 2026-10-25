import { describe, expect, it } from "vitest";
import { CONTEXT_WINDOW_EXCHANGES, MEMORY_LIMITS } from "@/config/limits";
import type { TranscriptLine } from "@/engine/contexts";
import { acceptMemory, memoryTurnFor, splitContext } from "@/engine/memory";
import { decisionOf, planTurn } from "@/engine/plan-turn";
import type { MemoryEntry } from "@/engine/types";
import { chiThu, engineSession, rawAnalysis } from "../helpers/engine-fixtures";

/** Turns 0 to `last`: the opening line, then one exchange per turn. */
const transcriptTo = (last: number): TranscriptLine[] =>
  Array.from({ length: last + 1 }, (_, index) => ({
    index,
    learnerText: index === 0 ? null : `Hỏi ${index}?`,
    personaText: `Đáp ${index}.`,
  }));

const gistFor = (turn: number, claims: string[] = []): MemoryEntry => ({ turn, gist: `Tóm tắt ${turn}.`, claims });
const indexes = (lines: TranscriptLine[]) => lines.map((line) => line.index);

describe("memoryTurnFor", () => {
  it("names the oldest exchange of the window once there is one before it", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(memoryTurnFor)).toEqual([null, null, null, null, null, 1, 2]);
    expect(CONTEXT_WINDOW_EXCHANGES).toBe(5);
  });
});

describe("splitContext", () => {
  it("keeps the whole transcript when there is no memory, as before memory existed", () => {
    const transcript = transcriptTo(12);
    expect(splitContext(transcript, [])).toEqual({ window: transcript, memory: { earlier: [], claims: [] } });
  });

  it("keeps the last five exchanges word for word and older ones as their gists", () => {
    const { window, memory } = splitContext(transcriptTo(10), [1, 2, 3, 4, 5].map((turn) => gistFor(turn)));
    expect(indexes(window)).toEqual([6, 7, 8, 9, 10]);
    expect(memory.earlier).toEqual([1, 2, 3, 4, 5].map((turn) => ({ turn, gist: `Tóm tắt ${turn}.` })));
  });

  it("keeps an older exchange with no gist, or an empty one, word for word", () => {
    const { window, memory } = splitContext(transcriptTo(10), [gistFor(1), { turn: 3, gist: "  ", claims: [] }, gistFor(4)]);
    expect(indexes(window)).toEqual([2, 3, 5, 6, 7, 8, 9, 10]);
    expect(memory.earlier.map((entry) => entry.turn)).toEqual([1, 4]);
  });

  it("drops the opening line once it is out of the window, and keeps it while it is in", () => {
    expect(indexes(splitContext(transcriptTo(6), [gistFor(1)]).window)).toEqual([2, 3, 4, 5, 6]);
    expect(indexes(splitContext(transcriptTo(4), [gistFor(1)]).window)).toEqual([0, 1, 2, 3, 4]);
  });

  it("ignores an entry for an exchange that is still in the window", () => {
    const { window, memory } = splitContext(transcriptTo(6), [gistFor(1), gistFor(4)]);
    expect(indexes(window)).toEqual([2, 3, 4, 5, 6]);
    expect(memory.earlier.map((entry) => entry.turn)).toEqual([1]);
  });

  it("dedupes claims by their trimmed text and keeps the newest twelve, oldest first", () => {
    const entries = Array.from({ length: 10 }, (_, index) => gistFor(index + 1, [`chi tiết ${index + 1}a`, ` chi tiết ${index + 1}b `]));
    entries[9].claims.push("chi tiết 1a");
    const { memory } = splitContext(transcriptTo(15), entries);
    expect(memory.claims).toHaveLength(MEMORY_LIMITS.claimsKept);
    expect(memory.claims.at(-1)).toBe("chi tiết 1a");
    expect(memory.claims[0]).toBe("chi tiết 5b");
    expect(new Set(memory.claims).size).toBe(memory.claims.length);
  });
});

describe("acceptMemory", () => {
  it("keeps nothing when no exchange was asked for, or when nothing is left", () => {
    expect(acceptMemory({ gist: "Tóm tắt.", claims: ["x"] }, null)).toBeNull();
    expect(acceptMemory({ gist: "  ", claims: ["", " "] }, 3)).toBeNull();
  });

  it("cuts the gist and the claims to the limits and drops empty claims", () => {
    const kept = acceptMemory({ gist: ` ${"g".repeat(500)} `, claims: ["", "c".repeat(400), "hai", "ba"] }, 3)!;
    expect(kept.turn).toBe(3);
    expect(kept.gist).toHaveLength(MEMORY_LIMITS.gistChars);
    expect(kept.claims).toEqual(["c".repeat(MEMORY_LIMITS.claimChars), "hai"]);
  });
});

describe("planTurn and memory", () => {
  const remembered = { gist: "Hỏi chuyện tiền nhà; nhân vật nói mỗi tháng gửi về.", claims: ["Gửi tiền về nhà mỗi tháng"] };

  it("ignores what Call 1 remembered when no exchange was asked for", () => {
    const session = engineSession();
    for (let turn = 1; turn <= 5; turn += 1) expect(session.turn({ memory: remembered }).memory).toBeNull();
    expect(session.memory).toEqual([]);
  });

  it("keeps it for the exchange leaving the window, and stores it with the turn", () => {
    const session = engineSession();
    for (let turn = 1; turn <= 5; turn += 1) session.turn();
    const plan = session.turn({ memory: remembered });
    expect(plan.memory).toEqual({ turn: 1, ...remembered });
    expect(decisionOf(plan).memory).toEqual({ turn: 1, ...remembered });
    expect(decisionOf(session.turn())).not.toHaveProperty("memory");
  });

  it("hands Call 2 the window and the memory from the turns before", () => {
    const session = engineSession();
    for (let turn = 1; turn <= 6; turn += 1) session.turn({ memory: { gist: `Tóm tắt ${turn}.`, claims: [`chi tiết ${turn}`] } });
    const plan = session.turn();
    expect(indexes(plan.personaContext.transcript)).toEqual([2, 3, 4, 5, 6]);
    expect(plan.personaContext.memory).toEqual({ earlier: [{ turn: 1, gist: "Tóm tắt 6." }], claims: ["chi tiết 6"] });
  });

  it("is pure with memory too", () => {
    const input = {
      scenario: chiThu,
      state: { ...engineSession().state, turnIndex: 7 },
      analysis: rawAnalysis({ memory: remembered }),
      transcript: transcriptTo(7),
      memory: [gistFor(1)],
      question: "Chị kể thêm ạ?",
    };
    expect(planTurn(input)).toEqual(planTurn(structuredClone(input)));
  });
});
