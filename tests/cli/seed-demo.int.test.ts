import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { branches, events, llmCalls, sessions, turns } from "@/db/schema";
import { recordCallToDb } from "@/llm/call-model";
import { runSeedDemo, type SeedDemoDeps } from "../../cli/commands/seed-demo";
import { rawAnalysis } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";
import { NOTES, QUESTIONS } from "../helpers/reveal-fixtures";
import type { ScriptedStep } from "../helpers/scripted-model";
import { LEADING_ONLY, NO_REPLAY, PLAYED, agreeAll, generatorStep, judgeStep, noClaims, type ScriptedTurn } from "../helpers/session-fixtures";
import { PERSONA_ID, createLearner, resetDatabase } from "../helpers/test-db";

const db = () => getDb();
const DEMO = "demo@example.com";
const DEMO_LISTS = { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: [DEMO] };

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

/** A transcript file with these questions and notes. */
function transcriptFile(questions: string[], canvasText: string = NOTES, personaId: string = PERSONA_ID): string {
  const path = join(mkdtempSync(join(tmpdir(), "il-seed-")), "transcript.json");
  writeFileSync(path, JSON.stringify({ persona_id: personaId, questions, canvas_text: canvasText }));
  return path;
}

const PLAYED_QUESTIONS = Object.values(QUESTIONS);

/**
 * Scripted providers for one seeded session: Call 1 and Call 2 per turn, then the three reveal
 * calls. They write `llm_call` rows, as the CLI does.
 */
function models(script: ScriptedTurn[], reveal: { END_JUDGE: ScriptedStep[]; FEEDBACK: ScriptedStep[]; VERIFIER: ScriptedStep[] }) {
  const scripted = roleModels({
    ANALYSIS: script.map((turn) => ({ structured: rawAnalysis(turn.analysis) })),
    PERSONA: script.map((_turn, position) => ({ text: `Câu trả lời ở lượt ${position + 1}.` })),
    ...reveal,
  });
  return { ...scripted, llmDeps: { ...scripted.llmDeps, recordCall: recordCallToDb } };
}

const playedReveal = () => ({ END_JUDGE: [judgeStep()], FEEDBACK: [generatorStep()], VERIFIER: [agreeAll()] });
const plainReveal = (notes: string) => ({ END_JUDGE: [judgeStep(notes, [])], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] });

function seed(args: string[], deps: Partial<SeedDemoDeps> & { questions?: string[]; notes?: string } = {}) {
  const output = capture();
  const { questions = PLAYED_QUESTIONS, notes = NOTES, ...rest } = deps;
  const path = transcriptFile(questions, notes);
  return runSeedDemo(args, output.io, db(), () => ({ demoEmails: [DEMO], transcriptPath: () => path, ...rest })).then((code) => ({ code, ...output }));
}

const ARGS = [DEMO, "--persona", PERSONA_ID, "--guess", "5"];

beforeEach(resetDatabase);

