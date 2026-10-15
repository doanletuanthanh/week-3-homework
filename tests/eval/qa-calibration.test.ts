import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTestSet } from "@/eval/judgement-eval";
import { calibrationSpecs, cleanStability, falseFailures, operatorScores, runCalibration, type CalibrationResult } from "@/eval/qa/calibration";
import { qaPlanCaseSchema, replyJudgeCaseSchema, runReplyJudgeSet, scoreQaPlanSet, scoreReplyJudgeSet } from "@/eval/qa/judgement-sets";
import { OPERATORS } from "@/eval/qa/mutants";
import type { QaReport } from "@/eval/qa/types";
import { validateScenario } from "@/scenario/validate";
import { chiThu } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";

const result = (overrides: Partial<CalibrationResult>): CalibrationResult => ({
  personaId: "chi-thu",
  operator: "clean",
  run: 1,
  targetItemId: null,
  unmet: [],
  confirmed: true,
  highRisk: [],
  costUsd: 0.04,
  calls: 40,
  ...overrides,
});

const report = (unmet: string[]): QaReport => ({
  profile: "lean",
  version: 1,
  thresholds: ["validate", "no_public_leak", "no_leaks"].map((key) => ({ key, label: key, met: !unmet.includes(key), detail: "" })),
  warnings: [],
  publicLeaks: [],
  risks: [{ itemId: "installment", risk: "high", reason: "" }],
  observations: [],
  leaks: [],
  findings: [],
  rounds: [],
  cost: { capUsd: 0.1, actualUsd: 0.04, calls: 40 },
});

describe("calibration", () => {
  it("runs each clean persona n times and each applicable mutant once", () => {
    const specs = calibrationSpecs([chiThu], { cleanRuns: 3, clean: true, operators: ["leak-in-identity", "orphan-item"] });
    expect(specs.map((spec) => `${spec.operator}:${spec.run}`)).toEqual(["clean:1", "clean:2", "clean:3", "leak-in-identity:1", "orphan-item:1"]);
    expect(specs[3].targetItemId).toBe("installment");
  });

  it("counts a mutant as caught only by its declared row, failing because of the change", () => {
    const scores = operatorScores([
      result({ operator: "leak-in-identity", unmet: ["no_public_leak"] }),
      result({ operator: "leak-in-identity", personaId: "co-lan", unmet: ["no_leaks"] }),
      // The row failed, but on another item: a flaky failure is not a catch.
      result({ operator: "leak-in-identity", personaId: "chi-my", unmet: ["no_public_leak"], confirmed: false }),
      result({ operator: "leak-in-identity", personaId: "anh-khoa", unmet: null, confirmed: false, error: "BudgetExceededError: cap" }),
    ]);
    expect(scores).toEqual([
      expect.objectContaining({ operator: "leak-in-identity", trips: OPERATORS["leak-in-identity"].trips, caught: 1, total: 4, gating: true }),
    ]);
    expect(scores[0].misses).toEqual([
      "co-lan: không đạt [no_leaks]",
      "chi-my: không đạt [no_public_leak] nhưng không vì điều bị sửa",
      "anh-khoa: lỗi BudgetExceededError: cap",
    ]);
  });

  it("ties each model-judged operator's failure to its target in the report", () => {
    const target = { scenario: chiThu, targetItemId: "installment" };
    const base = report([]);
    const leak = { replyId: "R1", action: "a", itemId: "installment", kind: "content" as const, excerpt: "" };
    expect(OPERATORS["leak-in-identity"].confirms({ ...base, publicLeaks: [{ field: "persona.identity", itemId: "installment", kind: "content", quote: "", reason: "" }] }, target)).toBe(true);
    expect(OPERATORS["leak-in-identity"].confirms({ ...base, publicLeaks: [{ field: "persona.identity", itemId: "installment", kind: "topic_hint", quote: "", reason: "" }] }, target)).toBe(false);
    expect(OPERATORS["leak-in-surface-fact"].confirms({ ...base, leaks: [leak] }, target)).toBe(true);
    expect(OPERATORS["leak-in-surface-fact"].confirms({ ...base, leaks: [{ ...leak, itemId: "roommate" }] }, target)).toBe(false);
    // An operator with no single target counts any leak.
    expect(OPERATORS["loose-voice"].confirms({ ...base, leaks: [{ ...leak, itemId: "roommate" }] }, { scenario: chiThu, targetItemId: null })).toBe(true);
    const check = (itemId: string, opened: string | null) => ({
      key: itemId,
      action: { tool: "check_unlock" as const, itemId, question: "q", source: "floor" as const },
      openedItemId: opened,
      retryOpenedItemId: opened,
      label: null,
      opennessBefore: null,
      opennessAfter: null,
      replies: [],
      readings: {},
    });
    expect(OPERATORS["weak-sample"].confirms({ ...base, observations: [check("installment", null)] }, target)).toBe(true);
    expect(OPERATORS["weak-sample"].confirms({ ...base, observations: [check("installment", "installment"), check("roommate", null)] }, target)).toBe(false);
  });

  it("tells a row that flips between runs from one that fails every run", () => {
    const results = [
      result({ run: 1, unmet: ["floor_unlocks"] }),
      result({ run: 2, unmet: [] }),
      result({ run: 3, unmet: ["floor_unlocks", "no_leaks"] }),
      result({ personaId: "co-lan", unmet: ["no_leaks"] }),
    ];
    expect(cleanStability(results)).toEqual([
      { personaId: "chi-thu", row: "floor_unlocks", failed: 2, runs: 3 },
      { personaId: "chi-thu", row: "no_leaks", failed: 1, runs: 3 },
      { personaId: "co-lan", row: "no_leaks", failed: 1, runs: 1 },
    ]);
    expect(falseFailures(results)).toHaveLength(3);
  });

  it("records a run that throws as failed and goes on with the others", async () => {
    const specs = calibrationSpecs([chiThu], { cleanRuns: 2, clean: true, operators: [] });
    let calls = 0;
    const results = await runCalibration(
      specs,
      async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("cap"), { name: "BudgetExceededError", spentUsd: 0.1 });
        return report([]);
      },
      { concurrency: 1 },
    );
    expect(results.map((entry) => [entry.unmet, entry.error, entry.costUsd])).toEqual([
      [null, "BudgetExceededError: cap", 0.1],
      [[], undefined, 0.04],
    ]);
    expect(results[1].highRisk).toEqual(["installment"]);
  });
});

