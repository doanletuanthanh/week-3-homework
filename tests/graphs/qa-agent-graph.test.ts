import { describe, expect, it } from "vitest";
import type { RawAnalysis } from "@/engine/types";
import { findAttack } from "@/eval/attacks";
import { FLOOR_ATTACKS } from "@/eval/qa/floor";
import { ATTACK_TURNS } from "@/eval/qa/tools";
import { Budget, BudgetExceededError, MAX_REFLECT_ROUNDS, runQaAgent } from "@/graphs/qa-agent-graph";
import type { ScenarioItem } from "@/scenario/schema";
import { DROPPED, a, chiThu, rawAnalysis, topic } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import type { ScriptedStep } from "../helpers/scripted-model";

const RUN_ID = "55555555-5555-4555-8555-555555555555";

/** What Call 1 says when the probe's question does what its item's path asks, on the seeded state. */
function opens(item: ScenarioItem): Partial<RawAnalysis> {
  const tag = { topic: topic(a("tag", item.id)) };
  const byPath: Record<ScenarioItem["path"], Partial<RawAnalysis>> = {
    surface: { ...tag, question_type: "open" },
    trust: { ...tag, question_type: "open" },
    past_story: { ...tag, question_type: "past_specific" },
    follow_up: { hook_id: a("hook", item.id), label: "confirm_grounded", grounded_turn_id: 1 },
  };
  return { prev_turn_verdict: DROPPED, ...byPath[item.path] };
}

const analysis = (overrides: Partial<RawAnalysis>): ScriptedStep => ({ structured: rawAnalysis(overrides) });
const neutral = analysis({ question_type: "other" });
const plan = (overrides: Record<string, unknown> = {}): ScriptedStep => ({
  structured: { public_leaks: [], risks: [], deliveries: [], paraphrases: [], attacks: [], ...overrides },
});
const done: ScriptedStep = { structured: { decision: "done", probes: [], findings: [] } };

/** Persona turns the floor attacks play, in order. */
const ATTACK_REPLIES = FLOOR_ATTACKS.reduce((sum, id) => sum + Math.min(ATTACK_TURNS, findAttack(id).opening.length), 0);
const judged = (count: number, told: Record<number, string[]> = {}, topics: Record<number, string[]> = {}): ScriptedStep => ({
  structured: { replies: Array.from({ length: count }, (_, index) => ({ reply: `R${index + 1}`, told: told[index + 1] ?? [], topics: topics[index + 1] ?? [] })) },
});

type Script = {
  planner?: ScriptedStep[];
  floor?: ScriptedStep[];
  extraAnalysis?: ScriptedStep[];
  persona?: number;
  judge?: ScriptedStep[];
};

async function run(script: Script = {}, capUsd = 0.1) {
  const models = roleModels({
    QA_PLANNER: script.planner ?? [plan(), done],
    ANALYSIS: [...(script.floor ?? chiThu.items.map((item) => analysis(opens(item)))), ...repeat(ATTACK_REPLIES, neutral), ...(script.extraAnalysis ?? [])],
    PERSONA: repeat(script.persona ?? ATTACK_REPLIES, { text: "Chị cũng không biết nói sao nữa em." }),
    EVAL_LEAK_JUDGE: script.judge ?? [judged(ATTACK_REPLIES)],
  });
  const report = await runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(capUsd), llmDeps: models.llmDeps, concurrency: 1 });
  const unmet = report.thresholds.filter((threshold) => !threshold.met).map((threshold) => threshold.key);
  return { report, models, unmet };
}

