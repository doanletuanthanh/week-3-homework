import { describe, expect, it } from "vitest";
import { applyVerdict } from "@/engine/apply-verdict";
import type { TranscriptLine } from "@/engine/contexts";
import type { EngineState, RawAnalysis, Verdict } from "@/engine/types";
import { assertIsolated } from "@/eval/isolation";
import { runTurnGraph, type TurnGraphResult, type TurnRunOptions } from "@/graphs/turn-graph";
import { LlmCallError } from "@/llm/call-model";
import { NO_VERDICT, a, chiThu, rawAnalysis } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";
import { QUESTIONS, playedSession } from "../helpers/reveal-fixtures";
import type { ScriptedStep } from "../helpers/scripted-model";

const target = chiThu.items.find((item) => item.id === "paid-app")!;
const FORK = 2;

/** The main session's snapshot at the fork, with the verdict about that turn, and the turns up to it. */
function forkOf() {
  const main = playedSession();
  const state = main.plans.find((plan) => plan.turnIndex === FORK + 1)!.previousState;
  return { main, state, transcript: main.transcript.filter((line) => line.index <= FORK) };
}

/** The question that picks up the target's hook: grounded on the turn that dropped it. */
const PICK_UP: Partial<RawAnalysis> = { hook_id: a("hook", "paid-app"), label: "confirm_grounded", grounded_turn_id: FORK };
const toldTarget: Verdict = { hook_dropped: false, disclosed_item_ids: [a("item", "paid-app")], violations: [] };
const judged = (verdict: Verdict = NO_VERDICT): ScriptedStep => ({ structured: { prev_turn_verdict: verdict } });
const failing = (): ScriptedStep[] => Array.from({ length: 3 }, () => ({ error: new Error("provider down") }));

type Step = { analysis?: Partial<RawAnalysis>; persona?: string; judge?: ScriptedStep[]; question?: string };

/** Plays replay turns in memory the way the server does: the graph, then the judge's verdict applied to the turn's state. */
async function replay(steps: Step[], options: Partial<TurnRunOptions> = {}) {
  const { state: start, transcript: shared } = forkOf();
  const models = roleModels({
    ANALYSIS: steps.map((step) => ({ structured: rawAnalysis(step.analysis) })),
    PERSONA: steps.map((step, position) => ({ text: step.persona ?? `Câu trả lời luyện lại ${position + 1}.` })),
    REPLAY_JUDGE: steps.flatMap((step) => step.judge ?? [judged()]),
  });
  let state: EngineState = start;
  const transcript: TranscriptLine[] = [...shared];
  const results: TurnGraphResult[] = [];
  for (const [position, step] of steps.entries()) {
    const question = step.question ?? `Câu hỏi luyện lại ${position + 1} của em ạ?`;
    const result = await runTurnGraph(
      { scenario: chiThu, state, transcript: [...transcript], question },
      { scope: { scope: "session" }, meta: {}, llmDeps: models.llmDeps, priorityItemId: target.id, judge: { labelQuestion: false }, ...options },
    );
    results.push(result);
    const { judgement, plan } = result;
    state = judgement?.ok ? applyVerdict(chiThu, plan.stateAfter, judgement.verdict).state : plan.stateAfter;
    transcript.push({ index: plan.turnIndex, learnerText: question, personaText: result.personaText });
  }
  return { models, results, state, transcript };
}

const rolesCalled = (models: ReturnType<typeof roleModels>) => models.records.map((record) => record.role);

