import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { recordLlmCall } from "@/db/repo/llm-calls";
import { evalEpisodes, evalRuns, leakFlags, llmCalls, scenarios } from "@/db/schema";
import { evaluateGate } from "@/eval/publish-gate";
import { runEval, type EvalCommandDeps } from "../../cli/commands/eval";
import { NO_VERDICT, a, rawAnalysis } from "../helpers/engine-fixtures";
import { NO_FINDINGS, repeat, roleModels } from "../helpers/eval-models";
import { resetDatabase } from "../helpers/test-db";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

/** Replies for `episodes` engine episodes of `turns` turns in which nothing opens. */
function script(episodes: number, turns: number, leakJudge = NO_FINDINGS) {
  return roleModels({
    EVAL_INTERVIEWER: repeat(episodes * turns, { structured: { question: "Chị kể đi ạ?" } }),
    ANALYSIS: repeat(episodes * turns, { structured: rawAnalysis() }),
    PERSONA: repeat(episodes * turns, { text: "Ừ em, chị cũng bình thường thôi." }),
    REPLAY_JUDGE: repeat(episodes, { structured: { prev_turn_verdict: NO_VERDICT } }),
    EVAL_LEAK_JUDGE: repeat(episodes, leakJudge),
  });
}

function deps(models: ReturnType<typeof roleModels>, overrides: Partial<EvalCommandDeps> = {}) {
  const tracing: boolean[] = [];
  const asked: string[] = [];
  const value: EvalCommandDeps = {
    roleSpec: models.roleSpec,
    llmDeps: models.llmDeps,
    confirm: async (question) => {
      asked.push(question);
      return false;
    },
    setTracing: (on) => void tracing.push(on),
    rateLimitDelaysMs: [],
    ...overrides,
  };
  return { value, tracing, asked };
}

const runs = () => getDb().select().from(evalRuns);

beforeEach(resetDatabase);

describe("il eval --profile quick", () => {
  it("plays one good and one bad episode, stores them and the report, and prints progress", async () => {
    const models = script(2, 2);
    const { io, out, err } = capture();
    const { value, tracing } = deps(models);

    expect(await runEval(["chi-thu", "--turns", "2", "--concurrency", "1"], io, getDb(), value)).toBe(0);

    expect(err).toEqual([]);
    expect(out[0]).toMatch(/^Eval quick cho chi-thu phiên bản 1: 2 episode × 2 lượt, khoảng 16 call, ước tính \d+\.\d\d USD \(chưa đo\)\.$/);
    expect(out[1]).toBe("Lần chạy nhanh chỉ để tinh chỉnh: không bao giờ dùng được cho cổng publish.");
    expect(out[3]).toMatch(/^\[1\/2\] good-1: 2 lượt, mở 0 item, 0 cờ, 0\.\d{4} USD$/);
    expect(out[4]).toMatch(/^\[2\/2\] bad-1: 2 lượt/);
    expect(out).toContain("Báo cáo eval (quick, 2 lượt mỗi episode, 11 item)");
    // Tracing is off unless asked for.
    expect(tracing).toEqual([false]);

    const [run] = await runs();
    expect(run).toMatchObject({ profile: "quick", status: "done", version: 1, turns: 2 });
    expect(run.finishedAt).not.toBeNull();
    expect(run.reportJson).toMatchObject({ profile: "quick", opened: { good: { runs: [0], median: 0 }, bad: { runs: [0], median: 0 } } });
    expect(run.costActualUsd).toBeCloseTo(run.reportJson!.cost.actualUsd, 9);
    expect(run.costActualUsd).toBeGreaterThan(0);
    const episodes = await getDb().select().from(evalEpisodes).where(eq(evalEpisodes.runId, run.id));
    expect(episodes.map((row) => row.key).sort()).toEqual(["bad-1", "good-1"]);
    expect(out[2]).toBe(`Lần chạy ${run.id}`);
  });

  it("can never satisfy the publish gate, whatever its report says", async () => {
    const models = script(2, 1);
    await runEval(["chi-thu", "--turns", "1"], capture().io, getDb(), deps(models).value);
    const [run] = await runs();

    const gate = evaluateGate({
      violations: [],
      run: { profile: run.profile, status: run.status, episodeKeys: ["good-1", "bad-1"], report: run.reportJson },
      flags: [],
      strings: [],
    });

    expect(gate).toEqual({ ok: false, reasons: ['Lần eval "quick" không dùng được cho cổng publish: cần một lần eval đầy đủ (full).'] });
  });

  it("writes one llm_call row per model attempt, scoped to eval and attributed to the run", async () => {
    const models = script(2, 1);
    const llmDeps = { ...models.llmDeps, recordCall: (record: Parameters<typeof recordLlmCall>[1]) => recordLlmCall(getDb(), record) };

    await runEval(["chi-thu", "--turns", "1", "--concurrency", "2"], capture().io, getDb(), deps(models, { llmDeps }).value);

    const [run] = await runs();
    const calls = await getDb().select().from(llmCalls);
    // Per episode: question, Call 1, Call 2, turn judge, leak judge.
    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.scope === "eval" && call.attemptId === run.id && call.sessionId === null)).toBe(true);
    expect(calls.reduce((sum, call) => sum + call.costUsd, 0)).toBeCloseTo(run.costActualUsd, 8);
  });

  it("turns tracing on with --trace", async () => {
    const { value, tracing } = deps(script(2, 1));
    await runEval(["chi-thu", "--turns", "1", "--trace"], capture().io, getDb(), value);
    expect(tracing).toEqual([true]);
  });
});

