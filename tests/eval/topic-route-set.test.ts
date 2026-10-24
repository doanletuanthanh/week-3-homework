import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alias } from "@/engine/aliases";
import { parseTestSet } from "@/eval/judgement-eval";
import { MIN_ROUTE_SET_SIZE, routeCaseSchema, runTopicRouteSet, scoreTopicRouteSet, type RouteRow } from "@/eval/topic-route-set";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { runJudgementEval } from "../../cli/commands/judgement-eval";
import { chiThu, rawAnalysis, topic } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";

const SET = "evalsets/topic-route.jsonl";
const CHI_THU = "scenarios/ux-chi-tieu/chi-thu.json";

function loadScenario(path: string): Scenario {
  const { scenario } = validateScenario(JSON.parse(readFileSync(path, "utf8")));
  if (!scenario) throw new Error(`${path} does not validate`);
  return scenario;
}

const rateOf = (score: { rates: { key: string; value: number | null; met: boolean }[] }, key: string) => score.rates.find((entry) => entry.key === key)!;

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

describe("the topic-route set", () => {
  const cases = parseTestSet(readFileSync(SET, "utf8"), routeCaseSchema);
  const scenarios = new Map([...new Set(cases.map((entry) => entry.scenario))].map((path) => [path, loadScenario(path)]));

  it("pools three personas in one set large enough for its gate", () => {
    expect(cases.length).toBeGreaterThanOrEqual(MIN_ROUTE_SET_SIZE);
    expect([...scenarios.values()].map((scenario) => scenario.persona_id).sort()).toEqual(["chi-hanh", "chi-thu", "co-lan"]);
  });

  it("names only items of its scenario, and tells only items that are open", () => {
    for (const entry of cases) {
      const ids = scenarios.get(entry.scenario)!.items.map((item) => item.id);
      for (const id of entry.unlocked) expect(ids, entry.id).toContain(id);
      for (const id of entry.told) expect(entry.unlocked, entry.id).toContain(id);
      if (entry.expected !== "broad" && entry.expected !== "none") expect(ids, entry.id).toContain(entry.expected);
    }
  });

  it("keeps the planned mix: a quarter broad, a tenth about no topic, and questions about items already open", () => {
    const share = (expected: string) => cases.filter((entry) => entry.expected === expected).length / cases.length;
    expect(share("broad")).toBeGreaterThanOrEqual(0.25);
    expect(share("none")).toBeGreaterThanOrEqual(0.1);
    expect(cases.filter((entry) => entry.unlocked.includes(entry.expected)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("scoreTopicRouteSet", () => {
  const right = (id: string): RouteRow => ({ id, expected: "tried-methods", predicted: "tried-methods" });

  it("counts a wrong item, and any item opened for a broad or untouched question, as wrong; a direct question with nothing opened as missed", () => {
    const score = scoreTopicRouteSet([
      right("ok"),
      { id: "sibling", expected: "weekly-batch", predicted: "tried-methods" },
      { id: "broad-opened", expected: "broad", predicted: "tried-methods" },
      { id: "broad-kept", expected: "broad", predicted: null },
      { id: "none-kept", expected: "none", predicted: null },
      { id: "missed", expected: "last-attempt", predicted: null },
    ]);

    expect(rateOf(score, "wrong_direct").value).toBeCloseTo(2 / 6);
    expect(rateOf(score, "missed_direct").value).toBeCloseTo(1 / 3);
    expect(score.mismatches).toEqual([
      "sibling: gán tay weekly-batch, máy tried-methods",
      "broad-opened: gán tay broad, máy tried-methods",
      "missed: gán tay last-attempt, máy không mở gì",
    ]);
    expect(score.notes).toEqual([
      "Câu chung chung hoặc không chạm chủ đề nào mà không mở gì: 2/3",
      "Cặp nhầm (gán tay → máy):",
      "  weekly-batch → tried-methods",
      "  broad → tried-methods",
    ]);
  });

  it("allows one wrong route in 48 and not two", () => {
    const rows = (wrong: number) => [
      ...Array.from({ length: 48 - wrong }, (_, index) => right(`r${index}`)),
      ...Array.from({ length: wrong }, (_, index): RouteRow => ({ id: `w${index}`, expected: "broad", predicted: "money-home" })),
    ];
    expect(rateOf(scoreTopicRouteSet(rows(1)), "wrong_direct").met).toBe(true);
    expect(rateOf(scoreTopicRouteSet(rows(2)), "wrong_direct").met).toBe(false);
  });
});

describe("runTopicRouteSet", () => {
  const scenarios = new Map([[CHI_THU, chiThu]]);
  const tag = (itemId: string) => alias(chiThu, "tag", itemId);

  it("keeps the item code would act on: the direct topic Call 1 gave, once code checked its words", async () => {
    const cases = parseTestSet(
      [
        `{"id":"direct","scenario":"${CHI_THU}","transcript":[],"question":"Chị đã thử những cách nào ạ?","expected":"tried-methods","note":"n"}`,
        `{"id":"broad","scenario":"${CHI_THU}","transcript":[],"question":"Chị quản lý chi tiêu thế nào ạ?","expected":"broad","note":"n"}`,
        `{"id":"no-words","scenario":"${CHI_THU}","transcript":[],"question":"Chị quản lý tiền thế nào ạ?","expected":"broad","note":"n"}`,
        `{"id":"unknown-tag","scenario":"${CHI_THU}","transcript":[],"question":"Chị đi làm bằng gì ạ?","expected":"none","note":"n"}`,
      ].join("\n"),
      routeCaseSchema,
    );
    const models = roleModels({
      ANALYSIS: [
        { structured: rawAnalysis({ topic: topic(tag("tried-methods"), [3, 4], [tag("weekly-batch")]) }) },
        // A general question pushed onto one topic, with words: the engine opens it.
        { structured: rawAnalysis({ topic: topic(tag("weekly-batch"), [0, 1]) }) },
        // A direct topic whose words are not in the question is only a hint.
        { structured: rawAnalysis({ topic: topic(tag("tried-methods"), [2, 40]) }) },
        // A topic that names no item is dropped by code.
        { structured: rawAnalysis({ topic: topic("T99") }) },
      ],
    });

    const score = await runTopicRouteSet(cases, scenarios, { scope: { scope: "eval" }, llmDeps: models.llmDeps });

    expect(score.mismatches).toEqual(["broad: gán tay broad, máy weekly-batch"]);
    expect(rateOf(score, "missed_direct").value).toBe(0);
    expect(models.records.every((record) => record.scope === "eval")).toBe(true);
  });

  it("refuses a case that names an unknown item, or tells an item that is not open, before any call", async () => {
    const models = roleModels({});
    const run = (line: string) => runTopicRouteSet(parseTestSet(line, routeCaseSchema), scenarios, { scope: { scope: "eval" }, llmDeps: models.llmDeps });

    await expect(run(`{"id":"bad","scenario":"${CHI_THU}","transcript":[],"question":"q","expected":"no-such-item","note":"n"}`)).rejects.toThrow(
      'bad: kịch bản không có item "no-such-item".',
    );
    await expect(run(`{"id":"told","scenario":"${CHI_THU}","told":["shame"],"transcript":[],"question":"q","expected":"none","note":"n"}`)).rejects.toThrow(
      "told: điều đã kể phải là điều đã mở (shame).",
    );
    expect(models.calls("ANALYSIS")).toHaveLength(0);
  });
});

describe("il judgement-eval on the topic-route set", () => {
  it("takes the kind from the file name, loads each case's scenario, and fails the missed gate when nothing is routed", async () => {
    const cases = parseTestSet(readFileSync(SET, "utf8"), routeCaseSchema);
    const direct = cases.filter((entry) => entry.expected !== "broad" && entry.expected !== "none").length;
    const models = roleModels({ ANALYSIS: repeat(cases.length, { structured: rawAnalysis() }) });
    const { io, out } = capture();

    expect(await runJudgementEval([SET], io, models.llmDeps)).toBe(1);

    expect(out[0]).toBe(`Bộ thử topic-route: ${cases.length} ca, mỗi ca một kịch bản riêng`);
    expect(out).toContain(`[ĐẠT] Câu hỏi mở nhầm điều, hoặc mở một điều khi không nên mở: 0.0% (0/${cases.length}), cổng ≤ 2.1%`);
    expect(out).toContain(`[CHƯA ĐẠT] Câu hỏi đúng vào một chủ đề mà không được nhận ra: 100.0% (${direct}/${direct}), cổng ≤ 20.0%`);
  });

  it("explains a batch run that has no batch channel, or cannot open one, without calling a model", async () => {
    const models = roleModels({});
    const noChannel = capture();
    expect(await runJudgementEval([SET, "--batch"], noChannel.io, models.llmDeps)).toBe(1);
    expect(noChannel.err).toEqual(["Không có kênh batch: chạy không có --batch."]);

    const broken = capture();
    const failing = () => {
      throw new Error("no key");
    };
    expect(await runJudgementEval([SET, "--batch"], broken.io, models.llmDeps, failing)).toBe(1);
    expect(broken.err[0]).toMatch(/^Không tạo được kênh batch: no key\./);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
  });
});