describe("a replay turn through the turn graph", () => {
  it("makes three logical calls in order: Call 1, Call 2, then the judge", async () => {
    const order: string[] = [];
    const { models, results } = await replay([{}], {
      onPersonaDelta: () => order.push("delta"),
      onJudging: () => order.push("judging"),
    });

    expect(rolesCalled(models)).toEqual(["ANALYSIS", "PERSONA", "REPLAY_JUDGE"]);
    expect(results[0].judgement).toEqual({ ok: true, verdict: NO_VERDICT, label: null });
    // The judge starts only once the whole reply has been written.
    expect(order.at(-1)).toBe("judging");
    expect(order.filter((entry) => entry === "judging")).toHaveLength(1);
    expect(order.indexOf("delta")).toBeLessThan(order.indexOf("judging"));
  });

  it("hands the judge the reply that was just written, as the turn it judges", async () => {
    const { models } = await replay([{ persona: "Chị có tải một cái app rồi quên mất." }]);
    const [prompt] = models.prompts("REPLAY_JUDGE");
    expect(prompt).toContain(`[lượt ${FORK + 1}] nhân vật: Chị có tải một cái app rồi quên mất.`);
    expect(prompt).toContain(`<luot_can_phan_doan>${FORK + 1}</luot_can_phan_doan>`);
  });

  it("makes two calls and no judge call on a main turn", async () => {
    const { state, transcript } = forkOf();
    const models = roleModels({ ANALYSIS: [{ structured: rawAnalysis() }], PERSONA: [{ text: "Dạ." }] });
    const result = await runTurnGraph({ scenario: chiThu, state, transcript, question: "Chị kể thêm ạ?" }, { scope: { scope: "session" }, meta: {}, llmDeps: models.llmDeps });
    expect(rolesCalled(models)).toEqual(["ANALYSIS", "PERSONA"]);
    expect(result.judgement).toBeUndefined();
  });

  it("does not read the verdict in Call 1's output: only the judge can say a hook was dropped or an item told", async () => {
    const { state: start } = forkOf();
    const lying: Partial<RawAnalysis> = { prev_turn_verdict: { hook_dropped: true, disclosed_item_ids: [a("item", "money-home"), a("item", "last-attempt")], violations: [a("doNotAssert", "shame")] } };
    const { results } = await replay([{ analysis: lying }]);
    const { plan } = results[0];

    expect(plan.verdict).toEqual(NO_VERDICT);
    expect(plan.previousState).toEqual(start);
    expect(plan.stateAfter.disclosed).toEqual(start.disclosed);
    expect(plan.stateAfter.ledger.map((entry) => entry.itemId)).toEqual(start.ledger.map((entry) => entry.itemId));
  });

  it("the sample question at replay turn 2 opens the target, and the persona is told to say it at once", async () => {
    const { models, results, state } = await replay([{}, { analysis: PICK_UP, question: target.sample_question, judge: [judged(toldTarget)] }]);

    expect(results[0].plan.unlockedItemId).toBeNull();
    expect(results[1].plan.unlockedItemId).toBe(target.id);
    const personaPrompt = models.prompts("PERSONA")[1];
    expect(personaPrompt).toMatch(new RegExp(`<dieu_noi_ngay>\\n- ${target.content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n</dieu_noi_ngay>`));
    // Before it opened, neither Call 2 nor the judge was given it.
    expect(models.prompts("PERSONA")[0]).not.toContain(target.content);
    expect(models.prompts("REPLAY_JUDGE")[0]).not.toContain(target.content);
    // The judge of the opening turn sees it as open and not told yet, and its verdict is what tells it.
    expect(models.prompts("REPLAY_JUDGE")[1]).toContain(`${a("item", target.id)} (chưa kể): ${target.content}`);
    expect(results[1].judgement).toEqual({ ok: true, verdict: { ...toldTarget, disclosed_item_ids: [target.id] }, label: null });
    expect(state.disclosed).toContainEqual({ itemId: target.id, turn: FORK + 2 });
  });

  it.each([1, 2, 3])("keeps the target's hook pickable: it still opens when picked up at replay turn %i", async (turn) => {
    const steps: Step[] = [...Array.from({ length: turn - 1 }, () => ({})), { analysis: PICK_UP }];
    const { results } = await replay(steps);
    expect(results.map((result) => result.plan.unlockedItemId)).toEqual([...Array.from({ length: turn - 1 }, () => null), target.id]);
  });

  it("opens the target first when another item's rule holds too", async () => {
    // `last-attempt` (a past-story item) and the heavier `paid-app` both qualify on this question.
    const both: Partial<RawAnalysis> = { ...PICK_UP, topic_tags: [a("tag", "last-attempt")], question_type: "past_specific" };
    const heavier = await replay([{ analysis: both }]);
    expect(heavier.results[0].plan.unlockedItemId).toBe("paid-app");

    const { state, transcript } = forkOf();
    const models = roleModels({ ANALYSIS: [{ structured: rawAnalysis(both) }], PERSONA: [{ text: "Dạ." }], REPLAY_JUDGE: [judged()] });
    const result = await runTurnGraph(
      { scenario: chiThu, state, transcript, question: "Lần gần nhất chị định ghi lại là khi nào ạ?" },
      { scope: { scope: "session" }, meta: {}, llmDeps: models.llmDeps, priorityItemId: "last-attempt", judge: { labelQuestion: false } },
    );
    expect(result.plan.unlockedItemId).toBe("last-attempt");
    expect(result.plan.rules.filter((run) => run.outcome === "satisfied").map((run) => run.itemId).sort()).toEqual(["last-attempt", "paid-app"]);
  });

  it("a judge that fails after its retries does not fail the turn: the reply stands, with no verdict", async () => {
    const { models, results, state } = await replay([{ analysis: PICK_UP, persona: "Chị vẫn bị trừ tiền hằng tháng.", judge: failing() }]);

    expect(results[0].personaText).toBe("Chị vẫn bị trừ tiền hằng tháng.");
    expect(results[0].judgement).toEqual({ ok: false });
    expect(results[0].plan.unlockedItemId).toBe(target.id);
    // Opened, but nobody confirmed the persona told it.
    expect(state.disclosed.map((entry) => entry.itemId)).not.toContain(target.id);
    expect(models.records.filter((record) => record.role === "REPLAY_JUDGE").map((record) => [record.attempt, record.ok])).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ]);
  });

  it("still fails the turn when Call 1 or Call 2 fails, and then calls no judge", async () => {
    const { state, transcript } = forkOf();
    const run = (script: Parameters<typeof roleModels>[0]) => {
      const models = roleModels(script);
      const turn = runTurnGraph(
        { scenario: chiThu, state, transcript, question: "Chị kể thêm ạ?" },
        { scope: { scope: "session" }, meta: {}, llmDeps: models.llmDeps, judge: { labelQuestion: false } },
      );
      return { models, turn };
    };

    const noPersona = run({ ANALYSIS: [{ structured: rawAnalysis() }], PERSONA: failing(), REPLAY_JUDGE: [judged()] });
    await expect(noPersona.turn).rejects.toBeInstanceOf(LlmCallError);
    expect(noPersona.models.calls("REPLAY_JUDGE")).toHaveLength(0);

    const noAnalysis = run({ ANALYSIS: failing(), PERSONA: [{ text: "Dạ." }], REPLAY_JUDGE: [judged()] });
    await expect(noAnalysis.turn).rejects.toBeInstanceOf(LlmCallError);
    expect(noAnalysis.models.calls("PERSONA")).toHaveLength(0);
    expect(noAnalysis.models.calls("REPLAY_JUDGE")).toHaveLength(0);
  });
});

