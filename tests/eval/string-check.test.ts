import { describe, expect, it } from "vitest";
import { checkString, personaStrings, preCheck, stringStates, textHash, type FixedString } from "@/eval/string-check";
import * as productStringsModule from "@/strings/product-strings";
import { productStrings } from "@/strings/product-strings";
import { a, chiThu, rawAnalysis } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";

const CLEAN = { structured: { real_user_claim: false, reason: "Lời nhân vật nói về chính mình." } };
const call = (models: ReturnType<typeof roleModels>) => ({ scope: { scope: "eval" as const }, meta: {}, llmDeps: models.llmDeps });
const strings = personaStrings(chiThu);
const byKey = (key: string) => strings.find((entry) => entry.key === key)!;

describe("fixed string registries", () => {
  it("lists the opening line, the habit card label, and the hook line and sample question of every item", () => {
    expect(strings).toHaveLength(2 + chiThu.items.length * 2);
    expect(byKey("opening_line").text).toBe(chiThu.opening_line);
    expect(byKey("habit_card_label").text).toBe(chiThu.habit_card_label);
    const paidApp = chiThu.items.find((item) => item.id === "paid-app")!;
    expect(byKey("items.paid-app.hook_line").text).toBe(paidApp.hook_line);
    expect(byKey("items.paid-app.hook_line").sampleOfItemId).toBeUndefined();
    expect(byKey("items.paid-app.sample_question")).toMatchObject({ text: paidApp.sample_question, sampleOfItemId: "paid-app" });
  });

  it("never lists sealed content: an item's content is not a fixed string", () => {
    const texts = strings.map((entry) => entry.text);
    for (const item of chiThu.items) expect(texts).not.toContain(item.content);
  });

  it("lists every string the product strings module exports, so a new one cannot ship unchecked", () => {
    // Read from the module itself, not from a list kept here: every exported string, and every
    // string inside an exported group, must be in the registry.
    const exported = Object.values(productStringsModule).flatMap((value) =>
      typeof value === "string" ? [value] : typeof value === "object" && value !== null ? Object.values(value).filter((entry) => typeof entry === "string") : [],
    );
    const texts = productStrings().map((entry) => entry.text);

    expect(exported.length).toBeGreaterThanOrEqual(11);
    expect([...texts].sort()).toEqual([...exported].sort());
    expect(new Set(productStrings().map((entry) => entry.key)).size).toBe(texts.length);
  });
});

describe("preCheck", () => {
  it.each([
    ["70% người dùng bỏ ghi chi tiêu sau một tháng.", /phần trăm/],
    ["Người trẻ có tới 60 phần trăm không ghi chi tiêu.", /phần trăm/],
    ["Nghiên cứu cho thấy ai cũng ngại nhìn số đã chi.", /nghiên cứu/],
    ["KHẢO SÁT gần đây chỉ ra điều này.", /nghiên cứu/],
    ["Đa số người dùng không ghi chi tiêu.", /đa số/],
    ["Hầu hết người trẻ đều vậy.", /đa số/],
  ])("stops %s without a model", (text, problem) => {
    expect(preCheck(text).join(" ")).toMatch(problem);
  });

  it("lets every fixed string of chị Thu and of the product through", () => {
    for (const entry of [...strings, ...productStrings()]) expect(preCheck(entry.text), entry.key).toEqual([]);
  });

  it("does not mind a number that is not a share of users", () => {
    expect(preCheck("Lần gần đây nhất chị cũng ghi được một dạo, chừng 3 tuần.")).toEqual([]);
    expect(preCheck("Tối đa 30 lượt hỏi.")).toEqual([]);
  });
});