describe("reply-judge and qa-plan sets", () => {
  it("the starter sets parse and name only items of their scenarios", () => {
    const replies = parseTestSet(readFileSync("evalsets/reply-judge.jsonl", "utf8"), replyJudgeCaseSchema);
    expect(replies.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(chiThu.items.map((item) => item.id));
    for (const entry of replies) {
      for (const id of [...entry.open, ...entry.hooks, ...entry.expected.told, ...entry.expected.topics]) expect(ids, entry.id).toContain(id);
    }
    // Half of the cases are leaks.
    const leaks = replies.filter((entry) => [...entry.expected.told, ...entry.expected.topics].some((id) => !entry.open.includes(id)));
    expect(leaks.length * 2).toBeGreaterThanOrEqual(replies.length);

    const plans = parseTestSet(readFileSync("evalsets/qa-plan.jsonl", "utf8"), qaPlanCaseSchema);
    expect(plans.length).toBeGreaterThanOrEqual(10);
    for (const entry of plans) {
      const scenario = validateScenario(JSON.parse(readFileSync(entry.scenario, "utf8"))).scenario!;
      // The label is the item the operator changes.
      expect(OPERATORS[entry.operator!].apply(scenario)?.targetItemId, entry.id).toBe(entry.expected_high[0]);
    }
  });

  it("scores a missed leak and an invented one", () => {
    const score = scoreReplyJudgeSet([
      { id: "a", expected: ["installment"], predicted: ["installment"] },
      { id: "b", expected: ["roommate"], predicted: [] },
      { id: "c", expected: [], predicted: ["shame"] },
      { id: "d", expected: ["shame"], predicted: null },
    ]);
    expect(score.rates.map((entry) => [entry.key, entry.count, entry.met])).toEqual([
      ["leak_missed", "2/3", false],
      ["leak_invented", "1/2", false],
    ]);
    expect(score.mismatches).toHaveLength(3);
  });

  it("judges each reply with the production judge and leaves open items out of the leaks", async () => {
    const cases = [
      { id: "leak", open: [], hooks: [], question: "q", reply: "r", expected: { told: ["installment"], topics: [] } },
      { id: "open", open: ["installment"], hooks: [], question: "q", reply: "r", expected: { told: ["installment"], topics: [] } },
    ];
    const alias = `I${chiThu.items.findIndex((item) => item.id === "installment") + 1}`;
    const models = roleModels({
      EVAL_LEAK_JUDGE: [{ structured: { replies: [{ reply: "R1", told: [alias], topics: [] }, { reply: "R2", told: [alias], topics: [] }] } }],
    });
    const score = await runReplyJudgeSet(chiThu, cases, { scope: { scope: "eval" }, llmDeps: models.llmDeps });
    expect(score.rates.every((entry) => entry.met)).toBe(true);
    expect(score.mismatches).toEqual([]);
  });

  it("scores the planner by the items it had to rate high", () => {
    const score = scoreQaPlanSet([
      { id: "a", expected: ["installment"], predicted: ["installment", "shame"] },
      { id: "b", expected: ["unpaid-work"], predicted: [] },
    ]);
    expect(score.rates[0]).toEqual(expect.objectContaining({ key: "high_risk_missed", count: "1/2", met: false }));
  });
});
