import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_SET_SIZE,
  TestSetError,
  formatScore,
  judgementExitCode,
  labelCaseSchema,
  parseTestSet,
  runLabelSet,
  runVerdictSet,
  scoreLabelSet,
  scoreVerdictSet,
  verdictCaseSchema,
  type VerdictRow,
} from "@/eval/judgement-eval";
import type { Label } from "@/engine/types";
import { runJudgementEval } from "../../cli/commands/judgement-eval";
import { DROPPED, a, chiThu, rawAnalysis, told } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";

const labelRows = (pairs: [Label, Label][]) => pairs.map(([expected, predicted], index) => ({ id: `c${index}`, expected, predicted }));
const rateOf = (score: { rates: { key: string; value: number | null; met: boolean }[] }, key: string) => score.rates.find((rate) => rate.key === key)!;
const many = <T>(count: number, value: T): T[] => Array.from({ length: count }, () => value);

describe("parseTestSet", () => {
  it("reads one case per line and skips blank lines", () => {
    const raw = [
      '{"id":"a","transcript":[],"question":"Chị kể đi ạ?","expected":"open"}',
      "",
      '{"id":"b","transcript":[{"learner":"x","persona":"y"}],"question":"Sao ạ?","expected":"leading","note":"n"}',
    ].join("\r\n");
    expect(parseTestSet(raw, labelCaseSchema).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("reports the line of broken JSON, of a case that does not fit, and of a repeated id", () => {
    const ok = '{"id":"a","transcript":[],"question":"q","expected":"open"}';
    expect(() => parseTestSet(`${ok}\n{oops`, labelCaseSchema)).toThrow(new TestSetError("Dòng 2: không phải JSON hợp lệ."));
    expect(() => parseTestSet(`${ok}\n{"id":"b","transcript":[],"question":"q","expected":"great"}`, labelCaseSchema)).toThrow(/^Dòng 2: expected: /);
    expect(() => parseTestSet(`${ok}\n${ok}`, labelCaseSchema)).toThrow('Dòng 2: id "a" bị trùng.');
    expect(() => parseTestSet('{"id":"a","transcript":[],"question":"q","expected":"open","extra":1}', labelCaseSchema)).toThrow(/^Dòng 1/);
  });

  it("accepts the starter sets shipped in evalsets/", () => {
    const labels = parseTestSet(readFileSync("evalsets/label-classifier.jsonl", "utf8"), labelCaseSchema);
    const verdicts = parseTestSet(readFileSync("evalsets/turn-verdict.jsonl", "utf8"), verdictCaseSchema);
    expect(labels.length).toBeGreaterThanOrEqual(15);
    expect(verdicts.length).toBeGreaterThanOrEqual(15);
    // Every label and both verdict directions are represented, so each rate has something to measure.
    expect(new Set(labels.map((entry) => entry.expected))).toEqual(new Set(["confirm_grounded", "boundary_probe", "open", "leading"]));
    expect(verdicts.some((entry) => entry.selected_hook !== null && entry.expected.hook_dropped)).toBe(true);
    expect(verdicts.some((entry) => entry.selected_hook !== null && !entry.expected.hook_dropped)).toBe(true);
    const itemIds = chiThu.items.map((item) => item.id);
    for (const entry of verdicts) {
      for (const id of [...entry.unlocked, ...entry.told, ...entry.expected.told, ...(entry.selected_hook ? [entry.selected_hook] : [])]) {
        expect(itemIds, entry.id).toContain(id);
      }
    }
  });
});

describe("scoreLabelSet", () => {
  it("measures good questions called leading over the good questions only, and agreement over all", () => {
    const score = scoreLabelSet(
      labelRows([
        ["open", "open"],
        ["confirm_grounded", "leading"],
        ["boundary_probe", "open"],
        ["boundary_probe", "boundary_probe"],
        ["leading", "leading"],
        ["leading", "open"],
      ]),
    );
    expect(rateOf(score, "good_as_leading").value).toBe(1 / 4);
    expect(rateOf(score, "agreement").value).toBe(3 / 6);
    expect(score.mismatches).toEqual(["c1: gán tay confirm_grounded, máy leading", "c2: gán tay boundary_probe, máy open", "c5: gán tay leading, máy open"]);
  });

  it("meets the gates at 5 % wrongly leading and 85 % agreement, and misses them just beyond", () => {
    const at = scoreLabelSet(labelRows([...many<[Label, Label]>(19, ["open", "open"]), ["open", "leading"]]));
    expect(rateOf(at, "good_as_leading")).toMatchObject({ value: 0.05, met: true });
    expect(rateOf(at, "agreement")).toMatchObject({ value: 0.95, met: true });

    const beyond = scoreLabelSet(labelRows([...many<[Label, Label]>(18, ["open", "open"]), ...many<[Label, Label]>(2, ["open", "leading"])]));
    expect(rateOf(beyond, "good_as_leading").met).toBe(false);

    const lowAgreement = scoreLabelSet(labelRows([...many<[Label, Label]>(84, ["open", "open"]), ...many<[Label, Label]>(16, ["open", "confirm_grounded"])]));
    expect(rateOf(lowAgreement, "good_as_leading").met).toBe(true);
    expect(rateOf(lowAgreement, "agreement")).toMatchObject({ value: 0.84, met: false });
  });

  it("does not call a rate met when no case measures it", () => {
    const score = scoreLabelSet(labelRows([["leading", "leading"]]));
    expect(rateOf(score, "good_as_leading")).toMatchObject({ value: null, met: false });
  });
});

describe("scoreVerdictSet", () => {
  const row = (id: string, hookSelected: boolean, expected: VerdictRow["expected"], predicted: VerdictRow["predicted"]): VerdictRow => ({ id, hookSelected, expected, predicted });

  it("measures each direction that blames the learner", () => {
    const score = scoreVerdictSet([
      row("told-ok", false, { told: ["a"], hook_dropped: false }, { told: ["a"], hook_dropped: false }),
      row("told-missed", false, { told: ["a", "b"], hook_dropped: false }, { told: ["b"], hook_dropped: false }),
      row("drop-ok", true, { told: [], hook_dropped: true }, { told: [], hook_dropped: true }),
      row("drop-missed", true, { told: [], hook_dropped: true }, { told: [], hook_dropped: false }),
      row("drop-invented", true, { told: [], hook_dropped: false }, { told: [], hook_dropped: true }),
      row("no-drop-ok", true, { told: [], hook_dropped: false }, { told: [], hook_dropped: false }),
    ]);
    expect(rateOf(score, "told_missed").value).toBe(1 / 3);
    expect(rateOf(score, "drop_missed").value).toBe(1 / 2);
    expect(rateOf(score, "drop_invented").value).toBe(1 / 2);
    expect(score.mismatches.map((line) => line.split(":")[0])).toEqual(["told-missed", "drop-missed", "drop-invented"]);
  });

  it("leaves cases without a selected hook out of both hook rates", () => {
    const score = scoreVerdictSet([row("x", false, { told: ["a"], hook_dropped: false }, { told: ["a"], hook_dropped: false })]);
    expect(rateOf(score, "drop_missed").value).toBeNull();
    expect(rateOf(score, "drop_invented").value).toBeNull();
  });
});

describe("judgementExitCode", () => {
  const perfect = (size: number) => scoreLabelSet(labelRows([...many<[Label, Label]>(size - 1, ["open", "open"]), ["leading", "leading"]]));

  it("is 0 only when every gate is met on a set of the required size", () => {
    expect(judgementExitCode(perfect(MIN_SET_SIZE))).toBe(0);
  });

  it("is 2 when every rate passes but the set is too small to prove the gate", () => {
    const score = perfect(18);
    expect(judgementExitCode(score)).toBe(2);
    expect(formatScore(score).at(-1)).toBe("Bộ thử có 18 ca, cần ≥ 100 ca gán tay: kết quả này chưa chứng minh được cổng NFR-7.");
  });

  it("is 1 when a hard gate is missed, whatever the size", () => {
    const failing = scoreLabelSet(labelRows(many<[Label, Label]>(MIN_SET_SIZE, ["open", "leading"])));
    expect(judgementExitCode(failing)).toBe(1);
    expect(formatScore(failing)[0]).toBe("[CHƯA ĐẠT] Câu tốt bị gắn nhầm leading: 100.0% (100/100), cổng ≤ 5.0%");
  });
});

describe("running a set through the production prompts", () => {
  it("labels each case with Call 1 and keeps the label code accepted", async () => {
    const cases = parseTestSet(
      [
        '{"id":"grounded","transcript":[{"learner":"Chị ghi không ạ?","persona":"Có lần chị định ghi lại nhưng rồi cũng bỏ."}],"question":"Lần đó thế nào ạ?","expected":"confirm_grounded"}',
        '{"id":"ungrounded","transcript":[],"question":"Lần đó thế nào ạ?","expected":"open"}',
      ].join("\n"),
      labelCaseSchema,
    );
    const models = roleModels({
      ANALYSIS: [
        { structured: rawAnalysis({ label: "confirm_grounded", grounded_turn_id: 1 }) },
        // A good label whose evidence points at a turn that does not exist: code does not keep it.
        { structured: rawAnalysis({ label: "confirm_grounded", grounded_turn_id: 7 }) },
      ],
    });

    const score = await runLabelSet(chiThu, cases, { scope: { scope: "eval" }, llmDeps: models.llmDeps });

    expect(rateOf(score, "agreement").value).toBe(1);
    expect(models.prompts("ANALYSIS")[0]).toContain("Có lần chị định ghi lại nhưng rồi cũng bỏ.");
    expect(models.prompts("ANALYSIS")[0]).toContain("<luot_can_phan_doan>1</luot_can_phan_doan>");
    expect(models.records.every((record) => record.scope === "eval")).toBe(true);
  });

  it("judges each case with the turn judge and keeps the verdict code accepted", async () => {
    const cases = parseTestSet(
      [
        '{"id":"told","unlocked":["money-home"],"selected_hook":null,"transcript":[{"learner":"q","persona":"Chị gửi ba mẹ 3 triệu."}],"expected":{"told":["money-home"],"hook_dropped":false}}',
        '{"id":"hook","unlocked":[],"selected_hook":"paid-app","transcript":[{"learner":"q","persona":"Có lần chị định ghi lại."}],"expected":{"told":[],"hook_dropped":true}}',
        '{"id":"no-hook","unlocked":[],"selected_hook":null,"transcript":[{"learner":"q","persona":"Ừ em."}],"expected":{"told":[],"hook_dropped":false}}',
      ].join("\n"),
      verdictCaseSchema,
    );
    const models = roleModels({
      REPLAY_JUDGE: [
        // The judge also names an item that is not open: code drops it.
        { structured: { prev_turn_verdict: { ...told("money-home"), disclosed_item_ids: [a("item", "money-home"), a("item", "shame")] } } },
        { structured: { prev_turn_verdict: DROPPED } },
        // A drop is claimed where no hook was selected: code drops it.
        { structured: { prev_turn_verdict: DROPPED } },
      ],
    });

    const score = await runVerdictSet(chiThu, cases, { scope: { scope: "eval" }, llmDeps: models.llmDeps });

    expect(score.mismatches).toEqual([]);
    expect(rateOf(score, "told_missed")).toMatchObject({ value: 0, met: true });
    expect(rateOf(score, "drop_missed")).toMatchObject({ value: 0, met: true });
    // No case had a hook selected and not dropped, so nothing measured the third direction.
    expect(rateOf(score, "drop_invented").value).toBeNull();
  });

  it("refuses a case that names an item the scenario does not have", async () => {
    const cases = parseTestSet('{"id":"bad","unlocked":["no-such-item"],"selected_hook":null,"transcript":[{"learner":"q","persona":"p"}],"expected":{"told":[],"hook_dropped":false}}', verdictCaseSchema);
    await expect(runVerdictSet(chiThu, cases, { scope: { scope: "eval" } })).rejects.toThrow('bad: kịch bản không có item "no-such-item".');
  });
});

describe("il judgement-eval", () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
  }

  it("prints each NFR-7 rate and exits 1 when a hard gate is missed", async () => {
    // Every question of the starter set is called leading: good questions are blamed.
    const models = roleModels({ ANALYSIS: repeat(18, { structured: rawAnalysis({ label: "leading", introduced_span: [0, 0] }) }) });
    const { io, out } = capture();

    expect(await runJudgementEval(["evalsets/label-classifier.jsonl"], io, models.llmDeps)).toBe(1);

    expect(out[0]).toBe("Bộ thử label-classifier: 18 ca, kịch bản chi-thu");
    expect(out[1]).toBe("[CHƯA ĐẠT] Câu tốt bị gắn nhầm leading: 100.0% (12/12), cổng ≤ 5.0%");
    expect(out[2]).toBe("[CHƯA ĐẠT] Đồng thuận với nhãn gán tay: 33.3% (6/18), cổng ≥ 85.0%");
  });

  it("exits 2 on the starter set when every rate passes: the set is too small to prove the gate", async () => {
    const verdicts = parseTestSet(readFileSync("evalsets/turn-verdict.jsonl", "utf8"), verdictCaseSchema);
    const models = roleModels({
      REPLAY_JUDGE: verdicts.map((entry) => ({
        structured: {
          prev_turn_verdict: {
            hook_dropped: entry.expected.hook_dropped,
            disclosed_item_ids: entry.expected.told.map((id) => a("item", id)),
            violations: [],
          },
        },
      })),
    });
    const { io, out } = capture();

    expect(await runJudgementEval(["evalsets/turn-verdict.jsonl"], io, models.llmDeps)).toBe(2);
    expect(out.filter((line) => line.startsWith("[ĐẠT]"))).toHaveLength(3);
    expect(out.at(-1)).toContain("cần ≥ 100 ca gán tay");
  });

  it("explains a missing file, an unknown kind and a broken set without calling a model", async () => {
    const models = roleModels({});
    for (const [args, message] of [
      [[], /Cách dùng/],
      [["evalsets/none.jsonl", "--kind", "turn-verdict"], /Không đọc được file/],
      [["evalsets/turn-verdict.jsonl", "--kind", "moderation"], /Không biết loại bộ thử "moderation"/],
      [["package.json", "--kind", "turn-verdict"], /package\.json: Dòng 1: không phải JSON hợp lệ/],
      [["evalsets/turn-verdict.jsonl", "--scenario", "package.json"], /không qua validate/],
    ] as const) {
      const { io, err } = capture();
      expect(await runJudgementEval([...args], io, models.llmDeps)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
    expect(models.records).toEqual([]);
  });
});