describe("the replay judge of a leading-question replay", () => {
  const QUESTION = "Chắc tại chị lười nên mới bỏ đúng không ạ?";
  const labelled = (label: string, span: number[] | null): ScriptedStep => ({ structured: { prev_turn_verdict: NO_VERDICT, label, introduced_span: span } });
  const labelOf = async (step: ScriptedStep) => {
    const { results, models } = await replay([{ question: QUESTION, judge: [step] }], { judge: { labelQuestion: true } });
    return { judgement: results[0].judgement, prompt: models.prompts("REPLAY_JUDGE")[0] };
  };

  it("is asked for its own label of the learner's question, with the question's tokens numbered", async () => {
    const { prompt, judgement } = await labelOf(labelled("leading", [1, 3]));
    expect(prompt).toContain("Gán nhãn cho câu hỏi của người hỏi trong <cau_hoi_can_gan_nhan>");
    expect(prompt).toContain("<cau_hoi_can_gan_nhan>\n0:Chắc 1:tại 2:chị 3:lười 4:nên 5:mới 6:bỏ 7:đúng 8:không 9:ạ?\n</cau_hoi_can_gan_nhan>");
    expect(prompt).toContain(`Câu hỏi của người hỏi ở lượt ${FORK + 1}`);
    expect(judgement).toEqual({ ok: true, verdict: NO_VERDICT, label: "leading" });
  });

  it.each([
    ["no span", null],
    ["a span outside the question", [8, 14]],
    ["a span that runs backwards", [3, 1]],
    ["a span of one number", [2]],
  ] as [string, number[] | null][])("turns `leading` with %s into `open`: the label needs words to point at", async (_name, span) => {
    expect((await labelOf(labelled("leading", span))).judgement).toEqual({ ok: true, verdict: NO_VERDICT, label: "open" });
  });

  it.each(["open", "confirm_grounded", "boundary_probe"])("keeps the label %s as the judge gave it", async (label) => {
    expect((await labelOf(labelled(label, null))).judgement).toMatchObject({ ok: true, label });
  });

  it("is not asked for a label on a primary replay", async () => {
    const { models, results } = await replay([{ question: QUESTION }]);
    expect(models.prompts("REPLAY_JUDGE")[0]).not.toContain("cau_hoi_can_gan_nhan");
    expect(results[0].judgement).toMatchObject({ label: null });
  });

  it("fails as a judge, not as a turn, when its reply has no label", async () => {
    const { results } = await replay([{ question: QUESTION, judge: Array.from({ length: 3 }, () => judged()) }], { judge: { labelQuestion: true } });
    expect(results[0].judgement).toEqual({ ok: false });
  });
});