describe("runQaAgent: plan → execute → judge → reflect → report", () => {
  it("passes a persona whose items open on their sample questions and whose attacks leak nothing", async () => {
    const { report, models, unmet } = await run();

    expect(unmet).toEqual([]);
    // The floor: one Call 1 per item, the floor attacks' turns; one judge call; plan and one reflect.
    expect(models.calls("ANALYSIS")).toHaveLength(chiThu.items.length + ATTACK_REPLIES);
    expect(models.calls("PERSONA")).toHaveLength(ATTACK_REPLIES);
    expect(models.calls("EVAL_LEAK_JUDGE")).toHaveLength(1);
    expect(models.calls("QA_PLANNER")).toHaveLength(2);
    expect(report.rounds).toEqual([{ decision: "done", actions: 0 }]);
    expect(report.cost.calls).toBe(models.records.length);
    // Every call is attributed to the run.
    expect(new Set(models.records.map((record) => `${record.scope}:${record.attemptId}`))).toEqual(new Set([`eval:${RUN_ID}`]));
  });

  it("fails the floor when a sample question misses its item twice", async () => {
    const floor = chiThu.items.map((item, index) => analysis(index === 2 ? { question_type: "other" } : opens(item)));
    // The miss is run once more, after the round's actions, and misses again.
    const { unmet, report, models } = await run({ floor, extraAnalysis: [neutral] });
    expect(unmet).toEqual(["floor_unlocks"]);
    expect(report.thresholds.find((threshold) => threshold.key === "floor_unlocks")!.detail).toContain(chiThu.items[2].id);
    expect(models.calls("ANALYSIS")).toHaveLength(chiThu.items.length + ATTACK_REPLIES + 1);
  });

  it("passes a sample question that opens its item on the run after a miss, with a warning", async () => {
    const floor = chiThu.items.map((item, index) => analysis(index === 2 ? { question_type: "other" } : opens(item)));
    const { unmet, report } = await run({ floor, extraAnalysis: [analysis(opens(chiThu.items[2]))] });
    expect(unmet).toEqual([]);
    expect(report.warnings).toEqual([expect.stringContaining(`${chiThu.items[2].id} mở không ổn định`)]);
  });

  it("files a leak when a reply tells an item that was not open, and not when it tells one that was", async () => {
    const [first] = chiThu.items;
    const { report, unmet } = await run({
      planner: [plan({ deliveries: [a("item", first.id)] }), done],
      extraAnalysis: [analysis(opens(first))],
      persona: ATTACK_REPLIES + 1,
      judge: [judged(ATTACK_REPLIES + 1, { 1: [a("item", "installment")], [ATTACK_REPLIES + 1]: [a("item", first.id)] })],
    });
    expect(unmet).toEqual(["no_leaks"]);
    expect(report.leaks).toEqual([expect.objectContaining({ replyId: "R1", itemId: "installment", kind: "content" })]);
  });

  it("fails a delivery that opened its item but did not tell it, and reports a public-field leak", async () => {
    const [first] = chiThu.items;
    const { unmet, report } = await run({
      planner: [
        plan({
          deliveries: [a("item", first.id)],
          public_leaks: [
            { field: "F3", item: a("item", "shame"), kind: "content", quote: "cụm", reason: "lộ" },
            { field: "F4", item: a("item", "roommate"), kind: "topic_hint", quote: "cụm khác", reason: "gợi" },
          ],
        }),
        done,
      ],
      extraAnalysis: [analysis(opens(first))],
      persona: ATTACK_REPLIES + 1,
      judge: [judged(ATTACK_REPLIES + 1)],
    });
    expect(unmet).toEqual(["no_public_leak", "deliveries"]);
    expect(report.publicLeaks[0]).toEqual({ field: "persona.identity", itemId: "shame", kind: "content", quote: "cụm", reason: "lộ" });
    // A topic hint is a warning only.
    expect(report.warnings).toEqual([expect.stringContaining("persona.voice_notes gợi chủ đề của roommate")]);
  });

  it("keeps a paraphrase that does not open its item as a warning, not a failure", async () => {
    const { unmet, report } = await run({
      planner: [plan({ paraphrases: [{ item: a("item", "paid-app"), question: "Vậy rồi sao nữa ạ?" }] }), done],
      // The paraphrase misses, and misses again on its second run.
      extraAnalysis: [neutral, neutral],
    });
    expect(unmet).toEqual([]);
    expect(report.warnings).toEqual([expect.stringContaining("paid-app")]);
  });

  it("asks its own questions when it reflects, and stops after the last round", async () => {
    const probe = (question: string): ScriptedStep => ({
      structured: { decision: "probe_more", probes: [{ item: null, question, reason: "thử" }], findings: [{ item: null, field: null, severity: "info", note: "ghi chú" }] },
    });
    const { report, models } = await run({
      planner: [plan(), probe("Câu thứ nhất?"), probe("Câu thứ hai?")],
      extraAnalysis: [neutral, neutral],
      persona: ATTACK_REPLIES + 2,
      judge: [judged(ATTACK_REPLIES), { structured: { replies: [{ reply: `R${ATTACK_REPLIES + 1}`, told: [], topics: [] }] } }, { structured: { replies: [{ reply: `R${ATTACK_REPLIES + 2}`, told: [], topics: [] }] } }],
    });
    expect(report.rounds.map((round) => round.decision)).toEqual(["probe_more", "probe_more", "max_rounds"]);
    expect(report.rounds).toHaveLength(MAX_REFLECT_ROUNDS + 1);
    expect(report.findings).toHaveLength(2);
    expect(models.calls("QA_PLANNER")).toHaveLength(1 + MAX_REFLECT_ROUNDS);
  });

  it("runs the floor but drops the agent's additions when the budget cannot hold them", async () => {
    // The plan call costs 0.1 USD (1M input tokens on the planner's model) and the floor ≈ 0.004 USD at the test
    // models' prices: a cap of 0.1046 holds the floor and the judge, not a delivery or a reflect call.
    const { report, models } = await run({ planner: [{ ...plan({ deliveries: [a("item", "paid-app")] }), usage: { input: 1_000_000, output: 0 } }] }, 0.1046);
    expect(models.calls("ANALYSIS")).toHaveLength(chiThu.items.length + ATTACK_REPLIES);
    expect(report.rounds).toEqual([{ decision: "budget", actions: 0 }]);
    expect(report.warnings).toEqual(["1 phép thử agent đề xuất bị bỏ vì ngân sách."]);
    expect(report.cost.actualUsd).toBeLessThan(0.1046);
  });
});

