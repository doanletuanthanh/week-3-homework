import { describe, expect, it } from "vitest";
import { findAttack } from "@/eval/attacks";
import { IsolationError } from "@/eval/isolation";
import { RateLimitError, runEpisode } from "@/eval/run-episode";
import { LlmCallError } from "@/llm/call-model";
import { episodeSpecs, estimateRun, runEpisodes } from "@/eval/run-eval";
import type { EpisodeSpec } from "@/eval/types";
import { DROPPED, NO_VERDICT, a, chiThu, rawAnalysis, told } from "../helpers/engine-fixtures";
import { NO_FINDINGS, repeat, roleModels } from "../helpers/eval-models";
import type { ScriptedStep } from "../helpers/scripted-model";
import { findSealed } from "../helpers/sealed-strings";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const options = (models: ReturnType<typeof roleModels>) => ({ runId: RUN_ID, llmDeps: models.llmDeps, rateLimitDelaysMs: [] });

const good = (turns: number): EpisodeSpec => ({ key: "good-1", kind: "good", turns });

/** Three turns that open a surface item, get a hook dropped, and open its follow-up item. */
const threeTurns = () => ({
  EVAL_INTERVIEWER: [
    { structured: { question: "Khoản gửi về nhà chị tính thế nào ạ?" } },
    { structured: { question: '"Chị có hay định ghi lại chi tiêu không ạ?"' } },
    { structured: { question: "Lần chị định ghi lại đó,\n chị định ghi kiểu gì ạ?" } },
  ],
  ANALYSIS: [
    { structured: rawAnalysis({ topic_tags: [a("tag", "money-home")], question_type: "open" }) },
    { structured: rawAnalysis({ prev_turn_verdict: told("money-home"), topic_tags: [a("tag", "paid-app")] }) },
    {
      structured: rawAnalysis({
        prev_turn_verdict: DROPPED,
        hook_id: a("hook", "paid-app"),
        label: "confirm_grounded",
        grounded_turn_id: 2,
      }),
    },
  ],
  PERSONA: [{ text: "Câu trả lời một." }, { text: "Câu trả lời hai." }, { text: "Câu trả lời ba." }],
});

function threeTurnScript() {
  return roleModels({
    ...threeTurns(),
    REPLAY_JUDGE: [{ structured: { prev_turn_verdict: told("paid-app") } }],
    EVAL_LEAK_JUDGE: [NO_FINDINGS],
  });
}

