import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isListReply, runTranscriptRun, sentenceCount } from "../../cli/commands/transcript-run";
import { rawAnalysis } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";

const CHI_THU = "scenarios/ux-chi-tieu/chi-thu.json";
const DEMO_QUESTIONS: string[] = JSON.parse(readFileSync("evalsets/demo/chi-thu-transcript.json", "utf8")).questions;

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

describe("reply measures", () => {
  it("counts sentences by their end marks, and a trailing piece without one", () => {
    expect(sentenceCount("Dạ có. Chị ghi một dạo rồi thôi!")).toBe(2);
    expect(sentenceCount("Ờ… để chị nhớ coi. Chắc là tháng trước")).toBe(2);
    expect(sentenceCount("Thì... cũng có ghi. Mà ít lắm.")).toBe(2);
    expect(sentenceCount("Không em")).toBe(1);
  });

  it("calls a reply with a bulleted or numbered line a list", () => {
    expect(isListReply("Chị thử mấy cách:\n- sổ tay\n- Excel")).toBe(true);
    expect(isListReply("1. Sổ tay\n2. Excel")).toBe(true);
    expect(isListReply("Chị thử sổ tay - rồi Excel nữa.")).toBe(false);
  });
});

describe("il transcript-run", () => {
  it("prints the estimate and calls no model without --yes", async () => {
    const models = roleModels({});
    const { io, out } = capture();

    expect(await runTranscriptRun([CHI_THU, "--turns", "3"], io, models.llmDeps)).toBe(0);

    expect(out[0]).toMatch(/^chi-thu: 3 lượt, ước tính tối đa \d+\.\d{3} USD \(ANALYSIS gemini-3\.8-flash, PERSONA gemini-3\.5-flash\)\.$/);
    expect(out[1]).toBe("Chưa gọi model nào. Thêm --yes để chạy.");
    expect(models.records).toEqual([]);
  });

  it("plays the demo questions through both calls, starts the list over past its end, and prints lengths and medians", async () => {
    const turns = DEMO_QUESTIONS.length + 1;
    const models = roleModels({
      ANALYSIS: repeat(turns, { structured: rawAnalysis({ question_type: "open" }), usage: { input: 2_000, output: 90 } }),
      PERSONA: [
        ...repeat(turns - 1, { text: "Dạ, chị kể ngắn thôi. Vậy đó em.", usage: { input: 1_000, output: 30, reasoning: 0 } }),
        { text: "Chị thử mấy cách:\n- sổ tay\n- Excel", usage: { input: 1_200, output: 40 } },
      ],
    });
    const { io, out } = capture();

    expect(await runTranscriptRun([CHI_THU, "--turns", String(turns), "--yes"], io, models.llmDeps)).toBe(0);

    expect(models.calls("ANALYSIS")).toHaveLength(turns);
    expect(models.calls("PERSONA")).toHaveLength(turns);
    expect(out).toContain(`  Hỏi: ${DEMO_QUESTIONS[0]}`);
    // The last turn asks the first question again.
    expect(out.filter((line) => line === `  Hỏi: ${DEMO_QUESTIONS[0]}`)).toHaveLength(2);
    expect(out).toContain(`Lượt ${turns} · nhãn open · loại open · mở: — · dạng short`);
    expect(out.find((line) => line.startsWith("  → 8 từ, 2 câu ·"))).toContain("Call 1: 2000 vào / 90 ra (0 suy nghĩ)");
    expect(out.some((line) => line.includes("câu, dạng liệt kê ·"))).toBe(true);
    expect(out).toContain(`Câu trả lời dạng liệt kê: 1/${turns}.`);
    expect(out.find((line) => line.startsWith("Trung vị mỗi lượt:"))).toMatch(/^Trung vị mỗi lượt: 8 từ, 2 câu; Call 1 2000 vào \/ 90 ra, .+; Call 2 1000 vào \/ 30 ra, .+\.$/);
    expect(models.records.every((record) => record.scope === "eval")).toBe(true);
  });

  it("prints each gist from turn 6 and the share of turns whose gist came back non-empty", async () => {
    const gist = (text: string) => ({ structured: rawAnalysis({ memory: { gist: text, claims: text ? ["Ở trọ gần chỗ làm"] : [] } }) });
    const models = roleModels({
      ANALYSIS: [...repeat(5, gist("bỏ qua")), gist("Hỏi tiền nhà; chị nói gửi về mỗi tháng."), gist("")],
      PERSONA: repeat(7, { text: "Dạ." }),
    });
    const { io, out } = capture();

    expect(await runTranscriptRun([CHI_THU, "--turns", "7", "--yes"], io, models.llmDeps)).toBe(0);

    expect(out).toContain("  Ghi nhớ lượt 1: Hỏi tiền nhà; chị nói gửi về mỗi tháng. · chi tiết: Ở trọ gần chỗ làm");
    expect(out).toContain("  Ghi nhớ lượt 2: (trống)");
    expect(out.filter((line) => line.startsWith("  Ghi nhớ"))).toHaveLength(2);
    expect(out).toContain("Gist có nội dung: 1/2 (50%).");
  });

  it("stops with exit 1 when a turn's call fails after its retries", async () => {
    const models = roleModels({
      ANALYSIS: [{ structured: rawAnalysis() }],
      PERSONA: repeat(3, { error: new Error("provider down") }),
    });
    const { io, err } = capture();

    expect(await runTranscriptRun([CHI_THU, "--turns", "2", "--yes"], io, models.llmDeps)).toBe(1);

    expect(err).toEqual(["Lượt 1 dừng: LLM call PERSONA failed after 3 attempt(s)"]);
    expect(models.calls("ANALYSIS")).toHaveLength(1);
  });

  it("explains a bad scenario, a missing question file and a turn count out of range", async () => {
    const models = roleModels({});
    for (const [args, message] of [
      [[], /Cách dùng/],
      [["package.json"], /không qua validate/],
      [[CHI_THU, "--questions", "evalsets/none.json"], /Không đọc được file "evalsets\/none\.json"/],
      [[CHI_THU, "--questions", "package.json"], /cần một mảng "questions"/],
      [[CHI_THU, "--turns", "31"], /--turns phải là số nguyên từ 1 đến 30/],
    ] as const) {
      const { io, err } = capture();
      expect(await runTranscriptRun([...args], io, models.llmDeps)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
    expect(models.records).toEqual([]);
  });
});