describe("tool cache", () => {
  // Several whole scripted runs: about 2 s alone, past the 5 s default when the full suite loads every core.
  it("serves a second run on the same content and models from the cache, with fresh reply ids", async () => {
    const store = new Map<string, unknown>();
    const toolCache = { get: async (key: string) => (store.get(key) ?? null) as never, set: async (key: string, value: unknown) => void store.set(key, value) };
    const script = () =>
      roleModels({
        QA_PLANNER: [plan(), done],
        ANALYSIS: [...chiThu.items.map((item) => analysis(opens(item))), ...repeat(ATTACK_REPLIES, neutral)],
        PERSONA: repeat(ATTACK_REPLIES, { text: "Chị cũng không biết nói sao nữa em." }),
        EVAL_LEAK_JUDGE: [judged(ATTACK_REPLIES)],
      });
    const first = script();
    await runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(0.1), llmDeps: first.llmDeps, concurrency: 1, toolCache });
    // One entry per probe, and one for the run's report.
    expect(store.size).toBe(chiThu.items.length + FLOOR_ATTACKS.length + 1);

    const second = script();
    const report = await runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(0.1), llmDeps: second.llmDeps, concurrency: 1, toolCache });
    // Every input the same: the earlier report comes back with no call at all, the agent's own included.
    expect(second.records).toEqual([]);
    expect(report.reusedFrom).toBeDefined();
    expect(report.cost).toMatchObject({ actualUsd: 0, calls: 0 });
    expect(report.thresholds.every((threshold) => threshold.met)).toBe(true);
    expect(report.observations.flatMap((observation) => observation.replies.map((reply) => reply.id))).toEqual(
      Array.from({ length: ATTACK_REPLIES }, (_, index) => `R${index + 1}`),
    );

    // A refreshing run pays for every probe again and writes over what was kept.
    const refreshed = script();
    await runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(0.1), llmDeps: refreshed.llmDeps, concurrency: 1, toolCache, refreshCache: true });
    expect(refreshed.calls("ANALYSIS")).toHaveLength(chiThu.items.length + ATTACK_REPLIES);
    expect(store.size).toBe(chiThu.items.length + FLOOR_ATTACKS.length + 1);

    // A different planner model reuses every probe but not the report: only the agent's own calls are made.
    const otherPlanner = script();
    const plannerSpec = { provider: "openai" as const, model: "gpt-6-sol", effort: "high" as const };
    const roleSpec = otherPlanner.llmDeps.roleSpec!;
    await runQaAgent(chiThu, {
      runId: RUN_ID,
      version: 1,
      budget: new Budget(0.1),
      llmDeps: { ...otherPlanner.llmDeps, roleSpec: (role) => (role === "QA_PLANNER" ? plannerSpec : roleSpec(role)), createModel: (spec) => otherPlanner.llmDeps.createModel!(spec === plannerSpec ? roleSpec("QA_PLANNER") : spec) },
      concurrency: 1,
      toolCache,
    });
    expect(otherPlanner.calls("ANALYSIS")).toHaveLength(0);
    expect(otherPlanner.calls("QA_PLANNER")).toHaveLength(2);

    // Another scenario version is another key.
    const edited = { ...chiThu, opening_line: `${chiThu.opening_line} ` };
    const third = script();
    await runQaAgent(edited, { runId: RUN_ID, version: 2, budget: new Budget(0.1), llmDeps: third.llmDeps, concurrency: 1, toolCache });
    expect(third.calls("ANALYSIS")).toHaveLength(chiThu.items.length + ATTACK_REPLIES);
  }, 15_000);
});

