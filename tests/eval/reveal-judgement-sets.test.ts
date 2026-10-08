import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_NOVELTY_SET_SIZE,
  TestSetError,
  canvasCaseSchema,
  judgementExitCode,
  noveltyCaseSchema,
  parseTestSet,
  runCanvasSet,
  runNoveltySet,
  scoreCanvasSet,
  scoreNoveltySet,
  type CanvasRow,
} from "@/eval/judgement-eval";
import { tokenize } from "@/engine/tokens";
import { runJudgementEval } from "../../cli/commands/judgement-eval";
import { NO_VERDICT, a, chiThu } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";
import { rangeOf } from "../helpers/reveal-fixtures";
import type { ScriptedStep } from "../helpers/scripted-model";

const canvasSet = () => parseTestSet(readFileSync("evalsets/canvas-judge.jsonl", "utf8"), canvasCaseSchema);
const noveltySet = () => parseTestSet(readFileSync("evalsets/leading-novelty.jsonl", "utf8"), noveltyCaseSchema);
const options = (models: ReturnType<typeof roleModels>) => ({ scope: { scope: "eval" as const }, llmDeps: models.llmDeps });
const rateOf = (score: { rates: { key: string; value: number | null; met: boolean; count: string }[] }, key: string) => score.rates.find((rate) => rate.key === key)!;

const row = (expected: CanvasRow["expected"], predicted: CanvasRow["predicted"]): CanvasRow => ({ id: "c", phrase: "p", expected, predicted });
const none = { kind: "none" as const, item: null };

describe("the starter sets shipped in evalsets/", () => {
  it("canvas-judge covers every kind of stretch, with phrases that are in their notes and items that exist", () => {
    const cases = canvasSet();
    const kinds = new Set(cases.flatMap((entry) => entry.expected.map((expected) => expected.kind)));
    expect(kinds).toEqual(new Set(["told", "unconfirmed", "unrevealed", "never_said", "none"]));
    const itemIds = chiThu.items.map((item) => item.id);
    for (const entry of cases) {
      for (const id of [...entry.unlocked, ...entry.told, ...entry.dropped, ...entry.expected.flatMap((expected) => (expected.item ? [expected.item] : []))]) {
        expect(itemIds, entry.id).toContain(id);
      }
      for (const expected of entry.expected) expect(() => rangeOf(entry.notes, expected.phrase), entry.id).not.toThrow();
      // An item stretch names its item; the others name none.
      for (const expected of entry.expected) expect(expected.item !== undefined, `${entry.id} ${expected.phrase}`).toBe(["told", "unconfirmed", "unrevealed"].includes(expected.kind));
    }
  });

  it("leading-novelty has both answers, each span inside its question", () => {
    const cases = noveltySet();
    expect(new Set(cases.map((entry) => entry.expected))).toEqual(new Set(["novel", "said"]));
    for (const entry of cases) expect(() => rangeOf(entry.question, entry.span), entry.id).not.toThrow();
  });
});

describe("scoreCanvasSet (NFR-7)", () => {
  it("blames a correct paraphrase that was missed, called never said, or given to another item", () => {
    const told = { kind: "told" as const, item: "money-home" };
    const score = scoreCanvasSet([
      row(told, told),
      row(told, none),
      row(told, { kind: "never_said", item: null }),
      row(told, { kind: "told", item: "paid-app" }),
      // Not item stretches: outside the gate, but a wrong mark is listed.
      row(none, { kind: "never_said", item: null }),
      row({ kind: "never_said", item: null }, { kind: "never_said", item: null }),
    ]);
    expect(rateOf(score, "paraphrase_missed")).toMatchObject({ value: 3 / 4, met: false, count: "3/4" });
    expect(score.mismatches).toHaveLength(4);
    expect(score.mismatches[0]).toBe('c "p": gán tay told money-home, máy none');
  });

  it("passes at 5 % and cannot pass with no item stretch to measure", () => {
    const told = { kind: "told" as const, item: "money-home" };
    const twenty = [...Array.from({ length: 19 }, () => row(told, told)), row(told, none)];
    expect(rateOf(scoreCanvasSet(twenty), "paraphrase_missed").met).toBe(true);
    expect(rateOf(scoreCanvasSet([row(none, none)]), "paraphrase_missed")).toMatchObject({ value: null, met: false });
  });
});

describe("scoreNoveltySet (NFR-7)", () => {
  it("blames words the persona had said that were taken for added words, and needs 50 cases", () => {
    const score = scoreNoveltySet([
      { id: "a", expected: "said", predicted: "novel" },
      { id: "b", expected: "said", predicted: "said" },
      { id: "c", expected: "novel", predicted: "said" },
    ]);
    expect(rateOf(score, "said_as_novel")).toMatchObject({ value: 0.5, met: false });
    expect(score.mismatches).toEqual(["a: gán tay said, máy novel", "c: gán tay novel, máy said"]);

    const clean = scoreNoveltySet(Array.from({ length: MIN_NOVELTY_SET_SIZE }, (_, index) => ({ id: `n${index}`, expected: "said" as const, predicted: "said" as const })));
    expect(judgementExitCode(clean)).toBe(0);
    expect(judgementExitCode({ ...clean, size: MIN_NOVELTY_SET_SIZE - 1 })).toBe(2);
  });
});