describe("checkString", () => {
  it("passes a statement the model finds clean, with one call", async () => {
    const models = roleModels({ STRING_CHECK: [CLEAN] });

    expect(await checkString(byKey("items.paid-app.hook_line"), chiThu, call(models))).toEqual({ ok: true, problems: [] });

    expect(models.calls("STRING_CHECK")).toHaveLength(1);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
    expect(models.prompts("STRING_CHECK")[0]).toContain("Có lần chị định ghi lại nhưng rồi cũng bỏ.");
  });

  it("fails a string the model says claims something about real users", async () => {
    const models = roleModels({ STRING_CHECK: [{ structured: { real_user_claim: true, reason: "Nói về mọi người trẻ." } }] });

    expect(await checkString(byKey("opening_line"), chiThu, call(models))).toEqual({
      ok: false,
      problems: ["Khẳng định về người dùng thật: Nói về mọi người trẻ."],
    });
  });

  it("fails on a pre-check without calling any model", async () => {
    const models = roleModels({});
    const entry: FixedString = { key: "x", text: "Đa số người dùng bỏ sau hai tuần.", origin: "lời sản phẩm" };

    expect((await checkString(entry, null, call(models))).ok).toBe(false);
    expect(models.records).toEqual([]);
  });

  it("runs a sample question through the production classifier, asked right after the item's hook line", async () => {
    const models = roleModels({
      STRING_CHECK: [CLEAN],
      ANALYSIS: [{ structured: rawAnalysis({ label: "confirm_grounded", grounded_turn_id: 1, hook_id: a("hook", "paid-app") }) }],
    });

    expect(await checkString(byKey("items.paid-app.sample_question"), chiThu, call(models))).toEqual({ ok: true, problems: [] });

    const [prompt] = models.prompts("ANALYSIS");
    expect(prompt).toContain("[lượt 1] nhân vật: Có lần chị định ghi lại nhưng rồi cũng bỏ.");
    expect(prompt).toContain("0:Lần 1:chị 2:định");
  });

  it("fails a sample question the classifier labels leading", async () => {
    const models = roleModels({
      STRING_CHECK: [CLEAN],
      ANALYSIS: [{ structured: rawAnalysis({ label: "leading", introduced_span: [0, 1] }) }],
    });

    expect(await checkString(byKey("items.shame.sample_question"), chiThu, call(models))).toEqual({
      ok: false,
      problems: ["Câu hỏi mẫu bị bộ phân loại gắn nhãn leading."],
    });
  });

  it("does not run the classifier on a product string, which has no persona", async () => {
    const models = roleModels({ STRING_CHECK: [CLEAN] });
    const [first] = productStrings();

    expect((await checkString({ ...first, origin: "lời sản phẩm" }, null, call(models))).ok).toBe(true);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
  });
});

describe("stringStates", () => {
  const entry: FixedString = { key: "opening_line", text: "Chào em.", origin: "lời mở đầu" };
  const row = (text: string, ok: boolean, decision: "approved" | "returned" | null) => ({
    stringKey: "opening_line",
    textHash: textHash(text),
    fr36Result: { ok, problems: ok ? [] : ["lỗi"] },
    decision,
    note: decision === "returned" ? "sửa lại" : null,
  });

  it("is unchecked and unapproved when nothing is stored", () => {
    expect(stringStates([entry], [])).toEqual([{ ...entry, checked: false, checkOk: false, problems: [], decision: null, approved: false, note: null }]);
  });

  it("is approved when the stored row is for this exact text", () => {
    expect(stringStates([entry], [row("Chào em.", true, "approved")])[0]).toMatchObject({ checked: true, checkOk: true, approved: true });
  });

  it("loses its check and its approval when the text was edited", () => {
    expect(stringStates([entry], [row("Chào em nha.", true, "approved")])[0]).toMatchObject({ checked: false, checkOk: false, approved: false });
  });

  it("keeps a returned string unapproved, with the note", () => {
    expect(stringStates([entry], [row("Chào em.", true, "returned")])[0]).toMatchObject({ approved: false, decision: "returned", note: "sửa lại" });
  });

  it("reports the problems of a failed check", () => {
    expect(stringStates([entry], [row("Chào em.", false, null)])[0]).toMatchObject({ checked: true, checkOk: false, problems: ["lỗi"] });
  });

  it("gives two texts that differ by one character different hashes", () => {
    expect(textHash("Chào em.")).not.toBe(textHash("Chào em"));
    expect(textHash("Chào em.")).toMatch(/^[0-9a-f]{64}$/);
  });
});