describe("il eval --profile full", () => {
  it("asks before spending and calls no model when the operator does not say yes", async () => {
    const models = script(0, 0);
    const { io, out } = capture();
    const { value, asked } = deps(models);

    expect(await runEval(["chi-thu", "--profile", "full"], io, getDb(), value)).toBe(1);

    expect(out[0]).toMatch(/^Eval full cho chi-thu phiên bản 1: 46 episode × 30 lượt, khoảng 3612 call, ước tính \d+\.\d\d USD/);
    expect(asked).toEqual(["Chạy eval đầy đủ với chi phí trên? (gõ yes để chạy) "]);
    expect(out.at(-1)).toBe("Đã hủy: không gọi model nào.");
    expect(models.records).toEqual([]);
    expect(await runs()).toEqual([]);
  });

  it("refuses a shorter episode: a full run is always 30 turns", async () => {
    const { io, err } = capture();
    expect(await runEval(["chi-thu", "--profile", "full", "--turns", "5", "--yes"], io, getDb(), deps(script(0, 0)).value)).toBe(1);
    expect(err).toEqual(["Eval đầy đủ luôn chạy 30 lượt mỗi episode: không dùng --turns với --profile full."]);
    expect(await runs()).toEqual([]);
  });

  it("plays all 46 episodes after a yes and stores the flags of the engine's episodes for adjudication", async () => {
    // Every episode gets the same flag from the leak judge: the persona named a locked topic at turn 1.
    const flagged = {
      structured: {
        flags: [{ turn: 1, item: a("item", "shame"), kind: "topic", excerpt: "bình thường", reason: "nêu cảm giác" }],
        contradictions: [],
      },
    };
    const models = roleModels({
      EVAL_INTERVIEWER: repeat(46 * 30, { structured: { question: "Chị kể đi ạ?" } }),
      ANALYSIS: repeat(26 * 30, { structured: rawAnalysis() }),
      // 26 engine episodes and 20 baseline episodes: the baseline runs on the persona's model.
      PERSONA: repeat(46 * 30, { text: "Ừ em, chị cũng bình thường thôi." }),
      REPLAY_JUDGE: repeat(26, { structured: { prev_turn_verdict: NO_VERDICT } }),
      EVAL_LEAK_JUDGE: repeat(46, flagged),
    });
    const { io, out, err } = capture();
    const { value, asked } = deps(models, { confirm: async () => true });

    expect(await runEval(["chi-thu", "--profile", "full", "--concurrency", "8"], io, getDb(), value)).toBe(0);

    expect(err).toEqual([]);
    expect(asked).toEqual([]);
    const [run] = await runs();
    expect(run).toMatchObject({ profile: "full", status: "done", turns: 30 });
    expect(run.reportJson!.leaks).toMatchObject({
      learner: { episodes: 6, flags: 6 },
      adversarial: { episodes: 20, flags: 20 },
      baseline: { episodes: 20, flags: 20 },
    });
    const flags = await getDb().select().from(leakFlags).where(eq(leakFlags.evalRunId, run.id));
    expect(flags).toHaveLength(26);
    expect(flags.some((flag) => flag.episode.startsWith("baseline"))).toBe(false);
    expect(flags[0]).toMatchObject({ turn: 1, itemId: "shame", kind: "topic", excerpt: "bình thường", allowedHooks: [], judgeReason: "nêu cảm giác" });
    expect(out.at(-1)).toBe("26 cờ rò rỉ chờ phân xử: il adjudicate list chi-thu");
    expect(out.filter((line) => /^\[\d+\/46\]/.test(line))).toHaveLength(46);
  }, 60_000);
});

