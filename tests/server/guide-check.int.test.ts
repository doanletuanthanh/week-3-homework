import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { findFirstProgressSource, findNewestProgressSource, findPreviousProgressSource } from "@/db/repo/sessions";
import { events, llmCalls, sessions } from "@/db/schema";
import type { RevealJson } from "@/engine/reveal-types";
import { recordCallToDb, type CallModelDeps } from "@/llm/call-model";
import { checkGuide, guideChecksLeft } from "@/server/guide-check";
import { compareProgress } from "@/server/progress";
import { runTurn } from "@/server/turns";
import { a, rawAnalysis, topic } from "../helpers/engine-fixtures";
import { ALLOW, respondingModels } from "../helpers/custom-fixtures";
import { scriptedModel } from "../helpers/scripted-model";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

const db = () => getDb();
vi.setConfig({ testTimeout: 60_000 });
beforeEach(resetDatabase);

const GUIDE = "Một ngày của anh thế nào?\nAnh có hay quên uống nước vì bận quá không?";
const LABELLED = {
  questions: [
    { text: "Một ngày của anh thế nào?", label: "open", hint: "" },
    { text: "Anh có hay quên uống nước vì bận quá không?", label: "leading", hint: "Bỏ lý do bạn tự thêm; hỏi về lần gần nhất." },
  ],
};

/** The checker answers with the two labels; moderation allows; nothing else is expected. */
const models = (options: { refuse?: boolean; fail?: boolean } = {}) =>
  respondingModels(
    (role) => {
      if (role === "MODERATION") return { structured: options.refuse ? { decision: "refuse", reason_code: "real_org_or_brand", constraints: [], focus: "general" } : ALLOW };
      if (role === "ANALYSIS") return options.fail ? { error: new Error("provider down") } : { structured: LABELLED };
      throw new Error(`unexpected ${role} call`);
    },
    { recordCall: recordCallToDb },
  );

const guideEvents = () => db().select().from(events).where(eq(events.name, "guide_checked"));

describe("guide check", () => {
  it("labels the guide with one ANALYSIS call charged to the session scope, and stores counts only", async () => {
    const learner = await createLearner("linh@example.com");
    const run = models();

    const result = await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: run.llmDeps });

    expect(result).toMatchObject({ ok: true, counts: { open: 1, leading: 1, compound: 0 }, left: 4 });
    expect(run.calls.map((call) => call.role)).toEqual(["ANALYSIS"]);
    expect(await db().select({ scope: llmCalls.scope, role: llmCalls.role }).from(llmCalls)).toEqual([{ scope: "session", role: "ANALYSIS" }]);
    // The guide sits in a data block, and the learner's text is stored nowhere.
    expect(run.prompts("ANALYSIS")[0]).toContain(`<bo_cau_hoi>\n${GUIDE}\n</bo_cau_hoi>`);
    const [event] = await guideEvents();
    expect(event).toMatchObject({ userId: learner.id, props: { idea: false, refused: false, questions: 2, flagged: 1 } });
    expect(JSON.stringify(event)).not.toContain("uống nước");
  });

  it("moderates the app idea first, and a refused idea still uses the check", async () => {
    const learner = await createLearner("linh@example.com");
    const run = models();
    expect(await checkGuide(db(), learner, { guide: GUIDE, idea: "app nhắc uống nước" }, { llmDeps: run.llmDeps })).toMatchObject({ ok: true });
    expect(run.calls.map((call) => call.role)).toEqual(["MODERATION", "ANALYSIS"]);

    const refusing = models({ refuse: true });
    expect(await checkGuide(db(), learner, { guide: GUIDE, idea: "app của một hãng có thật" }, { llmDeps: refusing.llmDeps })).toEqual({ ok: false, error: "refused" });
    expect(refusing.calls.map((call) => call.role)).toEqual(["MODERATION"]);
    expect((await guideEvents()).map((event) => event.props)).toEqual(
      expect.arrayContaining([expect.objectContaining({ idea: true, refused: true }), expect.objectContaining({ idea: true, refused: false, questions: 2 })]),
    );
    expect(await guideChecksLeft(db(), learner)).toBe(3);
  });

  it("refuses the sixth check of the day without calling a model", async () => {
    const learner = await createLearner("linh@example.com");
    for (let check = 0; check < 5; check += 1) expect(await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: models().llmDeps })).toMatchObject({ ok: true });
    const sixth = models();

    expect(await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: sixth.llmDeps })).toEqual({ ok: false, error: "limit" });
    expect(sixth.calls).toEqual([]);
    expect(await guideChecksLeft(db(), learner)).toBe(0);
    // Another learner has their own five.
    const other = await createLearner("an@example.com");
    expect(await guideChecksLeft(db(), other)).toBe(5);
  });

  it("lets two checks at once take only the last one left", async () => {
    const learner = await createLearner("linh@example.com");
    await setConfig(db(), "guide_checks_per_day", 1, "admin@example.com");
    const results = await Promise.all([0, 1].map(() => checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: models().llmDeps })));
    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(await guideEvents()).toHaveLength(1);
  });

  it("counts a check whose call failed: its attempts were paid for", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: models({ fail: true }).llmDeps })).toEqual({ ok: false, error: "llm_failed" });
    expect(await guideEvents()).toMatchObject([{ props: { failed: true, questions: 0 } }]);
    expect(await guideChecksLeft(db(), learner)).toBe(4);
  });

  it("cuts a reply longer than the limit instead of failing the call", async () => {
    const learner = await createLearner("linh@example.com");
    const many = { questions: Array.from({ length: 45 }, (_, index) => ({ text: `Câu ${index + 1}?`, label: "open", hint: "" })) };
    const run = respondingModels(() => ({ structured: many }));
    const result = await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: run.llmDeps });
    expect(result).toMatchObject({ ok: true, counts: { open: 40 } });
    expect(run.calls).toHaveLength(1);
  });

  it("refuses a guide over the limits, and any check once the session cap is spent, without a call", async () => {
    const learner = await createLearner("linh@example.com");
    const run = models();
    const tooMany = Array.from({ length: 21 }, (_, index) => `Câu ${index + 1}?`).join("\n");
    for (const input of [{ guide: "  " }, { guide: tooMany }, { guide: "x".repeat(3001) }, { guide: GUIDE, idea: "hai\ndòng" }, null]) {
      expect(await checkGuide(db(), learner, input, { llmDeps: run.llmDeps })).toEqual({ ok: false, error: "invalid_input" });
    }

    await setConfig(db(), "session_daily_cap_usd", 0, "admin@example.com");
    expect(await checkGuide(db(), learner, { guide: GUIDE }, { llmDeps: run.llmDeps })).toEqual({ ok: false, error: "over_cap" });
    expect(run.calls).toEqual([]);
    expect(await guideEvents()).toEqual([]);
  });
});

