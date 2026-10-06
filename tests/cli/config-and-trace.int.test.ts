import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { adminAccessLog, config, llmCalls, users } from "@/db/schema";
import type { CallModelDeps } from "@/llm/call-model";
import { runTurn } from "@/server/turns";
import { runConfig } from "../../cli/commands/config";
import { runTrace } from "../../cli/commands/trace";
import { operatorEmail } from "../../cli/operator";
import { CliError } from "../../cli/scenario-file";
import { DROPPED, a, rawAnalysis, told } from "../helpers/engine-fixtures";
import { scriptedModel } from "../helpers/scripted-model";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

const admin = () => "admin@example.com";
const noOperator = () => {
  throw new CliError("Lệnh này cần biết ai đang chạy: đặt OPERATOR_EMAIL trong .env.local.");
};

beforeEach(resetDatabase);

describe("operatorEmail", () => {
  it("returns the operator when it is one of the admins, whatever the case", () => {
    expect(operatorEmail({ OPERATOR_EMAIL: " Admin@Example.com ", ADMIN_EMAILS: "other@example.com, admin@example.com" })).toBe("admin@example.com");
  });

  it("refuses a missing operator and one who is not an admin", () => {
    expect(() => operatorEmail({ ADMIN_EMAILS: "admin@example.com" })).toThrow(/OPERATOR_EMAIL/);
    expect(() => operatorEmail({ OPERATOR_EMAIL: "", ADMIN_EMAILS: "admin@example.com" })).toThrow(/OPERATOR_EMAIL/);
    expect(() => operatorEmail({ OPERATOR_EMAIL: "linh@example.com", ADMIN_EMAILS: "admin@example.com" })).toThrow(/không có trong ADMIN_EMAILS/);
    expect(() => operatorEmail({ OPERATOR_EMAIL: "linh@example.com" })).toThrow(/không có trong ADMIN_EMAILS/);
  });
});

