import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CANVAS_CHARS, MAX_TURNS, TURN_CLAIM_TTL_MS } from "@/config/limits";
import { getDb } from "@/db/client";
import { createSession, getPlayableScenario } from "@/db/repo/sessions";
import { claimTurn } from "@/db/repo/turns";
import { branches, events, sessions, snapshots, turns } from "@/db/schema";
import type { CallModelDeps } from "@/llm/call-model";
import type { AppUser } from "@/server/auth";
import { endSession, freezeAbandonedCanvas, saveCanvas } from "@/server/canvas";
import { runTurn } from "@/server/turns";
import { rawAnalysis } from "../helpers/engine-fixtures";
import { scriptedModel, type ScriptedStep } from "../helpers/scripted-model";
import { PERSONA_ID, createLearner, resetDatabase, startSession } from "../helpers/test-db";

let learner: AppUser;
let sessionId: string;

const sessionRow = async (id: string = sessionId) => (await getDb().select().from(sessions).where(eq(sessions.id, id)))[0];
const endEvents = () => getDb().select().from(events).where(eq(events.name, "session_ended"));
const save = (text: unknown, user: AppUser = learner, id: string = sessionId) => saveCanvas(getDb(), user, id, { text });
const end = (canvasText: unknown, user: AppUser = learner, id: string = sessionId) => endSession(getDb(), user, id, { canvasText });

/** One question through the real turn engine with a scripted provider; returns what the models were sent. */
async function play(text: string, expectedIndex: number, options: { deviceClass?: "mobile" | "desktop"; steps?: ScriptedStep[] } = {}) {
  const { model, calls } = scriptedModel(options.steps ?? [{ structured: rawAnalysis() }, { text: `Chị trả lời lượt ${expectedIndex}.` }]);
  const llmDeps: Partial<CallModelDeps> = {
    roleSpec: () => ({ provider: "openai", model: "gpt-6-luna", effort: "low" }),
    createModel: () => model,
  };
  const result = await runTurn(getDb(), learner, sessionId, { text, expectedIndex, turnKey: randomUUID() }, { llmDeps, deviceClass: options.deviceClass });
  return { result, calls };
}

async function playThirtyTurns() {
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    expect((await play(`Câu hỏi số ${turn} ạ?`, turn)).result).toMatchObject({ ok: true, turnIndex: turn });
  }
}

beforeEach(async () => {
  await resetDatabase();
  learner = await createLearner("linh@example.com");
  sessionId = (await startSession(learner)).id;
});

describe("saveCanvas: autosave of the notes", () => {
  it("starts empty and not frozen", async () => {
    expect(await sessionRow()).toMatchObject({ canvasText: "", canvasTokens: null, canvasFrozenAt: null, deviceClass: null });
  });

  it("stores the notes exactly as typed, line breaks, markup and outer spaces included", async () => {
    const typed = "  kế toán, 8h–6h\n\ntừng thử ghi chép rồi bỏ? <b>đậm</b>  ";
    expect(await save(typed)).toEqual({ ok: true });
    expect(await sessionRow()).toMatchObject({ canvasText: typed, canvasTokens: null, canvasFrozenAt: null, endedAt: null });
  });

  it("replaces the earlier text, and saves an emptied canvas as empty", async () => {
    await save("bản đầu");
    await save("bản sau");
    expect((await sessionRow()).canvasText).toBe("bản sau");
    await save("");
    expect((await sessionRow()).canvasText).toBe("");
  });

  it("writes no event and does not end the session", async () => {
    await save("ghi chú");
    expect(await endEvents()).toHaveLength(0);
    expect((await sessionRow()).endedAt).toBeNull();
  });

  it("accepts exactly 5,000 characters and refuses 5,001, whatever the browser allowed", async () => {
    expect(await save("a".repeat(MAX_CANVAS_CHARS))).toEqual({ ok: true });
    expect(await save("a".repeat(MAX_CANVAS_CHARS + 1))).toEqual({ ok: false, error: "invalid_input" });
    expect((await sessionRow()).canvasText).toHaveLength(MAX_CANVAS_CHARS);
  });

  it.each([[null], [12], [["a"]], [{ text: "a" }], [undefined]])("refuses a text that is not a string: %j", async (bad) => {
    expect(await save(bad)).toEqual({ ok: false, error: "invalid_input" });
    expect((await sessionRow()).canvasText).toBe("");
  });

  it("refuses a body without the field, and a body that is not an object", async () => {
    expect(await saveCanvas(getDb(), learner, sessionId, {})).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveCanvas(getDb(), learner, sessionId, null)).toEqual({ ok: false, error: "invalid_input" });
    expect(await saveCanvas(getDb(), learner, sessionId, "ghi chú")).toEqual({ ok: false, error: "invalid_input" });
  });

  it("does not let another learner write to the session, and does not say that it exists", async () => {
    const other = await createLearner("khac@example.com");
    await save("của Linh");
    expect(await save("của người khác", other)).toEqual({ ok: false, error: "not_found" });
    expect(await save("không có buổi", learner, randomUUID())).toEqual({ ok: false, error: "not_found" });
    expect((await sessionRow()).canvasText).toBe("của Linh");
  });

  it("is refused once the notes are frozen, and the frozen text stays", async () => {
    await end("bản đóng băng");
    expect(await save("sửa sau khi kết thúc")).toEqual({ ok: false, error: "frozen" });
    expect((await sessionRow()).canvasText).toBe("bản đóng băng");
  });

  it("is refused for a session that is no longer being interviewed", async () => {
    await getDb().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, sessionId));
    expect(await save("ghi thêm")).toEqual({ ok: false, error: "frozen" });
    expect((await sessionRow()).canvasText).toBe("");
  });
});