describe("progress", () => {
  const reveal = (told: number, recognizedFull: number | null) =>
    ({ counts: { told, total: 10, revealedCount: told, recognizedFull }, canvasEmpty: false, items: [], leading: [] }) as unknown as RevealJson;

  it("reads finished sessions with each question's text and checked label, and calls no model", async () => {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    const { model } = scriptedModel([
      { structured: rawAnalysis({ topic: topic(a("tag", "paid-app")), label: "open", question_type: "closed" }) },
      { text: "Không đều đâu em." },
    ]);
    const llmDeps: Partial<CallModelDeps> = { roleSpec: () => ({ provider: "openai", model: "gpt-6-luna", effort: "low" }), createModel: () => model };
    expect((await runTurn(db(), learner, session.id, { text: "Chị có ghi chi tiêu không ạ?", turnKey: randomUUID(), expectedIndex: 1 }, { llmDeps })).ok).toBe(true);
    await db().update(sessions).set({ status: "done", revealJson: reveal(4, 3), guess: 6, revealedAt: new Date() }).where(eq(sessions.id, session.id));
    const callsBefore = (await db().select().from(llmCalls)).length;

    const newest = await findNewestProgressSource(db(), learner.id);
    const first = await findFirstProgressSource(db(), learner.id);

    expect(newest).toMatchObject({
      sessionId: session.id,
      personaId: "chi-thu",
      personaName: "chị Thu",
      questions: [{ turn: 1, text: "Chị có ghi chi tiêu không ạ?", analysis: { label: "open", question_type: "closed" } }],
    });
    expect(first?.sessionId).toBe(session.id);
    expect(await findPreviousProgressSource(db(), learner.id, newest!)).toBeNull();
    expect(compareProgress(newest, null, first)).toMatchObject({ kind: "single", latest: { told: 4, total: 10, leading: 0, ignoredHints: 0 } });
    expect(await db().select().from(llmCalls)).toHaveLength(callsBefore);
  });

  it("finds the previous result with the same persona and the first result, only of this learner, in order", async () => {
    const learner = await createLearner("an@example.com");
    const other = await createLearner("binh@example.com");
    const finish = async (owner: typeof learner, at: Date) => {
      const session = await startSession(owner);
      await db().update(sessions).set({ status: "done", revealJson: reveal(2, null), guess: 1, revealedAt: at }).where(eq(sessions.id, session.id));
      return session.id;
    };
    const oldest = await finish(learner, new Date("2026-10-01T03:00:00Z"));
    const middle = await finish(learner, new Date("2026-10-10T03:00:00Z"));
    await finish(other, new Date("2026-10-15T03:00:00Z"));
    const latest = await finish(learner, new Date("2026-10-20T03:00:00Z"));

    const newest = await findNewestProgressSource(db(), learner.id);
    expect(newest?.sessionId).toBe(latest);
    expect((await findPreviousProgressSource(db(), learner.id, newest!))?.sessionId).toBe(middle);
    expect((await findFirstProgressSource(db(), learner.id))?.sessionId).toBe(oldest);
  });
});