describe("il config", () => {
  it("lists every key with its default", async () => {
    const { io, out } = capture();
    expect(await runConfig(["list"], io, getDb(), admin)).toBe(0);
    expect(out.filter((line) => !line.startsWith("  "))).toEqual([
      "require_published = false  (mặc định)",
      "session_daily_cap_usd = 5  (mặc định)",
      "session_demo_reserve_usd = 1  (mặc định)",
    ]);
  });

  it("sets a value, records who set it, and reads it back", async () => {
    const { io, out } = capture();

    expect(await runConfig(["set", "session_daily_cap_usd", "12.5"], io, getDb(), admin)).toBe(0);
    expect(await runConfig(["get", "session_daily_cap_usd"], io, getDb(), admin)).toBe(0);
    expect(await runConfig(["set", "require_published", "true"], io, getDb(), admin)).toBe(0);

    expect(out).toEqual(["session_daily_cap_usd = 12.5", "12.5", "require_published = true"]);
    expect(await getConfig(getDb(), "session_daily_cap_usd")).toBe(12.5);
    expect(await getConfig(getDb(), "require_published")).toBe(true);
    expect(await getDb().select().from(config)).toMatchObject([
      { key: "session_daily_cap_usd", value: 12.5, updatedBy: "admin@example.com" },
      { key: "require_published", value: true, updatedBy: "admin@example.com" },
    ]);

    const list = capture();
    await runConfig(["list"], list.io, getDb(), admin);
    expect(list.out[0]).toMatch(/^require_published = true {2}\(đặt bởi admin@example\.com, \d{4}-/);
  });

  it("overwrites an earlier value", async () => {
    const { io } = capture();
    await runConfig(["set", "session_daily_cap_usd", "3"], io, getDb(), admin);
    await runConfig(["set", "session_daily_cap_usd", "4"], io, getDb(), () => "second@example.com");
    expect(await getDb().select().from(config)).toMatchObject([{ value: 4, updatedBy: "second@example.com" }]);
  });

  it.each([
    ["an unknown key", ["set", "khong_co", "1"], /Không có khóa "khong_co"/],
    ["a value of the wrong type", ["set", "require_published", "1"], /không hợp lệ cho "require_published"/],
    ["a negative cap", ["set", "session_daily_cap_usd", "-1"], /không hợp lệ/],
    ["a value that is not JSON", ["set", "require_published", "yes"], /không phải JSON/],
    ["a missing value", ["set", "require_published"], /Cách dùng/],
    ["a missing key", ["get"], /Cách dùng/],
    ["an unknown action", ["delete", "require_published"], /Cách dùng/],
    ["no action", [], /Cách dùng/],
  ])("refuses %s and writes nothing", async (_label, args, message) => {
    const { io, err } = capture();
    expect(await runConfig(args, io, getDb(), admin)).toBe(1);
    expect(err.join("\n")).toMatch(message);
    expect(await getDb().select().from(config)).toHaveLength(0);
  });

  it("refuses to set anything without an operator, but still reads", async () => {
    const { io, out, err } = capture();
    expect(await runConfig(["set", "require_published", "true"], io, getDb(), noOperator)).toBe(1);
    expect(err).toEqual(["Lệnh này cần biết ai đang chạy: đặt OPERATOR_EMAIL trong .env.local."]);
    expect(await getDb().select().from(config)).toHaveLength(0);
    expect(await runConfig(["get", "require_published"], io, getDb(), noOperator)).toBe(0);
    expect(out).toEqual(["false"]);
  });

  it("needs a database", async () => {
    const { io, err } = capture();
    expect(await runConfig(["list"], io, null, admin)).toBe(1);
    expect(err[0]).toMatch(/cần cơ sở dữ liệu/);
  });
});

describe("il trace", () => {
  /** Three turns: a hook is dropped, picked up to open the paid-app item, and the item is told. */
  async function playedSession() {
    const learner = await createLearner("linh@example.com");
    const session = await startSession(learner);
    const { model } = scriptedModel([
      { structured: rawAnalysis({ topic_tags: [a("tag", "paid-app")], label: "confirm_grounded", grounded_turn_id: 0, question_type: "closed" }) },
      { text: "Có lần chị định ghi lại nhưng rồi cũng bỏ." },
      { structured: rawAnalysis({ prev_turn_verdict: DROPPED, hook_id: a("hook", "paid-app"), label: "boundary_probe", grounded_turn_id: 1 }) },
      { text: "Chị đang trả phí một app mà gần như không mở." },
      { structured: rawAnalysis({ prev_turn_verdict: { ...told("paid-app"), violations: [a("doNotAssert", "installment")] } }) },
      { text: "Thì chị quên hủy đó em." },
    ]);
    const llmDeps: Partial<CallModelDeps> = { roleSpec: () => ({ provider: "openai", model: "gpt-6-luna", effort: "low" }), createModel: () => model };
    const questions = ["Chị có ghi chi tiêu không ạ?", "Lần chị định ghi lại đó, chị định ghi kiểu gì ạ?", "Sao chị chưa hủy ạ?"];
    for (const [index, text] of questions.entries()) {
      const result = await runTurn(getDb(), learner, session.id, { text, turnKey: randomUUID(), expectedIndex: index + 1 }, { llmDeps });
      expect(result.ok).toBe(true);
    }
    return { learner, session };
  }

  it("prints every FR-44 field of every turn from stored data", async () => {
    const { session } = await playedSession();
    const { io, out, err } = capture();

    expect(await runTrace([session.id], io, getDb(), admin)).toBe(0);
    expect(err).toEqual([]);
    const text = out.join("\n");

    expect(out[0]).toBe(`Buổi ${session.id} · chi-thu phiên bản 1 · interviewing · 3 lượt`);
    expect(text).toContain("Lượt 0 (lời mở đầu, không gọi LLM)");

    // Turn 1: the learner question, Call 1 as returned, the correction, the rules, the hook, openness.
    const turn1 = text.slice(text.indexOf("\nLượt 1\n"), text.indexOf("\nLượt 2\n"));
    expect(turn1).toContain("  Người học: Chị có ghi chi tiêu không ạ?");
    // Postgres stores JSON keys in its own order, so the line is compared as an object.
    const call1 = turn1.split("\n").find((line) => line.startsWith("  Call 1: "))!;
    expect(JSON.parse(call1.slice("  Call 1: ".length))).toEqual(
      rawAnalysis({ topic_tags: [a("tag", "paid-app")], label: "confirm_grounded", grounded_turn_id: 0, question_type: "closed" }),
    );
    expect(turn1).toContain("  Verdict cho lượt 0: (không áp dụng)");
    expect(turn1).toContain(`    - label: "confirm_grounded" → "open" (grounded_turn_id không trỏ tới lượt persona nào trước lượt này)`);
    expect(turn1).toContain("  Sau khi kiểm: nhãn = open; loại = closed; grounded_turn_id = null; introduced_span = null; hook = null; tag = paid-app");
    expect(turn1).toContain("    - paid-app [follow_up]: không thỏa");
    expect(turn1).toContain("    - shame [follow_up]: tiên quyết còn khóa");
    expect(turn1).toContain("  Item mở: (không)");
    expect(turn1).toContain("  Hook được chọn: paid-app (đã thả)");
    expect(turn1).toContain("  Openness: 4 → 4");
    expect(turn1).toContain("  Persona: Có lần chị định ghi lại nhưng rồi cũng bỏ.");

    // Turn 2: the verdict for turn 1, the rule that held, the item opened.
    const turn2 = text.slice(text.indexOf("\nLượt 2\n"), text.indexOf("\nLượt 3\n"));
    expect(turn2).toContain("  Verdict cho lượt 1: hook đã thả = true; đã kể = (không); vi phạm = (không)");
    expect(turn2).toContain("  Sửa của code: (không)");
    expect(turn1).toContain("  Sửa của code:\n    - label");
    expect(turn2).toContain("    - paid-app [follow_up]: thỏa");
    expect(turn2).toContain("  Item mở: paid-app");
    expect(turn2).toContain("  Hook được chọn: (không)");
    expect(turn2).toContain("  Openness: 4 → 5");
    expect(turn2).toContain("[GẮN CỜ: vi phạm do-not-assert]");

    // Turn 3: the verdict for turn 2 (told, with a violation); its own verdict has not arrived.
    const turn3 = text.slice(text.indexOf("\nLượt 3\n"));
    expect(turn3).toContain("  Verdict cho lượt 2: hook đã thả = false; đã kể = paid-app; vi phạm = dna-installment");
    expect(turn3).not.toContain("GẮN CỜ");
  });

  it("makes no model call and records the access", async () => {
    const { learner, session } = await playedSession();
    const callsBefore = (await getDb().select().from(llmCalls)).length;

    await runTrace([session.id], capture().io, getDb(), admin);

    expect(await getDb().select().from(llmCalls)).toHaveLength(callsBefore);
    expect(await getDb().select().from(adminAccessLog)).toMatchObject([
      { adminEmail: "admin@example.com", channel: "cli", sessionId: session.id, userId: learner.id, action: "trace" },
    ]);
  });

  it("refuses to show a session without an operator, and logs nothing", async () => {
    const { session } = await playedSession();
    const { io, out, err } = capture();

    expect(await runTrace([session.id], io, getDb(), noOperator)).toBe(1);

    expect(out).toEqual([]);
    expect(err[0]).toMatch(/OPERATOR_EMAIL/);
    expect(await getDb().select().from(adminAccessLog)).toHaveLength(0);
  });

  it.each([
    ["an unknown session", [randomUUID()], /Không tìm thấy buổi/],
    ["an id that is not a uuid", ["abc"], /không phải id buổi/],
    ["no id", [], /Cách dùng/],
  ])("exits 1 for %s and logs no access", async (_label, args, message) => {
    const { io, err } = capture();
    expect(await runTrace(args, io, getDb(), admin)).toBe(1);
    expect(err.join("\n")).toMatch(message);
    expect(await getDb().select().from(adminAccessLog)).toHaveLength(0);
  });

  it("keeps the access row when the session is deleted, without the ids", async () => {
    const { learner, session } = await playedSession();
    await runTrace([session.id], capture().io, getDb(), admin);

    await getDb().delete(users).where(eq(users.id, learner.id));

    expect(await getDb().select().from(adminAccessLog)).toMatchObject([
      { adminEmail: "admin@example.com", action: "trace", sessionId: null, userId: null },
    ]);
  });
});