describe("endSession: ending freezes the notes", () => {
  it("ends the session and freezes the text sent with the request, not the last autosave", async () => {
    await save("bản đã tự lưu");
    expect(await end("bản đã tự lưu, cộng phần đang gõ dở")).toEqual({ ok: true });

    const row = await sessionRow();
    expect(row).toMatchObject({
      status: "interviewing",
      canvasText: "bản đã tự lưu, cộng phần đang gõ dở",
      canvasTokens: ["bản", "đã", "tự", "lưu,", "cộng", "phần", "đang", "gõ", "dở"],
    });
    expect(row.endedAt).not.toBeNull();
    expect(row.canvasFrozenAt).not.toBeNull();
  });

  it("keeps the frozen text as typed and numbers its tokens by whitespace", async () => {
    await end("  dòng một\n\tdòng  hai  ");
    expect(await sessionRow()).toMatchObject({ canvasText: "  dòng một\n\tdòng  hai  ", canvasTokens: ["dòng", "một", "dòng", "hai"] });
  });

  it("writes one end event that says the notes were not empty", async () => {
    await end("có ghi chú");
    expect(await endEvents()).toMatchObject([{ userId: learner.id, sessionId, props: { canvas_empty: false, device_class: null } }]);
  });

  it.each([[""], ["   \n\t "]])("counts %j as an empty canvas, with no tokens", async (text) => {
    expect(await end(text)).toEqual({ ok: true });
    expect(await sessionRow()).toMatchObject({ canvasText: text, canvasTokens: [] });
    expect(await endEvents()).toMatchObject([{ props: { canvas_empty: true } }]);
  });

  it("changes nothing when it is sent again: the first frozen text, time and event stay", async () => {
    await end("lần đầu");
    const first = await sessionRow();

    expect(await end("lần hai, khác hẳn")).toEqual({ ok: true });

    const second = await sessionRow();
    expect(second.canvasText).toBe("lần đầu");
    expect(second.canvasFrozenAt).toEqual(first.canvasFrozenAt);
    expect(second.endedAt).toEqual(first.endedAt);
    expect(await endEvents()).toHaveLength(1);
  });

  it("freezes once when several end requests arrive together", async () => {
    const results = await Promise.all(["a", "b", "c", "d"].map((text) => end(text)));
    expect(results).toEqual(Array(4).fill({ ok: true }));
    expect(["a", "b", "c", "d"]).toContain((await sessionRow()).canvasText);
    expect(await endEvents()).toHaveLength(1);
  });

  it("refuses notes longer than 5,000 characters and does not end the session", async () => {
    expect(await end("a".repeat(MAX_CANVAS_CHARS + 1))).toEqual({ ok: false, error: "invalid_input" });
    expect(await endSession(getDb(), learner, sessionId, {})).toEqual({ ok: false, error: "invalid_input" });
    expect(await endSession(getDb(), learner, sessionId, null)).toEqual({ ok: false, error: "invalid_input" });
    expect(await sessionRow()).toMatchObject({ endedAt: null, canvasFrozenAt: null });
    expect(await end("a".repeat(MAX_CANVAS_CHARS))).toEqual({ ok: true });
  });

  it("does not let another learner end the session", async () => {
    const other = await createLearner("khac@example.com");
    expect(await end("phá", other)).toEqual({ ok: false, error: "not_found" });
    expect(await end("phá", learner, randomUUID())).toEqual({ ok: false, error: "not_found" });
    expect(await sessionRow()).toMatchObject({ endedAt: null, canvasFrozenAt: null, canvasText: "" });
  });

  it("is refused for a session that left the interview without frozen notes", async () => {
    await getDb().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, sessionId));
    expect(await end("ghi chú")).toEqual({ ok: false, error: "session_ended" });
    expect((await sessionRow()).canvasFrozenAt).toBeNull();
  });

  it("writes no event for a demo account", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });
    const demoSession = await startSession(demo);
    expect(await end("ghi chú demo", demo, demoSession.id)).toEqual({ ok: true });
    expect((await sessionRow(demoSession.id)).canvasFrozenAt).not.toBeNull();
    expect(await endEvents()).toHaveLength(0);
  });
});