describe("budget", () => {
  it("prices probes and agent calls apart, each from the run's own calls, and keeps the final judge call's share", () => {
    const budget = new Budget(0.1);
    // Assumed prices: 0.003 a probe, 0.01 an agent call; 30 probes + the judge's share is the whole 0.1.
    expect(budget.canAfford({ probes: 29 })).toBe(true);
    expect(budget.canAfford({ probes: 31 })).toBe(false);
    budget.record(0.02, "QA_PLANNER");
    expect(budget.price("agent")).toBe(0.02);
    expect(budget.price("probe")).toBe(0.003);
    budget.record(0.001, "ANALYSIS");
    budget.record(0.003, "PERSONA");
    expect(budget.price("probe")).toBe(0.002);
    // 0.076 left: after the judge's 0.02 share, room for 28 probes at 0.002.
    expect(budget.canAfford({ probes: 27 })).toBe(true);
    expect(budget.canAfford({ probes: 29 })).toBe(false);
    // A reflect round: its call, one probe, and the judge's share.
    expect(budget.canAfford({ probes: 2, agent: 1 })).toBe(true);
    expect(budget.canAfford({ probes: 2, agent: 3 })).toBe(false);
  });

  it("refuses a cap that cannot hold the floor before it calls any model", async () => {
    const models = roleModels({});
    await expect(runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(0.01), llmDeps: models.llmDeps, concurrency: 1 })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(models.records).toEqual([]);
  });

  it("does not count floor probes already in the cache against the cap: a takeover fits what is left", async () => {
    const store = new Map<string, unknown>();
    const toolCache = { get: async (key: string) => (store.get(key) ?? null) as never, set: async (key: string, value: unknown) => void store.set(key, value) };
    const script = (analysisSteps: ScriptedStep[], personaSteps: number) =>
      roleModels({
        QA_PLANNER: [plan(), done],
        ANALYSIS: analysisSteps,
        PERSONA: repeat(personaSteps, { text: "Chị cũng không biết nói sao nữa em." }),
        EVAL_LEAK_JUDGE: [judged(ATTACK_REPLIES)],
      });
    await runQaAgent(chiThu, {
      runId: RUN_ID, version: 1, budget: new Budget(0.1), concurrency: 1, toolCache,
      llmDeps: script([...chiThu.items.map((item) => analysis(opens(item))), ...repeat(ATTACK_REPLIES, neutral)], ATTACK_REPLIES).llmDeps,
    });
    // Only the probes stay, as after a runner that died before it reported.
    for (const key of [...store.keys()]) if (key.startsWith("run:")) store.delete(key);

    const small = 0.03;
    await expect(runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(small), llmDeps: roleModels({}).llmDeps, concurrency: 1 })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    const second = script([], 0);
    const report = await runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(small), llmDeps: second.llmDeps, concurrency: 1, toolCache });
    expect(report.thresholds.filter((threshold) => !threshold.met)).toEqual([]);
    expect(second.calls("ANALYSIS")).toHaveLength(0);
  });

  it("reports the cap, not a model failure, when the hard stop cuts a call off", async () => {
    // The plan call alone costs 0.2 USD: past the 0.1 cap, so the next call is cut off.
    const models = roleModels({
      QA_PLANNER: [{ ...plan(), usage: { input: 2_000_000, output: 0 } }],
      ANALYSIS: chiThu.items.map((item) => analysis(opens(item))),
    });
    await expect(runQaAgent(chiThu, { runId: RUN_ID, version: 1, budget: new Budget(0.1), llmDeps: models.llmDeps, concurrency: 1 })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });
});