describe("il seed-demo", () => {
  it("plays the prepared transcript through the engine and stops at revealed, with the replay of an ignored hook ahead", async () => {
    const demo = await createLearner(DEMO, DEMO_LISTS);
    const scripted = models(PLAYED, playedReveal());

    const { code, out, err } = await seed(ARGS, { llmDeps: scripted.llmDeps });

    expect(err).toEqual([]);
    expect(code).toBe(0);
    const [session] = await db().select().from(sessions);
    expect(session).toMatchObject({ userId: demo.id, personaId: PERSONA_ID, isDemo: true, status: "revealed", guess: 5, canvasText: NOTES });
    expect(session.canvasFrozenAt).not.toBeNull();
    expect(session.revealJson).toMatchObject({ replay: { level: "primary", forkAfterTurn: 2, targetItemId: "paid-app" }, counts: { told: 2, total: 11 } });
    // Turn 0 and the six questions, word for word.
    const played = await db().select().from(turns).orderBy(turns.index);
    expect(played.map((turn) => turn.learnerText)).toEqual([null, ...PLAYED_QUESTIONS]);
    // The replay is still ahead: no replay branch was created.
    expect(await db().select().from(branches)).toMatchObject([{ kind: "main" }]);
    expect(out.at(-2)).toBe(`Đã seed buổi ${session.id} cho ${DEMO}: ${PERSONA_ID}, 6 lượt, kể 2/11, đoán 5.`);
    expect(out.at(-1)).toBe(`Buổi dừng ở "revealed" với khoảnh khắc luyện lại từ lượt 3. Mở /sessions/${session.id} bằng tài khoản demo.`);
  });

  it("makes two calls per turn and three for the reveal, costs them to the session, and writes no metric event", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const scripted = models(PLAYED, playedReveal());

    await seed(ARGS, { llmDeps: scripted.llmDeps });

    const [session] = await db().select().from(sessions);
    const calls = await db().select().from(llmCalls);
    expect(calls).toHaveLength(6 * 2 + 3);
    expect(calls.every((call) => call.sessionId === session.id && call.scope === "session")).toBe(true);
    expect(scripted.calls("ANALYSIS")).toHaveLength(6);
    expect(scripted.calls("PERSONA")).toHaveLength(6);
    expect(await db().select().from(events)).toEqual([]);
  });

  it("can be run again: each run gives the demo account one more session", async () => {
    await createLearner(DEMO, DEMO_LISTS);

    expect((await seed(ARGS, { llmDeps: models(PLAYED, playedReveal()).llmDeps })).code).toBe(0);
    expect((await seed([DEMO, "--persona", PERSONA_ID, "--guess", "0"], { llmDeps: models(PLAYED, playedReveal()).llmDeps })).code).toBe(0);

    const rows = await db().select().from(sessions).orderBy(sessions.startedAt);
    expect(rows.map((row) => [row.status, row.guess, row.isDemo])).toEqual([
      ["revealed", 5, true],
      ["revealed", 0, true],
    ]);
  });

  it("fails with the reason when the moment is a leading question and not an ignored hook, and leaves no session behind", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const questions = ["Chắc chị ngại ghi lắm đúng không ạ?", "Chị kể thêm cho em nghe được không ạ?", "Chắc tại chị bận quá đúng không ạ?"];
    const scripted = models(LEADING_ONLY, plainReveal("ghi vội"));

    const { code, out, err } = await seed(ARGS, { llmDeps: scripted.llmDeps, questions, notes: "ghi vội" });

    expect(code).toBe(1);
    expect(err).toEqual([
      "seed-demo thất bại: khoảnh khắc luyện lại là câu dẫn dắt ở lượt 1 (dự phòng 1), không phải một hook bị bỏ qua. Buổi vừa tạo đã được xóa.",
    ]);
    expect(out.at(-1)).toBe("Lượt 3/3 xong.");
    expect(await db().select().from(sessions)).toEqual([]);
    expect(await db().select().from(turns)).toEqual([]);
    // What the attempt cost stays counted, though its session is gone.
    const calls = await db().select().from(llmCalls);
    expect(calls).toHaveLength(3 * 2 + 3);
    expect(calls.every((call) => call.sessionId === null && call.scope === "session")).toBe(true);
  });

  it("fails with the reason when the session has no replay moment at all", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const scripted = models(NO_REPLAY, plainReveal("ghi vội"));

    const { code, err } = await seed(ARGS, { llmDeps: scripted.llmDeps, questions: ["Chị quản lý tiền nong thế nào ạ?", "Chị kể thêm đi ạ?"], notes: "ghi vội" });

    expect(code).toBe(1);
    expect(err).toEqual([
      "seed-demo thất bại: buổi không có khoảnh khắc luyện lại nào (không hook nào bị bỏ qua, không câu dẫn dắt nào). Buổi vừa tạo đã được xóa.",
    ]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("fails and removes the session when a model call of a turn fails", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const down = { error: new Error("provider down") };
    const scripted = roleModels({ ANALYSIS: [{ structured: rawAnalysis() }, down, down, down], PERSONA: [{ text: "Câu trả lời." }] });

    const { code, err } = await seed(ARGS, { llmDeps: { ...scripted.llmDeps, recordCall: recordCallToDb } });

    expect(code).toBe(1);
    expect(err).toEqual(["seed-demo thất bại: lượt 2 không chạy được (llm_failed). Buổi vừa tạo đã được xóa."]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("removes the session when a step throws instead of answering, so no half-played session is left as the newest", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const scripted = models(PLAYED, playedReveal());
    let calls = 0;
    const llmDeps = {
      ...scripted.llmDeps,
      // The database goes away while the third model call is being recorded.
      recordCall: async (record: Parameters<typeof recordCallToDb>[0]) => {
        calls += 1;
        if (calls === 3) throw new Error("connection lost");
        await recordCallToDb(record);
      },
    };

    await expect(seed(ARGS, { llmDeps })).rejects.toThrow("connection lost");

    expect(await db().select().from(sessions)).toEqual([]);
    expect(await db().select().from(turns)).toEqual([]);
  });

  it("refuses an address that is not a demo account, before anything is created or any model is called", async () => {
    await createLearner("linh@example.com");
    const scripted = models(PLAYED, playedReveal());

    const { code, err } = await seed(["linh@example.com", "--persona", PERSONA_ID, "--guess", "5"], { llmDeps: scripted.llmDeps });

    expect(code).toBe(1);
    expect(err).toEqual(['"linh@example.com" không có trong DEMO_ACCOUNT_EMAILS: chỉ tài khoản demo mới nhận buổi seed.']);
    expect(await db().select().from(sessions)).toEqual([]);
    expect(scripted.calls("ANALYSIS")).toEqual([]);
  });

  it("compares the address without regard to case", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const { code } = await seed(["Demo@Example.com", "--persona", PERSONA_ID, "--guess", "5"], { llmDeps: models(PLAYED, playedReveal()).llmDeps });
    expect(code).toBe(0);
  });

  it("asks for a first sign-in when the demo account has never opened the app", async () => {
    const { code, err } = await seed(ARGS, { llmDeps: models(PLAYED, playedReveal()).llmDeps });

    expect(code).toBe(1);
    expect(err).toEqual([`Chưa có tài khoản "${DEMO}": đăng nhập vào InterviewLab bằng tài khoản này một lần rồi chạy lại.`]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it.each([
    [[DEMO, "--persona", PERSONA_ID], "Cách dùng: il seed-demo <email> --persona <id> --guess <n>"],
    [[DEMO, "--guess", "5"], "Cách dùng: il seed-demo <email> --persona <id> --guess <n>"],
    [["--persona", PERSONA_ID, "--guess", "5"], "Cách dùng: il seed-demo <email> --persona <id> --guess <n>"],
    [[DEMO, "--persona", PERSONA_ID, "--guess", "nhiều"], "--guess phải là số nguyên từ 0 đến 99."],
    [[DEMO, "--persona", PERSONA_ID, "--guess", "-1"], "--guess phải là số nguyên từ 0 đến 99."],
    [[DEMO, "--persona", PERSONA_ID, "--guess"], "Tùy chọn --guess cần một giá trị."],
    [[DEMO, "--persona", PERSONA_ID, "--guess", "5", "--force"], "Không có tùy chọn --force."],
  ])("refuses %j with how to use it, and creates nothing", async (args, message) => {
    await createLearner(DEMO, DEMO_LISTS);
    const { code, err } = await seed(args, { llmDeps: models(PLAYED, playedReveal()).llmDeps });

    expect(code).toBe(1);
    expect(err).toEqual([message]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("refuses a guess above the number of items the persona holds, without calling a model", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const scripted = models(PLAYED, playedReveal());

    const { code, err } = await seed([DEMO, "--persona", PERSONA_ID, "--guess", "12"], { llmDeps: scripted.llmDeps });

    expect(code).toBe(1);
    expect(err).toEqual(["seed-demo thất bại: --guess 12 lớn hơn số điều persona giữ (11). Buổi vừa tạo đã được xóa."]);
    expect(await db().select().from(sessions)).toEqual([]);
    expect(await db().select().from(llmCalls)).toEqual([]);
  });

  it("refuses a persona that does not exist, and a transcript written for another persona", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    const unknown = capture();
    const path = transcriptFile(PLAYED_QUESTIONS, NOTES, "khong-co");
    expect(await runSeedDemo([DEMO, "--persona", "khong-co", "--guess", "1"], unknown.io, db(), () => ({ demoEmails: [DEMO], transcriptPath: () => path }))).toBe(1);
    expect(unknown.err).toEqual(['Không có persona "khong-co" nào chơi được.']);

    const mismatch = capture();
    expect(await runSeedDemo(ARGS, mismatch.io, db(), () => ({ demoEmails: [DEMO], transcriptPath: () => path }))).toBe(1);
    expect(mismatch.err).toEqual([`Transcript "${path}" là của persona "khong-co", không phải "chi-thu".`]);
    expect(await db().select().from(sessions)).toEqual([]);
  });

  it("says so when today's cost cap leaves no room for a new session", async () => {
    await createLearner(DEMO, DEMO_LISTS);
    await setConfig(db(), "session_daily_cap_usd", 0, "admin@example.com");

    const { code, err } = await seed(ARGS, { llmDeps: models(PLAYED, playedReveal()).llmDeps });

    expect(code).toBe(1);
    expect(err).toEqual(["Hôm nay đã chạm cap chi phí buổi luyện: không tạo được buổi mới."]);
  });

  it("needs a database", async () => {
    const { io, err } = capture();
    expect(await runSeedDemo(ARGS, io, null, () => ({ demoEmails: [DEMO] }))).toBe(1);
    expect(err).toEqual(["Lệnh seed-demo cần cơ sở dữ liệu: đặt DATABASE_URL_DIRECT (hoặc DATABASE_URL) trong .env.local."]);
  });
});