describe("isolation on a replay branch (PRD §12.2 item 3)", () => {
  const afterFork = () => {
    const { main } = forkOf();
    return main.transcript.filter((line) => line.index > FORK).flatMap((line) => [line.learnerText!, line.personaText]);
  };

  it("gives none of the three calls a locked item, on any of the three turns", async () => {
    const seen: string[] = [];
    const { models } = await replay([{}, { analysis: PICK_UP, judge: [judged(toldTarget)] }, {}], {
      onContext: (subject, state) => {
        seen.push(subject.call);
        assertIsolated(chiThu, state, subject);
      },
    });
    expect(seen).toEqual(["ANALYSIS", "PERSONA", "REPLAY_JUDGE", "ANALYSIS", "PERSONA", "REPLAY_JUDGE", "ANALYSIS", "PERSONA", "REPLAY_JUDGE"]);

    // Turn 1, before anything opened on the branch: the target and every other locked item are absent.
    const locked = chiThu.items.filter((item) => !["money-home"].includes(item.id));
    for (const role of ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] as const) {
      const prompt = models.prompts(role)[0];
      for (const item of locked) {
        expect(prompt, `${role} / ${item.id}`).not.toContain(item.content);
        expect(prompt, `${role} / ${item.id}`).not.toContain(item.sample_question);
      }
    }
  });

  it("gives no call anything the main interview said after the fork", async () => {
    const { models } = await replay([{}, {}, {}], { judge: { labelQuestion: true } });
    const later = afterFork();
    expect(later).toContain(QUESTIONS[4]);
    for (const role of ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] as const) {
      for (const [position, prompt] of models.prompts(role).entries()) {
        for (const line of later) expect(prompt, `${role} at replay turn ${position + 1}`).not.toContain(line);
        // What the main interview said up to the fork is there.
        expect(prompt).toContain(QUESTIONS[2]);
      }
    }
  });

  it("stops the turn when a context holds sealed material, before the call is made", async () => {
    const { state, transcript } = forkOf();
    const models = roleModels({ ANALYSIS: [{ structured: rawAnalysis() }], PERSONA: [{ text: "Dạ." }], REPLAY_JUDGE: [judged()] });
    const leaking = { ...chiThu, surface_facts: [...chiThu.surface_facts, target.content] };
    const turn = runTurnGraph(
      { scenario: leaking, state, transcript, question: "Chị kể thêm ạ?" },
      { scope: { scope: "session" }, meta: {}, llmDeps: models.llmDeps, judge: { labelQuestion: false }, onContext: (subject, at) => assertIsolated(leaking, at, subject) },
    );
    await expect(turn).rejects.toThrow("context isolation broken in ANALYSIS");
    expect(models.records).toHaveLength(0);
  });

  it("does not mistake the learner's own words for a leak when the judge is handed the question to label", async () => {
    const [term] = target.secret_terms;
    const question = `Chị có ${term} gì không ạ?`;
    await expect(
      replay([{ question }], { judge: { labelQuestion: true }, onContext: (subject, state) => assertIsolated(chiThu, state, subject) }).then(({ models }) => models.prompts("REPLAY_JUDGE")[0]),
    ).resolves.toContain(term);
  });
});