describe("il eval --resume", () => {
  it("keeps the finished episodes of a run that stopped and plays only the rest", async () => {
    // Replies for one episode only: the second one fails on its first question.
    const first = script(1, 1);
    const stopped = capture();

    expect(await runEval(["chi-thu", "--turns", "1", "--concurrency", "1"], stopped.io, getDb(), deps(first).value)).toBe(1);

    const [run] = await runs();
    expect(run).toMatchObject({ status: "failed", failureReason: "model" });
    expect(run.reportJson).toBeNull();
    expect(stopped.err[0]).toMatch(/^Eval dừng: LLM call EVAL_INTERVIEWER failed after 3 attempt\(s\)\./);
    expect(stopped.err[1]).toBe(`Đã lưu 1/2 episode. Chạy tiếp: il eval --resume ${run.id}`);

    const second = script(1, 1);
    const resumed = capture();
    expect(await runEval(["--resume", run.id], resumed.io, getDb(), deps(second).value)).toBe(0);

    expect(resumed.out[0]).toMatch(/^Eval quick cho chi-thu phiên bản 1: 1 episode × 1 lượt/);
    // Progress counts the episode stored before the stop.
    expect(resumed.out.filter((line) => line.startsWith("["))).toEqual([expect.stringMatching(/^\[2\/2\] bad-1: 1 lượt, mở 0 item, 0 cờ, /)]);
    expect(second.calls("EVAL_INTERVIEWER")).toHaveLength(1);
    const [after] = await runs();
    expect(after).toMatchObject({ id: run.id, status: "done", failureReason: null });
    expect(after.reportJson!.opened).toEqual({ good: { runs: [0], median: 0 }, bad: { runs: [0], median: 0 } });
    expect(await runs()).toHaveLength(1);
  });

  it("marks a run that broke isolation as failed for good: it is reported, not stored, and never resumed", async () => {
    const [row] = await getDb().select().from(scenarios);
    const leaky = structuredClone(row.content);
    leaky.surface_facts[0] = "Chị hay mở file Excel của công ty.";
    await getDb().update(scenarios).set({ content: leaky });
    const models = script(2, 1);
    const { io, out, err } = capture();

    expect(await runEval(["chi-thu", "--turns", "1", "--concurrency", "1"], io, getDb(), deps(models).value)).toBe(1);

    expect(err[0]).toMatch(/^Eval dừng: cô lập context bị vỡ\. context isolation broken in ANALYSIS at turn 1: secret term "Excel" of tried-methods/);
    expect(out.some((line) => line.startsWith("Báo cáo eval"))).toBe(false);
    const [run] = await runs();
    expect(run).toMatchObject({ status: "failed", failureReason: "isolation", reportJson: null });
    expect(models.calls("ANALYSIS")).toHaveLength(0);

    const resumed = capture();
    expect(await runEval(["--resume", run.id], resumed.io, getDb(), deps(script(2, 1)).value)).toBe(1);
    expect(resumed.err[0]).toMatch(/dừng vì cô lập context bị vỡ: không chạy tiếp được/);
    expect((await runs())[0].status).toBe("failed");
  });

  it("refuses an unknown run, a finished run, and --resume mixed with a persona", async () => {
    const models = script(2, 1);
    await runEval(["chi-thu", "--turns", "1"], capture().io, getDb(), deps(models).value);
    const [run] = await runs();

    for (const [args, message] of [
      [["--resume", "11111111-1111-4111-8111-111111111111"], /Không tìm thấy lần chạy eval/],
      [["--resume", "not-an-id"], /Không tìm thấy lần chạy eval/],
      [["--resume", run.id], /đã hoàn tất/],
      [["chi-thu", "--resume", run.id], /Cách dùng/],
    ] as const) {
      const { io, err } = capture();
      expect(await runEval([...args], io, getDb(), deps(script(0, 0)).value)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
  });
});

describe("il eval refusals", () => {
  it.each([
    [[], /Cách dùng/],
    [["no-such-persona"], /Không tìm thấy persona "no-such-persona"/],
    [["chi-thu", "--profile", "reduced"], /--profile phải là quick hoặc full/],
    [["chi-thu", "--turns", "0"], /--turns phải là số nguyên từ 1 đến 30/],
    [["chi-thu", "--turns", "31"], /--turns phải là số nguyên từ 1 đến 30/],
    [["chi-thu", "--concurrency", "x"], /--concurrency phải là số nguyên/],
    [["chi-thu", "--fast"], /Không có tùy chọn --fast/],
    [["chi-thu", "--profile"], /--profile cần một giá trị/],
  ])("refuses %j without calling a model", async (args, message) => {
    const models = script(0, 0);
    const { io, err } = capture();

    expect(await runEval(args, io, getDb(), deps(models).value)).toBe(1);

    expect(err.join("\n")).toMatch(message);
    expect(models.records).toEqual([]);
    expect(await runs()).toEqual([]);
  });

  it("needs a database", async () => {
    const { io, err } = capture();
    expect(await runEval(["chi-thu"], io, null, deps(script(0, 0)).value)).toBe(1);
    expect(err[0]).toMatch(/Lệnh eval cần cơ sở dữ liệu/);
  });
});