describe("runEpisode on the engine", () => {
  it("plays the learner through the production turn graph and reports what opened", async () => {
    const models = threeTurnScript();

    const result = await runEpisode(chiThu, good(3), options(models));

    expect(result).toMatchObject({ key: "good-1", kind: "good", openedItemIds: ["money-home", "paid-app"], flags: [], contradictions: [] });
    expect(result.turns).toEqual([
      expect.objectContaining({ index: 1, question: "Khoản gửi về nhà chị tính thế nào ạ?", unlockedItemId: "money-home", hookSelected: null, hookDropped: null }),
      // The reply was wrapped in quotes: the question is what a learner would have typed.
      expect.objectContaining({ index: 2, question: "Chị có hay định ghi lại chi tiêu không ạ?", unlockedItemId: null, hookSelected: "paid-app", hookDropped: true }),
      expect.objectContaining({ index: 3, question: "Lần chị định ghi lại đó, chị định ghi kiểu gì ạ?", label: "confirm_grounded", unlockedItemId: "paid-app" }),
    ]);
  });

  it("makes two engine calls per turn, one turn judge and one leak judge, all billed to the run", async () => {
    const models = threeTurnScript();

    const result = await runEpisode(chiThu, good(3), options(models));

    for (const turnIndex of [1, 2, 3]) {
      const engineCalls = models.records.filter((record) => record.turnIndex === turnIndex && record.role !== "EVAL_INTERVIEWER");
      expect(engineCalls.map((record) => record.role), `turn ${turnIndex}`).toEqual(turnIndex === 3 ? ["ANALYSIS", "PERSONA", "REPLAY_JUDGE"] : ["ANALYSIS", "PERSONA"]);
    }
    expect(models.calls("EVAL_INTERVIEWER")).toHaveLength(3);
    expect(models.calls("EVAL_LEAK_JUDGE")).toHaveLength(1);
    expect(models.records.every((record) => record.scope === "eval" && record.attemptId === RUN_ID && record.sessionId === undefined)).toBe(true);
    expect(result.costUsd).toBeCloseTo(models.records.reduce((sum, record) => sum + record.costUsd, 0), 12);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("shows the simulated learner only what a learner sees: no item, tag, hook or sample question", async () => {
    const models = threeTurnScript();

    await runEpisode(chiThu, good(3), options(models));

    for (const prompt of models.prompts("EVAL_INTERVIEWER")) {
      expect(findSealed(prompt, chiThu)).toEqual([]);
      expect(prompt).toContain(chiThu.research_goal);
    }
    // The third question is asked after two replies: the learner has read both.
    expect(models.prompts("EVAL_INTERVIEWER")[2]).toContain("Câu trả lời hai.");
  });

  it("gives the leak judge every item, what was open at each turn, and the hook the persona was allowed to say", async () => {
    const models = threeTurnScript();

    await runEpisode(chiThu, good(3), options(models));

    const [prompt] = models.prompts("EVAL_LEAK_JUDGE");
    for (const item of chiThu.items) expect(prompt).toContain(item.content);
    expect(prompt).toContain(`[lượt 1] đã mở tới lượt này: ${a("item", "money-home")}`);
    expect(prompt).toContain("[lượt 1] câu gợi mở được phép: (không có)");
    const paidApp = chiThu.items.find((item) => item.id === "paid-app")!;
    expect(prompt).toContain(`[lượt 2] câu gợi mở được phép: "${paidApp.hook_line}"`);
    expect(prompt).toContain(`[lượt 3] đã mở tới lượt này: ${a("item", "money-home")}, ${a("item", "paid-app")}`);
  });

  it("keeps a flag only for an item that was locked at that turn, and adds secret-term matches", async () => {
    const models = roleModels({
      EVAL_INTERVIEWER: repeat(2, { structured: { question: "Chị kể thêm đi ạ?" } }),
      ANALYSIS: [
        { structured: rawAnalysis({ topic_tags: [a("tag", "money-home")] }) },
        { structured: rawAnalysis({ prev_turn_verdict: NO_VERDICT }) },
      ],
      PERSONA: [{ text: "Chị gửi ba mẹ đều đó em." }, { text: "Chị có làm file Excel mà rồi cũng bỏ." }],
      REPLAY_JUDGE: [{ structured: { prev_turn_verdict: NO_VERDICT } }],
      EVAL_LEAK_JUDGE: [
        {
          structured: {
            flags: [
              // money-home opened at turn 1: telling it is not a leak.
              { turn: 1, item: a("item", "money-home"), kind: "content", excerpt: "Chị gửi ba mẹ", reason: "đã mở" },
              { turn: 2, item: a("item", "shame"), kind: "topic", excerpt: "câu không có trong lời nhân vật", reason: "nêu cảm giác" },
              { turn: 2, item: "I99", kind: "content", excerpt: "x", reason: "mã không có" },
              { turn: 9, item: a("item", "shame"), kind: "content", excerpt: "x", reason: "lượt không có" },
            ],
            contradictions: [{ turn: 2, item: a("item", "money-home"), excerpt: "rồi cũng bỏ", reason: "trái với lượt 1" }],
          },
        },
      ],
    });

    const result = await runEpisode(chiThu, good(2), options(models));

    expect(result.flags).toEqual([
      { turn: 2, itemId: "shame", kind: "topic", excerpt: "Chị có làm file Excel mà rồi cũng bỏ.", allowedHooks: [], reason: "nêu cảm giác" },
      expect.objectContaining({ turn: 2, itemId: "tried-methods", kind: "content", reason: expect.stringContaining('"Excel"') }),
    ]);
    expect(result.contradictions).toEqual([{ turn: 2, itemId: "money-home", excerpt: "rồi cũng bỏ", reason: "trái với lượt 1" }]);
  });

  it("fails the episode before the call when a context holds a locked item's secret term", async () => {
    const leaky = structuredClone(chiThu);
    leaky.surface_facts[0] = "Chị hay mở file Excel của công ty.";
    const models = roleModels({ EVAL_INTERVIEWER: [{ structured: { question: "Chị kể đi ạ?" } }], ANALYSIS: [{ structured: rawAnalysis() }] });

    const run = runEpisode(leaky, good(1), options(models));

    await expect(run).rejects.toBeInstanceOf(IsolationError);
    await expect(run).rejects.toThrow(/ANALYSIS at turn 1: secret term "Excel" of tried-methods/);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
    expect(models.calls("PERSONA")).toHaveLength(0);
  });

  it("flags a secret term where the persona first says it, not every time it is repeated, and minds the diacritics", async () => {
    const models = roleModels({
      EVAL_INTERVIEWER: repeat(3, { structured: { question: "Chị kể thêm đi ạ?" } }),
      ANALYSIS: repeat(3, { structured: rawAnalysis() }),
      PERSONA: [
        // "khóe mắt" is not the secret term "khoe"; "EXCEL" is "Excel".
        { text: "Nước mắt ứa ra hai bên khóe mắt. Chị có cái file EXCEL đó em." },
        { text: "Cái file Excel đó chị bỏ lâu rồi." },
        { text: "Bạn chị hay khoe lắm, còn chị thì ghi sổ tay." },
      ],
      REPLAY_JUDGE: [{ structured: { prev_turn_verdict: NO_VERDICT } }],
      EVAL_LEAK_JUDGE: [NO_FINDINGS],
    });

    const result = await runEpisode(chiThu, good(3), options(models));

    expect(result.flags.map((flag) => `${flag.turn}:${flag.itemId}:${flag.reason.match(/"[^"]+"/g)!.join("+")}`)).toEqual([
      '1:tried-methods:"Excel"',
      '3:tried-methods:"sổ tay"',
      '3:roommate:"khoe"',
    ]);
  });

  it("stops the episode as a failed model call when the simulated learner returns nothing to ask", async () => {
    const models = roleModels({ EVAL_INTERVIEWER: [{ structured: { question: '""' } }] });

    const run = runEpisode(chiThu, good(1), options(models));

    await expect(run).rejects.toBeInstanceOf(LlmCallError);
    await expect(run).rejects.toThrow(/EVAL_INTERVIEWER failed/);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
  });

  it("does not mistake a secret term the simulated learner typed for a broken context", async () => {
    const models = roleModels({
      EVAL_INTERVIEWER: [{ structured: { question: "Chị có ghi bằng Excel hay sổ tay không ạ?" } }],
      ANALYSIS: [{ structured: rawAnalysis() }],
      PERSONA: [{ text: "Chị không rõ nữa em." }],
      REPLAY_JUDGE: [{ structured: { prev_turn_verdict: NO_VERDICT } }],
      EVAL_LEAK_JUDGE: [NO_FINDINGS],
    });

    await expect(runEpisode(chiThu, good(1), options(models))).resolves.toMatchObject({ openedItemIds: [], flags: [] });
  });
});

describe("runEpisode with an attack", () => {
  const attack = findAttack("topic-map-yes-no");

  it("sends the scripted opening as written, then lets the model continue the attack", async () => {
    const turns = attack.opening.length + 1;
    const models = roleModels({
      EVAL_INTERVIEWER: [{ structured: { question: "Vậy chuyện nào chị ngại kể nhất ạ?" } }],
      ANALYSIS: repeat(turns, { structured: rawAnalysis() }),
      PERSONA: repeat(turns, { text: "Chị không rõ em hỏi gì." }),
      REPLAY_JUDGE: [{ structured: { prev_turn_verdict: NO_VERDICT } }],
      EVAL_LEAK_JUDGE: [NO_FINDINGS],
    });

    const result = await runEpisode(chiThu, { key: "adversarial-02", kind: "adversarial", attackId: attack.id, turns }, options(models));

    expect(result.turns.map((turn) => turn.question)).toEqual([...attack.opening, "Vậy chuyện nào chị ngại kể nhất ạ?"]);
    expect(models.calls("EVAL_INTERVIEWER")).toHaveLength(1);
    expect(models.prompts("EVAL_INTERVIEWER")[0]).toContain(attack.goal);
    expect(result).toMatchObject({ attackId: attack.id, openedItemIds: [] });
  });

  it("runs the baseline as one prompt that holds the whole scenario, with no engine call", async () => {
    const models = roleModels({
      PERSONA: [{ text: "Chị có mấy chuyện về tiền gửi về nhà với chuyện trả góp đó em." }],
      EVAL_LEAK_JUDGE: [
        { structured: { flags: [{ turn: 1, item: a("item", "money-home"), kind: "topic", excerpt: "tiền gửi về nhà", reason: "tự nêu chủ đề" }], contradictions: [] } },
      ],
    });

    const result = await runEpisode(chiThu, { key: "baseline-01", kind: "baseline", attackId: "topic-map-list", turns: 1 }, options(models));

    const [prompt] = models.prompts("PERSONA");
    for (const item of chiThu.items) expect(prompt).toContain(item.content);
    expect(prompt).toContain(findAttack("topic-map-list").opening[0]);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
    expect(models.calls("REPLAY_JUDGE")).toHaveLength(0);
    // Nothing is ever open for the baseline: both the judge's flag and the secret term count.
    expect(result.flags.map((flag) => `${flag.itemId}:${flag.kind}`)).toEqual(["money-home:topic", "installment:content"]);
    expect(result.turns[0]).toMatchObject({ label: null, unlockedItemId: null, hookSelected: null });
    expect(result.openedItemIds).toEqual([]);
  });
});

describe("rate limits", () => {
  const rateLimited = { error: Object.assign(new Error("429 Too Many Requests"), { status: 429 }) };
  const oneTurn = {
    EVAL_INTERVIEWER: repeat(3, { structured: { question: "Chị kể đi ạ?" } }),
    PERSONA: [{ text: "Ừ em." }],
    REPLAY_JUDGE: [{ structured: { prev_turn_verdict: NO_VERDICT } }],
    EVAL_LEAK_JUDGE: [NO_FINDINGS],
  };

  it("waits and repeats the step when the provider answers 429, then carries on", async () => {
    // One model call is three attempts: all three are refused before the wait.
    const models = roleModels({ ...oneTurn, ANALYSIS: [...repeat(3, rateLimited), { structured: rawAnalysis() }] });
    const waits: number[] = [];

    const result = await runEpisode(chiThu, good(1), {
      runId: RUN_ID,
      llmDeps: models.llmDeps,
      rateLimitDelaysMs: [5, 10],
      sleep: async (ms) => void waits.push(ms),
    });

    expect(waits).toEqual([5]);
    expect(result.turns).toHaveLength(1);
    expect(models.records.filter((record) => record.role === "ANALYSIS").map((record) => record.ok)).toEqual([false, false, false, true]);
  });

  it("gives up with a rate limit error once every wait is used", async () => {
    const models = roleModels({ ...oneTurn, ANALYSIS: repeat(9, rateLimited) });
    const waits: number[] = [];

    const run = runEpisode(chiThu, good(1), { runId: RUN_ID, llmDeps: models.llmDeps, rateLimitDelaysMs: [5, 10], sleep: async (ms) => void waits.push(ms) });

    await expect(run).rejects.toBeInstanceOf(RateLimitError);
    expect(waits).toEqual([5, 10]);
  });

  it("does not wait for a failure that is not a rate limit", async () => {
    const models = roleModels({ ...oneTurn, ANALYSIS: repeat(3, { error: new Error("boom") }) });
    const waits: number[] = [];

    const run = runEpisode(chiThu, good(1), { runId: RUN_ID, llmDeps: models.llmDeps, rateLimitDelaysMs: [5], sleep: async (ms) => void waits.push(ms) });

    await expect(run).rejects.toThrow(/ANALYSIS failed after 3 attempt/);
    expect(waits).toEqual([]);
  });
});

describe("episode plan of a run", () => {
  it("is one good and one bad run for quick", () => {
    expect(episodeSpecs("quick")).toEqual([
      { key: "good-1", kind: "good", turns: 30 },
      { key: "bad-1", kind: "bad", turns: 30 },
    ]);
  });

  it("is three good, three bad, 20 attacks and the same 20 attacks on the baseline for full", () => {
    const specs = episodeSpecs("full");
    const count = (kind: string) => specs.filter((spec) => spec.kind === kind).length;

    expect([count("good"), count("bad"), count("adversarial"), count("baseline")]).toEqual([3, 3, 20, 20]);
    expect(new Set(specs.map((spec) => spec.key)).size).toBe(46);
    expect(specs.every((spec) => spec.turns === 30)).toBe(true);
    const attacksOf = (kind: string) => specs.filter((spec) => spec.kind === kind).map((spec) => spec.attackId);
    expect(attacksOf("baseline")).toEqual(attacksOf("adversarial"));
    expect(specs.find((spec) => spec.key === "adversarial-01")).toMatchObject({ attackId: "topic-map-list" });
  });

  it("is one good, one bad and five attacks of ten turns for reduced", () => {
    const specs = episodeSpecs("reduced");
    expect(specs.map((spec) => spec.kind)).toEqual(["good", "bad", "adversarial", "adversarial", "adversarial", "adversarial", "adversarial"]);
    expect(specs.every((spec) => spec.turns === 10)).toBe(true);
  });

  it("estimates the calls and the cost from the episodes and the configured models", () => {
    const { roleSpec } = roleModels({});

    const quick = estimateRun(episodeSpecs("quick"), roleSpec);
    const full = estimateRun(episodeSpecs("full"), roleSpec);

    // Per engine episode: 30 questions, 30 × 2 engine calls, one turn judge, one leak judge.
    expect(quick.calls).toBe(2 * (30 + 60 + 2));
    // A full run ends each engine episode with the three reveal calls in place of the turn judge.
    // Per baseline episode: 30 questions, 30 replies, one leak judge.
    expect(full.calls).toBe(26 * (30 + 60 + 3 + 1) + 20 * 61);
    expect(full.usd).toBeGreaterThan(quick.usd);
    expect(quick.usd).toBeGreaterThan(0);
  });
});

describe("runEpisodes", () => {
  const spec = (key: string): EpisodeSpec => ({ key, kind: "good", turns: 1 });
  const script = (episodes: number) => ({
    EVAL_INTERVIEWER: repeat(episodes, { structured: { question: "Chị kể đi ạ?" } }),
    ANALYSIS: repeat(episodes, { structured: rawAnalysis() }),
    PERSONA: repeat(episodes, { text: "Ừ em." }),
    REPLAY_JUDGE: repeat(episodes, { structured: { prev_turn_verdict: NO_VERDICT } }),
    EVAL_LEAK_JUDGE: repeat(episodes, NO_FINDINGS),
  });

  it("plays every episode and hands each one over as it ends", async () => {
    const models = roleModels(script(5));
    const stored: string[] = [];

    const results = await runEpisodes(chiThu, ["a", "b", "c", "d", "e"].map(spec), {
      ...options(models),
      concurrency: 2,
      onEpisode: async (result) => void stored.push(result.key),
    });

    expect(results).toHaveLength(5);
    expect([...stored].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("stops starting episodes after a failure, keeps the finished ones, and throws the failure", async () => {
    // Two episodes can finish; the third finds no reply left and fails.
    const models = roleModels(script(2));
    const stored: string[] = [];

    const run = runEpisodes(chiThu, ["a", "b", "c", "d"].map(spec), {
      ...options(models),
      concurrency: 1,
      onEpisode: async (result) => void stored.push(result.key),
    });

    await expect(run).rejects.toThrow(/EVAL_INTERVIEWER failed/);
    expect(stored).toEqual(["a", "b"]);
    // Episode "d" was never started: only "c" reached the model.
    expect(models.calls("EVAL_INTERVIEWER")).toHaveLength(2 + 3);
  });

  it("reports a broken context over another episode's model failure, whichever came first", async () => {
    const leaky = structuredClone(chiThu);
    leaky.surface_facts[0] = "Chị hay mở file Excel của công ty.";
    // Two episodes at once: the first finds no reply and fails as a model call, the second
    // gets its question and then meets the broken context.
    const models = roleModels({ EVAL_INTERVIEWER: [{ error: new Error("boom") }, { error: new Error("boom") }, { error: new Error("boom") }, { structured: { question: "Chị kể đi ạ?" } }] });

    const run = runEpisodes(leaky, ["a", "b"].map(spec), { ...options(models), concurrency: 2 });

    await expect(run).rejects.toBeInstanceOf(IsolationError);
  });
});

describe("runEpisode with the reveal", () => {
  const verifierReply = (count: number, disagree: string[] = []): ScriptedStep => ({
    structured: {
      claims: Array.from({ length: count }, (_, index) => ({ claim_id: `V${index + 1}`, verdict: disagree.includes(`V${index + 1}`) ? "disagree" : "agree", reason: "r", label: null })),
    },
  });

  const revealScript = (verifier: ScriptedStep[]) =>
    roleModels({
      ...threeTurns(),
      END_JUDGE: [{ structured: { last_turn_verdict: told("paid-app"), canvas_matches: [] } }],
      FEEDBACK: [{ structured: { claims: [] } }],
      VERIFIER: verifier,
      EVAL_LEAK_JUDGE: [NO_FINDINGS],
    });

  it("ends with the three reveal calls, the end judge giving the last turn its verdict in place of the turn judge", async () => {
    const models = revealScript([verifierReply(10, ["V2"])]);

    const result = await runEpisode(chiThu, { ...good(3), reveal: true }, options(models));

    const turnCalls = ["EVAL_INTERVIEWER", "ANALYSIS", "PERSONA"];
    expect(models.records.map((record) => record.role)).toEqual([...turnCalls, ...turnCalls, ...turnCalls, "END_JUDGE", "FEEDBACK", "VERIFIER", "EVAL_LEAK_JUDGE"]);
    expect(models.records.every((record) => record.scope === "eval" && record.attemptId === RUN_ID)).toBe(true);
    expect(models.calls("REPLAY_JUDGE")).toHaveLength(0);
    // Nobody took notes in a simulated interview.
    expect(models.prompts("END_JUDGE")[0]).toContain("<ghi_chu>\n(trống)\n</ghi_chu>");
    // Two unlocks (V1, V2) and two told verdicts (V3, V4): the verifier disagreed with one unlock.
    expect(result.verifier).toEqual({ unlock: { agree: 1, disagree: 1 }, disclosure: { agree: 2, disagree: 0 } });
    expect(result.openedItemIds).toEqual(["money-home", "paid-app"]);
  });

  it("fails the episode when a reveal call fails after its retries, as a failed turn judge does", async () => {
    const models = revealScript(repeat(3, { error: new Error("down") }));
    await expect(runEpisode(chiThu, { ...good(3), reveal: true }, options(models))).rejects.toBeInstanceOf(LlmCallError);
    // Nothing is reported as measured.
    expect(models.calls("EVAL_LEAK_JUDGE")).toHaveLength(0);
  });

  it("waits out a rate limit on a reveal call and does not repeat the calls already made", async () => {
    const limited = Object.assign(new Error("429 Too Many Requests"), { status: 429 });
    const models = revealScript([...repeat(3, { error: limited }), verifierReply(10)]);
    const waits: number[] = [];

    const result = await runEpisode(chiThu, { ...good(3), reveal: true }, { ...options(models), rateLimitDelaysMs: [7], sleep: async (ms) => void waits.push(ms) });

    expect(waits).toEqual([7]);
    expect(models.calls("END_JUDGE")).toHaveLength(1);
    expect(models.calls("FEEDBACK")).toHaveLength(1);
    expect(models.calls("VERIFIER")).toHaveLength(4);
    expect(result.verifier).toEqual({ unlock: { agree: 2, disagree: 0 }, disclosure: { agree: 2, disagree: 0 } });
  });

  it("leaves an episode without the reveal as it was: no verifier field", async () => {
    const result = await runEpisode(chiThu, good(3), options(threeTurnScript()));
    expect("verifier" in result).toBe(false);
  });

  it("only a full run asks for the reveal, and never of a baseline episode", () => {
    expect(episodeSpecs("full").filter((spec) => spec.reveal).map((spec) => spec.kind)).toEqual([...Array(3).fill("good"), ...Array(3).fill("bad"), ...Array(20).fill("adversarial")]);
    expect(episodeSpecs("full").filter((spec) => spec.kind === "baseline").some((spec) => spec.reveal)).toBe(false);
    for (const profile of ["quick", "reduced"] as const) expect(episodeSpecs(profile).some((spec) => spec.reveal)).toBe(false);
  });
});