describe("endSession: against a turn that is being answered", () => {
  it("is refused while a turn holds a live claim, and nothing changes", async () => {
    await save("đã tự lưu");
    const claimed = await claimTurn(getDb(), { userId: learner.id, sessionId, expectedIndex: 1 });
    expect(claimed.ok).toBe(true);

    expect(await end("muốn kết thúc")).toEqual({ ok: false, error: "in_flight" });

    expect(await sessionRow()).toMatchObject({ endedAt: null, canvasFrozenAt: null, canvasText: "đã tự lưu" });
    expect(await endEvents()).toHaveLength(0);
  });

  it("goes through when the claim belongs to a request that died", async () => {
    const longAgo = new Date(Date.now() - TURN_CLAIM_TTL_MS - 1000);
    await claimTurn(getDb(), { userId: learner.id, sessionId, expectedIndex: 1, now: longAgo });
    expect(await end("kết thúc được")).toEqual({ ok: true });
    expect((await sessionRow()).canvasFrozenAt).not.toBeNull();
  });

  it("is refused from inside a running turn, and that turn is then written whole", async () => {
    let endResult: unknown;
    const { result } = await play("Chị kể đi ạ?", 1, {
      steps: [{ structured: rawAnalysis() }, { text: "Chị kể nè.", before: async () => void (endResult = await end("giữa lượt")) }],
    });

    expect(endResult).toEqual({ ok: false, error: "in_flight" });
    expect(result).toEqual({ ok: true, personaText: "Chị kể nè.", turnIndex: 1 });
    expect(await sessionRow()).toMatchObject({ endedAt: null, canvasFrozenAt: null, turnClaim: null });
  });

  it("after the end, a turn is refused before any model call", async () => {
    await end("xong");
    const { result, calls } = await play("Còn hỏi được không ạ?", 1);
    expect(result).toEqual({ ok: false, error: "session_ended" });
    expect(calls).toHaveLength(0);
  });
});

describe("turn 30: the session ends, the notes freeze with the end request", () => {
  it("ends the session at turn 30 without freezing, so notes typed during it are still saved", async () => {
    await save("trước lượt 30");
    await playThirtyTurns();

    const ended = await sessionRow();
    expect(ended.endedAt).not.toBeNull();
    expect(ended).toMatchObject({ canvasFrozenAt: null, canvasTokens: null, canvasText: "trước lượt 30" });
    expect(await endEvents()).toHaveLength(0);

    expect(await save("trước lượt 30, gõ thêm trong lúc chờ")).toEqual({ ok: true });
    expect((await sessionRow()).canvasText).toBe("trước lượt 30, gõ thêm trong lúc chờ");
  });

  it("freezes the notes the browser sends after turn 30, typed text included, and keeps the end time of turn 30", async () => {
    await save("đã tự lưu");
    await playThirtyTurns();
    const endedAt = (await sessionRow()).endedAt;

    expect(await end("đã tự lưu + gõ trong lượt 30")).toEqual({ ok: true });

    const frozen = await sessionRow();
    expect(frozen.canvasText).toBe("đã tự lưu + gõ trong lượt 30");
    expect(frozen.canvasFrozenAt).not.toBeNull();
    expect(frozen.endedAt).toEqual(endedAt);
    expect(await endEvents()).toMatchObject([{ props: { canvas_empty: false } }]);
  });

  it("freezes after turn 30 even when an old turn claim is still on the row", async () => {
    await playThirtyTurns();
    await getDb().update(sessions).set({ turnClaim: { token: randomUUID(), at: new Date().toISOString() } }).where(eq(sessions.id, sessionId));
    expect(await end("vẫn đóng băng")).toEqual({ ok: true });
    expect((await sessionRow()).canvasText).toBe("vẫn đóng băng");
  });
});

