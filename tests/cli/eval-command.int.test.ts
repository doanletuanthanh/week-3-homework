import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { claimEvalRun } from "@/db/repo/eval-jobs";
import { evalRuns, scenarios } from "@/db/schema";
import { findAttack } from "@/eval/attacks";
import { FLOOR_ATTACKS } from "@/eval/qa/floor";
import { ATTACK_TURNS } from "@/eval/qa/tools";
import { runEval, type EvalCommandDeps } from "../../cli/commands/eval";
import { startLeanEval } from "@/server/eval-job";
import { chiThu, rawAnalysis } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import { resetDatabase } from "../helpers/test-db";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

function deps(models: ReturnType<typeof roleModels>, overrides: Partial<EvalCommandDeps> = {}) {
  const tracing: boolean[] = [];
  const value: EvalCommandDeps = {
    llmDeps: models.llmDeps,
    setTracing: (on) => void tracing.push(on),
    rateLimitDelaysMs: [],
    ...overrides,
  };
  return { value, tracing };
}

const runs = () => getDb().select().from(evalRuns);

beforeEach(resetDatabase);

describe("il eval", () => {
  /** Replies for a lean run in which no item opens and nothing leaks. */
  function lean() {
    const attackReplies = FLOOR_ATTACKS.reduce((sum, id) => sum + Math.min(ATTACK_TURNS, findAttack(id).opening.length), 0);
    return roleModels({
      QA_PLANNER: [{ structured: { public_leaks: [], risks: [], deliveries: [], paraphrases: [], attacks: [] } }, { structured: { decision: "done", probes: [], findings: [] } }],
      ANALYSIS: repeat(2 * chiThu.items.length + attackReplies, { structured: rawAnalysis({ question_type: "other" }) }),
      PERSONA: repeat(attackReplies, { text: "Chị cũng không biết nói sao nữa em." }),
      EVAL_LEAK_JUDGE: [{ structured: { replies: Array.from({ length: attackReplies }, (_, index) => ({ reply: `R${index + 1}`, told: [], topics: [] })) } }],
    });
  }

  it("runs the QA agent as a job, stores the report and prints it", async () => {
    const { io, out, err } = capture();
    const { value, tracing } = deps(lean());

    expect(await runEval(["chi-thu", "--fast", "--concurrency", "1"], io, getDb(), value)).toBe(0);

    expect(err).toEqual([]);
    // Tracing is off unless asked for.
    expect(tracing).toEqual([false]);
    const [run] = await runs();
    expect(out[0]).toBe(`Eval lean cho chi-thu phiên bản 1, trần 0.10 USD, gọi trực tiếp (--fast). Lần chạy ${run.id}`);
    expect(run).toMatchObject({ profile: "lean", status: "done", runAttempt: 1, runToken: null, requestedBy: null });
  });

  it("turns tracing on with --trace, and still takes --profile lean", async () => {
    const { value, tracing } = deps(lean());
    expect(await runEval(["chi-thu", "--profile", "lean", "--fast", "--trace"], capture().io, getDb(), value)).toBe(0);
    expect(tracing).toEqual([true]);
  });

  it("refuses while another lean run of the version holds its runner", async () => {
    const [scenario] = await getDb().select().from(scenarios);
    const started = await startLeanEval(getDb(), scenario.id, "thanh@example.com");
    await claimEvalRun(getDb(), started.ok ? started.runId : "");
    const { io, err } = capture();

    expect(await runEval(["chi-thu", "--profile", "lean", "--fast"], io, getDb(), deps(lean()).value)).toBe(1);

    expect(err).toEqual(["chi-thu đang có một lần eval lean chạy: chờ nó xong."]);
    expect(await runs()).toHaveLength(1);
  });
});

describe("il eval refusals", () => {
  it.each([
    [[], /Cách dùng/],
    [["no-such-persona"], /Không tìm thấy persona "no-such-persona"/],
    [["chi-thu", "--profile", "full"], /--profile full không còn: chỉ còn eval lean/],
    [["chi-thu", "--profile", "quick"], /--profile quick không còn/],
    [["chi-thu", "--turns", "5"], /--turns/],
    [["--resume", "11111111-1111-4111-8111-111111111111"], /--resume/],
    [["chi-thu", "--concurrency", "x"], /--concurrency phải là số nguyên/],
    [["chi-thu", "--profile"], /--profile cần một giá trị/],
  ])("refuses %j without calling a model", async (args, message) => {
    const models = roleModels({});
    const { io, err } = capture();

    expect(await runEval(args, io, getDb(), deps(models).value)).toBe(1);

    expect(err.join("\n")).toMatch(message);
    expect(models.records).toEqual([]);
    expect(await runs()).toEqual([]);
  });

  it("needs a database", async () => {
    const { io, err } = capture();
    expect(await runEval(["chi-thu"], io, null, deps(roleModels({})).value)).toBe(1);
    expect(err[0]).toMatch(/Lệnh eval cần cơ sở dữ liệu/);
  });
});