describe("running the sets through the production prompts", () => {
  /** An end judge that returns exactly what each case expects. */
  const perfectJudge = (): ScriptedStep[] =>
    canvasSet().map((entry) => ({
      structured: {
        last_turn_verdict: NO_VERDICT,
        canvas_matches: entry.expected
          .filter((expected) => expected.kind !== "none")
          .map((expected) => ({
            range: rangeOf(entry.notes, expected.phrase),
            kind: expected.item ? "item" : "never_said",
            item_id: expected.item ? a("item", expected.item) : null,
            reason: "r",
          })),
      },
    }));

  it("canvas-judge: a judge that answers as labelled passes every rate, with one call per case", async () => {
    const models = roleModels({ END_JUDGE: perfectJudge() });
    const score = await runCanvasSet(chiThu, canvasSet(), options(models));

    expect(score.mismatches).toEqual([]);
    expect(rateOf(score, "paraphrase_missed")).toMatchObject({ value: 0, met: true });
    expect(models.records.map((record) => record.role)).toEqual(canvasSet().map(() => "END_JUDGE"));
    // The notes reach the judge as indexed tokens inside their data block.
    const first = canvasSet()[0];
    expect(models.prompts("END_JUDGE")[0]).toContain(`<ghi_chu>\n${tokenize(first.notes).map((token, index) => `${index}:${token}`).join(" ")}\n</ghi_chu>`);
  });

  it("canvas-judge: a judge that finds nothing fails the gate", async () => {
    const blind = roleModels({ END_JUDGE: canvasSet().map(() => ({ structured: { last_turn_verdict: NO_VERDICT, canvas_matches: [] } })) });
    const score = await runCanvasSet(chiThu, canvasSet(), options(blind));
    expect(rateOf(score, "paraphrase_missed")).toMatchObject({ value: 1, met: false });
  });

  it("leading-novelty: asks the verifier one check per case, about the added words of the last question", async () => {
    const cases = noveltySet();
    const answers = cases.map((entry) => ({ structured: { claims: [{ claim_id: "V1", verdict: entry.expected === "novel" ? "agree" : "disagree", reason: "r", label: null }] } }));
    const models = roleModels({ VERIFIER: answers });
    const score = await runNoveltySet(chiThu, cases, options(models));

    expect(score.mismatches).toEqual([]);
    expect(rateOf(score, "said_as_novel")).toMatchObject({ value: 0, met: true });
    const prompt = models.prompts("VERIFIER")[0];
    expect(prompt).toContain(`- V1 | loại: leading_novelty | lượt: ${cases[0].transcript.length + 1} | cụm: "${cases[0].span}"`);
    expect(prompt).toContain(`[lượt ${cases[0].transcript.length + 1}] người hỏi: ${cases[0].question}`);
  });

  it("leading-novelty: a verifier that says nothing does not count as agreeing the words were new", async () => {
    const cases = noveltySet();
    const silent = roleModels({ VERIFIER: cases.map(() => ({ structured: { claims: [] } })) });
    const score = await runNoveltySet(chiThu, cases, options(silent));
    expect(rateOf(score, "said_as_novel")).toMatchObject({ value: 0, met: true });
    expect(score.mismatches).toHaveLength(cases.filter((entry) => entry.expected === "novel").length);
  });

  it("reports a phrase that is not in its notes, and a span that is not in its question", async () => {
    const [first] = canvasSet();
    const broken = [{ ...first, expected: [{ phrase: "không có trong ghi chú", kind: "none" as const }] }];
    await expect(runCanvasSet(chiThu, broken, options(roleModels({ END_JUDGE: perfectJudge() })))).rejects.toThrow(TestSetError);
    const [novelty] = noveltySet();
    await expect(runNoveltySet(chiThu, [{ ...novelty, span: "không có trong câu hỏi" }], options(roleModels({})))).rejects.toThrow(TestSetError);
  });

  it("the CLI picks the kind from the file name and exits 2 on a starter set whose rates pass", async () => {
    const out: string[] = [];
    const io = { out: (line: string) => out.push(line), err: (line: string) => out.push(line) };
    const models = roleModels({ END_JUDGE: perfectJudge() });

    expect(await runJudgementEval(["evalsets/canvas-judge.jsonl"], io, models.llmDeps)).toBe(2);
    expect(out[0]).toMatch(/^Bộ thử canvas-judge: \d+ ca, kịch bản chi-thu$/);
    expect(out.join("\n")).toContain("[ĐẠT] Đoạn diễn đạt đúng bị bỏ lỡ hoặc gắn nhầm \"chưa từng được nói\": 0.0%");
    expect(out.at(-1)).toMatch(/cần ≥ 100 ca gán tay/);
  });
});