describe("freezeAbandonedCanvas: the browser never sent the final notes", () => {
  it("freezes the last autosaved text of a session that turn 30 ended", async () => {
    await save("bản tự lưu cuối");
    await playThirtyTurns();

    expect(await freezeAbandonedCanvas(getDb(), sessionId, 0)).toBe(true);

    const frozen = await sessionRow();
    expect(frozen).toMatchObject({ canvasText: "bản tự lưu cuối", canvasTokens: ["bản", "tự", "lưu", "cuối"] });
    expect(frozen.canvasFrozenAt).not.toBeNull();
    expect(await endEvents()).toMatchObject([{ sessionId, props: { canvas_empty: false } }]);
  });

  it("reports an empty canvas when nothing was ever saved", async () => {
    await playThirtyTurns();
    expect(await freezeAbandonedCanvas(getDb(), sessionId, 0)).toBe(true);
    expect(await sessionRow()).toMatchObject({ canvasText: "", canvasTokens: [] });
    expect(await endEvents()).toMatchObject([{ props: { canvas_empty: true } }]);
  });

  it("waits out the grace period, so the browser's own end request can still bring the typed notes", async () => {
    await save("tự lưu");
    await playThirtyTurns();

    // By default the browser has 60 seconds; the session ended a moment ago.
    expect(await freezeAbandonedCanvas(getDb(), sessionId)).toBe(false);
    expect((await sessionRow()).canvasFrozenAt).toBeNull();

    expect(await end("tự lưu + phần gõ dở")).toEqual({ ok: true });
    expect((await sessionRow()).canvasText).toBe("tự lưu + phần gõ dở");
  });

  it("freezes once the grace period has passed", async () => {
    await save("tự lưu");
    await playThirtyTurns();
    await getDb().update(sessions).set({ endedAt: new Date(Date.now() - 61_000) }).where(eq(sessions.id, sessionId));

    expect(await freezeAbandonedCanvas(getDb(), sessionId)).toBe(true);
    expect((await sessionRow()).canvasText).toBe("tự lưu");
  });

  it("does nothing to a session that has not ended", async () => {
    await save("đang phỏng vấn");
    expect(await freezeAbandonedCanvas(getDb(), sessionId, 0)).toBe(false);
    expect(await sessionRow()).toMatchObject({ endedAt: null, canvasFrozenAt: null });
  });

  it("does nothing to notes that are already frozen, and nothing for an unknown session", async () => {
    await end("đã đóng băng");
    const before = await sessionRow();

    expect(await freezeAbandonedCanvas(getDb(), sessionId, 0)).toBe(false);
    expect(await freezeAbandonedCanvas(getDb(), randomUUID(), 0)).toBe(false);

    expect(await sessionRow()).toEqual(before);
    expect(await endEvents()).toHaveLength(1);
  });

  it("makes a later end request harmless: the frozen text stays", async () => {
    await save("tự lưu");
    await playThirtyTurns();
    await freezeAbandonedCanvas(getDb(), sessionId, 0);

    expect(await end("đến muộn")).toEqual({ ok: true });
    expect((await sessionRow()).canvasText).toBe("tự lưu");
    expect(await endEvents()).toHaveLength(1);
  });
});

describe("the notes stay out of the interview", () => {
  it("sends no part of the canvas to Call 1 or Call 2", async () => {
    const marker = "GHICHU-RIENG-7391";
    await save(`chị ấy có vẻ ngại nói chuyện tiền ${marker}`);

    const { result, calls } = await play("Chị có hay ghi lại chi tiêu không ạ?", 1);

    expect(result).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const prompt = call.messages.map((message) => message.text).join("\n");
      expect(prompt).not.toContain(marker);
      expect(prompt).not.toContain("ngại nói chuyện tiền");
    }
  });

  it("leaves the notes alone when a turn is written", async () => {
    await save("ghi chú trước lượt");
    await play("Chị kể đi ạ?", 1);
    expect(await sessionRow()).toMatchObject({ canvasText: "ghi chú trước lượt", canvasFrozenAt: null });
  });
});

describe("device class", () => {
  it("is stored from the first turn that reports it and is not changed by later turns", async () => {
    await play("Câu một?", 1);
    expect((await sessionRow()).deviceClass).toBeNull();

    await play("Câu hai?", 2, { deviceClass: "mobile" });
    expect((await sessionRow()).deviceClass).toBe("mobile");

    await play("Câu ba?", 3, { deviceClass: "desktop" });
    await play("Câu bốn?", 4);
    expect((await sessionRow()).deviceClass).toBe("mobile");
  });

  it("is carried by the end event", async () => {
    await play("Câu một?", 1, { deviceClass: "desktop" });
    await end("");
    expect(await endEvents()).toMatchObject([{ props: { canvas_empty: true, device_class: "desktop" } }]);
  });
});

describe("createSession: all or nothing", () => {
  it("leaves no half session when something fails while it is being created", async () => {
    await getDb().delete(sessions);
    const found = await getPlayableScenario(getDb(), PERSONA_ID, false, learner.id);

    const failing = createSession(getDb(), { userId: learner.id, scenario: found!.scenario, isDemo: false }, async () => {
      throw new Error("the event could not be written");
    });

    await expect(failing).rejects.toThrow("the event could not be written");
    for (const table of [sessions, branches, turns, snapshots]) expect(await getDb().select().from(table)).toHaveLength(0);
  });
});
