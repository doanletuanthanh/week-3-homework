import { eq } from "drizzle-orm";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { createEvalRun, finishEvalRun } from "@/db/repo/eval";
import { adjudications, evalRuns, leakFlags, scenarios, sessions, stringApprovals } from "@/db/schema";
import { openSession } from "@/server/sessions";
import { productStrings } from "@/strings/product-strings";
import { runAdjudicate } from "../../cli/commands/adjudicate";
import { importScenarioFile } from "../../cli/commands/import-scenario";
import { runPublish, runUnpublish } from "../../cli/commands/publish";
import { runApproveStrings, runCheckStrings } from "../../cli/commands/strings";
import { CliError } from "../../cli/scenario-file";
import { rawAnalysis } from "../helpers/engine-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import { CLEAN_STRING, approveEverything, cleanPersonaCheck, newestVersion, seedFullRun } from "../helpers/publish-fixtures";
import { readChiThu } from "../helpers/sealed-strings";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

const thanh = () => "thanh@example.com";
const linh = () => "linh@example.com";
const noOperator = () => {
  throw new CliError("Lệnh này cần biết ai đang chạy: đặt OPERATOR_EMAIL trong .env.local.");
};

const flagRows = () => getDb().select().from(leakFlags).orderBy(leakFlags.episode);

beforeEach(resetDatabase);

describe("il check-strings", () => {
  it("checks every fixed string of the persona once and stores each result", async () => {
    const models = cleanPersonaCheck();
    const { io, out } = capture();

    expect(await runCheckStrings(["chi-thu"], io, getDb(), models.llmDeps)).toBe(0);

    expect(out).toHaveLength(25);
    expect(out[0]).toBe("[OK] opening_line: Chào em, chị là Thu. Em cứ hỏi tự nhiên nha, chị trả lời được gì thì trả lời.");
    expect(out.at(-1)).toBe("24 chuỗi, 24 vừa kiểm, 0 không qua.");
    const rows = await getDb().select().from(stringApprovals);
    expect(rows).toHaveLength(24);
    expect(rows.every((row) => row.scope === "persona" && row.personaId === "chi-thu" && row.fr36Result.ok && row.decision === null)).toBe(true);
    expect(models.records.every((record) => record.scope === "eval")).toBe(true);
  });

  it("does not check again a string whose text has not changed, unless --all is given", async () => {
    await runCheckStrings(["chi-thu"], capture().io, getDb(), cleanPersonaCheck().llmDeps);

    const again = roleModels({});
    const second = capture();
    expect(await runCheckStrings(["chi-thu"], second.io, getDb(), again.llmDeps)).toBe(0);
    expect(again.records).toEqual([]);
    expect(second.out.at(-1)).toBe("24 chuỗi, 0 vừa kiểm, 0 không qua.");

    const all = cleanPersonaCheck();
    await runCheckStrings(["chi-thu", "--all"], capture().io, getDb(), all.llmDeps);
    expect(all.calls("STRING_CHECK")).toHaveLength(24);
    expect(await getDb().select().from(stringApprovals)).toHaveLength(24);
  });

  it("exits 1 and prints the problem when a string fails, and stores the failure", async () => {
    const models = roleModels({
      STRING_CHECK: [{ structured: { real_user_claim: true, reason: "Nói về người trẻ nói chung." } }, ...repeat(23, CLEAN_STRING)],
      ANALYSIS: [{ structured: rawAnalysis({ label: "leading", introduced_span: [0, 1] }) }, ...repeat(10, { structured: rawAnalysis() })],
    });
    const { io, out } = capture();

    expect(await runCheckStrings(["chi-thu"], io, getDb(), models.llmDeps)).toBe(1);

    expect(out[0]).toMatch(/^\[LỖI\] opening_line: /);
    expect(out[1]).toBe("      Khẳng định về người dùng thật: Nói về người trẻ nói chung.");
    expect(out).toContain("      Câu hỏi mẫu bị bộ phân loại gắn nhãn leading.");
    expect(out.at(-1)).toBe("24 chuỗi, 24 vừa kiểm, 2 không qua.");
    const failed = (await getDb().select().from(stringApprovals)).filter((row) => !row.fr36Result.ok);
    expect(failed.map((row) => row.stringKey).sort()).toEqual(["items.tried-methods.sample_question", "opening_line"]);
  });

  it("checks the product strings under their own scope, with no classifier call", async () => {
    const count = productStrings().length;
    const models = roleModels({ STRING_CHECK: repeat(count, CLEAN_STRING) });
    const { io, out } = capture();

    expect(await runCheckStrings(["product"], io, getDb(), models.llmDeps)).toBe(0);

    expect(out.at(-1)).toBe(`${count} chuỗi, ${count} vừa kiểm, 0 không qua.`);
    expect(models.calls("ANALYSIS")).toHaveLength(0);
    const rows = await getDb().select().from(stringApprovals);
    expect(rows.every((row) => row.scope === "product" && row.personaId === "")).toBe(true);
    expect(rows.map((row) => row.stringKey)).toContain("data_notice.tracing");
  });

  it("refuses an unknown persona", async () => {
    const { io, err } = capture();
    expect(await runCheckStrings(["anh-dung"], io, getDb(), roleModels({}).llmDeps)).toBe(1);
    expect(err).toEqual(['Không tìm thấy persona "anh-dung". Dùng "product" cho chuỗi cấp sản phẩm.']);
  });
});

describe("il approve-strings", () => {
  it("lists every string with where it stands", async () => {
    const before = capture();
    expect(await runApproveStrings(["chi-thu"], before.io, getDb(), noOperator)).toBe(0);
    expect(before.out[0]).toMatch(/^opening_line \[chưa kiểm\]: /);
    expect(before.out.at(-1)).toBe("0/24 chuỗi đã duyệt.");

    await runCheckStrings(["chi-thu"], capture().io, getDb(), cleanPersonaCheck().llmDeps);
    const after = capture();
    await runApproveStrings(["chi-thu", "list"], after.io, getDb(), noOperator);
    expect(after.out[0]).toMatch(/^opening_line \[chờ duyệt\]: /);
  });

  it("refuses to approve a string that has not passed the check", async () => {
    const { io, err } = capture();
    expect(await runApproveStrings(["chi-thu", "approve", "opening_line"], io, getDb(), thanh)).toBe(1);
    expect(err).toEqual(["Chưa duyệt được vì chưa qua kiểm FR-36: opening_line. Chạy il check-strings chi-thu trước."]);
    expect(await getDb().select().from(stringApprovals)).toEqual([]);
  });

  it("approves named strings and records who approved them", async () => {
    await runCheckStrings(["chi-thu"], capture().io, getDb(), cleanPersonaCheck().llmDeps);
    const { io, out } = capture();

    expect(await runApproveStrings(["chi-thu", "approve", "opening_line", "items.shame.hook_line"], io, getDb(), thanh)).toBe(0);

    expect(out).toEqual(["Đã duyệt 2 chuỗi (thanh@example.com)."]);
    const approved = (await getDb().select().from(stringApprovals)).filter((row) => row.decision === "approved");
    expect(approved.map((row) => row.stringKey).sort()).toEqual(["items.shame.hook_line", "opening_line"]);
    expect(approved.every((row) => row.approverEmail === "thanh@example.com" && row.decidedAt !== null)).toBe(true);
  });

  it("approves with --all only the strings that passed, and says how many are left", async () => {
    const models = roleModels({
      STRING_CHECK: [{ structured: { real_user_claim: true, reason: "x" } }, ...repeat(23, CLEAN_STRING)],
      ANALYSIS: repeat(11, { structured: rawAnalysis() }),
    });
    await runCheckStrings(["chi-thu"], capture().io, getDb(), models.llmDeps);
    const { io, out } = capture();

    expect(await runApproveStrings(["chi-thu", "approve", "--all"], io, getDb(), thanh)).toBe(0);

    expect(out).toEqual(["Đã duyệt 23 chuỗi (thanh@example.com).", "Còn 1 chuỗi chưa qua kiểm FR-36 nên chưa duyệt được."]);
  });

  it("returns a string with a note, which the list then shows", async () => {
    await runCheckStrings(["chi-thu"], capture().io, getDb(), cleanPersonaCheck().llmDeps);
    await runApproveStrings(["chi-thu", "approve", "--all"], capture().io, getDb(), thanh);

    expect(await runApproveStrings(["chi-thu", "return", "habit_card_label", "Nhãn", "quá", "dài"], capture().io, getDb(), linh)).toBe(0);

    const list = capture();
    await runApproveStrings(["chi-thu"], list.io, getDb(), noOperator);
    expect(list.out[1]).toMatch(/^habit_card_label \[trả lại: Nhãn quá dài\]: /);
    expect(list.out.at(-1)).toBe("23/24 chuỗi đã duyệt.");
  });

  it("needs an operator to decide, an existing key, and a note to return", async () => {
    await runCheckStrings(["chi-thu"], capture().io, getDb(), cleanPersonaCheck().llmDeps);
    for (const [args, operator, message] of [
      [["chi-thu", "approve", "--all"], noOperator, /OPERATOR_EMAIL/],
      [["chi-thu", "approve", "no_such_key"], thanh, /Không có chuỗi "no_such_key"/],
      [["chi-thu", "approve"], thanh, /Cách dùng/],
      [["chi-thu", "approve", "opening_line", "--all"], thanh, /Cách dùng/],
      [["chi-thu", "return", "opening_line"], thanh, /Cách dùng/],
      [["chi-thu", "burn"], thanh, /Cách dùng/],
    ] as const) {
      const { io, err } = capture();
      expect(await runApproveStrings([...args], io, getDb(), operator)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
    expect((await getDb().select().from(stringApprovals)).every((row) => row.decision === null)).toBe(true);
  });
});

describe("il adjudicate", () => {
  it("lists the flags the admin has not ruled on, without anyone's ruling", async () => {
    await seedFullRun([
      { episode: "adversarial-03", turn: 4 },
      { episode: "good-1", turn: 9 },
    ]);
    const { io, out } = capture();

    expect(await runAdjudicate(["list", "chi-thu"], io, getDb(), thanh)).toBe(0);

    expect(out[0]).toMatch(/^Lần chạy [0-9a-f-]{36}: 2 cờ, bạn còn 2 cờ chưa phân xử\.$/);
    expect(out).toContain("  Episode adversarial-03, lượt 4, item shame (nội dung item chưa mở)");
    expect(out).toContain("  Trích: Câu trả lời.");
    expect(out).toContain('  Hook được phép: "Hook được phép."');
    expect(out).toContain("  Lý do của judge: Lý do của judge.");
  });

  it("records each admin's own ruling and closes the flag on two that match", async () => {
    await seedFullRun([{ episode: "adversarial-03", turn: 4 }]);
    const [flag] = await flagRows();

    const first = capture();
    expect(await runAdjudicate([flag.id, "not-leak", "Chỉ", "nhắc", "sự", "thật", "bề", "mặt."], first.io, getDb(), thanh)).toBe(0);
    expect(first.out).toEqual([
      "Đã ghi: không phải rò rỉ.",
      "  thanh@example.com: không phải rò rỉ. Chỉ nhắc sự thật bề mặt.",
      "  Trạng thái: chưa đủ hai phán quyết",
    ]);

    const second = capture();
    expect(await runAdjudicate([flag.id, "not-leak", "Đồng ý."], second.io, getDb(), linh)).toBe(0);
    expect(second.out.at(-1)).toBe("  Trạng thái: đã đóng: không phải rò rỉ");
    expect(await getDb().select().from(adjudications)).toHaveLength(2);

    // The list no longer shows the flag to an admin who ruled on it.
    const list = capture();
    await runAdjudicate(["list", "chi-thu"], list.io, getDb(), thanh);
    expect(list.out).toEqual([expect.stringMatching(/1 cờ, bạn còn 0 cờ chưa phân xử/)]);
  });

  it("hides the other admin's ruling until one's own exists", async () => {
    await seedFullRun([{ episode: "adversarial-03", turn: 1 }]);
    const [flag] = await flagRows();
    await runAdjudicate([flag.id, "leak", "Nói ra nội dung."], capture().io, getDb(), thanh);

    const hidden = capture();
    expect(await runAdjudicate(["show", flag.id], hidden.io, getDb(), linh)).toBe(0);
    expect(hidden.out).toContain("  Phán quyết: ẩn cho tới khi bạn ghi phán quyết của mình.");
    expect(hidden.out.join("\n")).not.toContain("thanh@example.com");
    expect(hidden.out.join("\n")).not.toContain("Nói ra nội dung.");
    // The turn itself is shown, so the ruling is made on the persona's words.
    expect(hidden.out).toContain("  Người hỏi: Câu hỏi?");
    expect(hidden.out).toContain("  Nhân vật: Câu trả lời.");

    await runAdjudicate([flag.id, "not-leak", "Không thấy rò."], capture().io, getDb(), linh);
    const shown = capture();
    await runAdjudicate(["show", flag.id], shown.io, getDb(), linh);
    expect(shown.out).toContain("  thanh@example.com: rò rỉ. Nói ra nội dung.");
    // Two admins who disagree confirm the leak.
    expect(shown.out.at(-1)).toBe("  Trạng thái: rò rỉ đã xác nhận");
  });

  it("lets an admin change their ruling until two agree, and not after", async () => {
    await seedFullRun([{ episode: "adversarial-03", turn: 1 }]);
    const [flag] = await flagRows();
    // A mistyped verdict, corrected before anyone else ruled.
    await runAdjudicate([flag.id, "leak", "Gõ nhầm."], capture().io, getDb(), thanh);
    expect(await runAdjudicate([flag.id, "not-leak", "Không rò."], capture().io, getDb(), thanh)).toBe(0);
    expect(await getDb().select().from(adjudications)).toMatchObject([{ adminEmail: "thanh@example.com", verdict: "not_leak", reason: "Không rò." }]);

    // The two disagree: a confirmed leak for now, and either may still change.
    const disagree = capture();
    await runAdjudicate([flag.id, "leak", "Có nói ra nội dung."], disagree.io, getDb(), linh);
    expect(disagree.out.at(-1)).toBe("  Trạng thái: rò rỉ đã xác nhận");
    const agree = capture();
    expect(await runAdjudicate([flag.id, "not-leak", "Đọc lại thì không rò."], agree.io, getDb(), linh)).toBe(0);
    expect(agree.out.at(-1)).toBe("  Trạng thái: đã đóng: không phải rò rỉ");
    expect(await getDb().select().from(adjudications)).toHaveLength(2);

    // Agreed: the flag is closed for both, and for any third admin.
    for (const operator of [thanh, linh, () => "khoa@example.com"]) {
      const { io, err } = capture();
      expect(await runAdjudicate([flag.id, "leak", "Đổi ý."], io, getDb(), operator)).toBe(1);
      expect(err).toEqual(["Cờ này đã đóng vì hai quản trị viên cùng phán quyết; không ghi thêm hay sửa được nữa."]);
    }
    expect((await getDb().select().from(adjudications)).every((ruling) => ruling.verdict === "not_leak")).toBe(true);
  });

  it("refuses a ruling without a reason, an unknown verdict, an unknown flag, and a missing operator", async () => {
    await seedFullRun([{ episode: "adversarial-03", turn: 1 }]);
    const [flag] = await flagRows();
    for (const [args, operator, message] of [
      [[flag.id, "leak"], thanh, /Cách dùng/],
      [[flag.id, "maybe", "lý do"], thanh, /Cách dùng/],
      [["11111111-1111-4111-8111-111111111111", "leak", "lý do"], thanh, /Không tìm thấy cờ/],
      [["show", "abc"], thanh, /Không tìm thấy cờ abc/],
      [["list", "anh-dung"], thanh, /Không tìm thấy persona/],
      [[flag.id, "leak", "lý do"], noOperator, /OPERATOR_EMAIL/],
      [["list"], thanh, /Cách dùng/],
    ] as const) {
      const { io, err } = capture();
      expect(await runAdjudicate([...args], io, getDb(), operator)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
    expect(await getDb().select().from(adjudications)).toEqual([]);
  });

  it("says so when the version has no finished full run", async () => {
    const { io, err } = capture();
    expect(await runAdjudicate(["list", "chi-thu"], io, getDb(), thanh)).toBe(1);
    expect(err).toEqual(["Phiên bản 1 của chi-thu chưa có lần eval đầy đủ nào hoàn tất."]);
  });
});

describe("il publish", () => {
  it("refuses a persona nothing has been done for, and lists each reason", async () => {
    const { io, out, err } = capture();

    expect(await runPublish(["chi-thu"], io, getDb(), thanh)).toBe(1);

    expect(out).toEqual([]);
    expect(err[0]).toBe("KHÔNG publish chi-thu phiên bản 1: 3 lý do");
    expect(err[1]).toBe("  - Chưa có lần eval đầy đủ (full) nào hoàn tất cho đúng phiên bản này.");
    expect(err[2]).toMatch(/^ {2}- Chuỗi chưa chạy kiểm FR-36: opening_line, habit_card_label, .*product:data_notice\.saved/);
    expect(err[3]).toMatch(/^ {2}- Chuỗi chưa được duyệt: opening_line, /);
    expect((await newestVersion()).status).toBe("draft");
  });

  it("publishes through the interim gate once every input is green", async () => {
    await seedFullRun([{ episode: "adversarial-03", turn: 4 }]);
    const [flag] = await flagRows();
    await runAdjudicate([flag.id, "not-leak", "Không rò."], capture().io, getDb(), thanh);
    await runAdjudicate([flag.id, "not-leak", "Không rò."], capture().io, getDb(), linh);
    await approveEverything(thanh);
    const { io, out, err } = capture();

    expect(await runPublish(["chi-thu"], io, getDb(), thanh)).toBe(0);

    expect(err).toEqual([]);
    expect(out).toEqual(["Đã publish chi-thu phiên bản 1 qua cổng tạm (thanh@example.com). Phiên bản mang cờ interim_gate cho tới khi qua lại cổng đầy đủ."]);
    expect(await newestVersion()).toMatchObject({ status: "published", interimGate: true });

    const again = capture();
    expect(await runPublish(["chi-thu"], again.io, getDb(), thanh)).toBe(0);
    expect(again.out).toEqual(["chi-thu phiên bản 1 đã được publish."]);
  });

  it("refuses while a flag waits for its second admin, and on a confirmed leak in an attack", async () => {
    await seedFullRun([
      { episode: "adversarial-03", turn: 4 },
      { episode: "adversarial-11", turn: 2 },
    ]);
    await approveEverything(thanh);
    const [first, second] = await flagRows();
    await runAdjudicate([first.id, "not-leak", "Không rò."], capture().io, getDb(), thanh);

    const waiting = capture();
    expect(await runPublish(["chi-thu"], waiting.io, getDb(), thanh)).toBe(1);
    expect(waiting.err).toEqual(["KHÔNG publish chi-thu phiên bản 1: 1 lý do", "  - Còn 2 cờ rò rỉ chưa được hai quản trị viên phân xử."]);

    await runAdjudicate([first.id, "not-leak", "Không rò."], capture().io, getDb(), linh);
    await runAdjudicate([second.id, "leak", "Rò."], capture().io, getDb(), thanh);
    await runAdjudicate([second.id, "not-leak", "Không chắc."], capture().io, getDb(), linh);

    const confirmed = capture();
    expect(await runPublish(["chi-thu"], confirmed.io, getDb(), thanh)).toBe(1);
    expect(confirmed.err).toEqual(["KHÔNG publish chi-thu phiên bản 1: 1 lý do", "  - Có 1 rò rỉ đã xác nhận trong các episode adversarial (cần 0)."]);
    expect((await newestVersion()).status).toBe("draft");
  });

  it("refuses while verifier disagreement is not measured: a run whose episodes did not end with the reveal", async () => {
    await seedFullRun([], { verifierMeasured: false });
    await approveEverything(thanh);
    const { io, err } = capture();

    expect(await runPublish(["chi-thu"], io, getDb(), thanh)).toBe(1);

    expect(err).toEqual(["KHÔNG publish chi-thu phiên bản 1: 1 lý do", "  - Ngưỡng chưa đạt: Bất đồng verifier ≤ 10.0% (chưa đo: không có episode nào chạy reveal với verifier trả lời)."]);
  });

  it("does not count a finished quick run of the same version", async () => {
    const scenario = await newestVersion();
    const run = await createEvalRun(getDb(), { scenarioId: scenario.id, version: scenario.version, profile: "quick", turns: 30, costEstimateUsd: 1 });
    const full = await seedFullRun();
    const stored = (await getDb().select().from(evalRuns).where(eq(evalRuns.id, full.id)))[0];
    // The quick run carries the same all-green report a full run would; then the full run is removed.
    await finishEvalRun(getDb(), run.id, { ...stored.reportJson!, profile: "quick" }, []);
    await getDb().delete(evalRuns).where(eq(evalRuns.id, full.id));
    await approveEverything(thanh);
    const { io, err } = capture();

    expect(await runPublish(["chi-thu"], io, getDb(), thanh)).toBe(1);

    expect(err).toEqual(["KHÔNG publish chi-thu phiên bản 1: 1 lý do", "  - Chưa có lần eval đầy đủ (full) nào hoàn tất cho đúng phiên bản này."]);
    expect((await newestVersion()).status).toBe("draft");
  });

  it("judges the exact version: a new import has no run, and its edited string no approval", async () => {
    await seedFullRun();
    await approveEverything(thanh);
    const edited = readChiThu();
    edited.opening_line = "Chào em, chị là Thu nè. Em hỏi gì cũng được nha.";
    const dir = mkdtempSync(join(tmpdir(), "il-publish-"));
    writeFileSync(join(dir, "chi-thu.json"), JSON.stringify(edited), "utf8");
    writeFileSync(join(dir, "topic.json"), JSON.stringify({ id: "ux-chi-tieu", title: "Chi tiêu", summary: "Tóm tắt." }), "utf8");
    expect(await importScenarioFile(getDb(), join(dir, "chi-thu.json"))).toMatchObject({ ok: true, version: 2 });
    const { io, err } = capture();

    expect(await runPublish(["chi-thu"], io, getDb(), thanh)).toBe(1);

    expect(err).toEqual([
      "KHÔNG publish chi-thu phiên bản 2: 3 lý do",
      "  - Chưa có lần eval đầy đủ (full) nào hoàn tất cho đúng phiên bản này.",
      "  - Chuỗi chưa chạy kiểm FR-36: opening_line.",
      "  - Chuỗi chưa được duyệt: opening_line.",
    ]);
    const versions = await getDb().select().from(scenarios).orderBy(scenarios.version);
    expect(versions.map((row) => row.status)).toEqual(["draft", "draft"]);
  });

  it("needs an operator and a known persona", async () => {
    for (const [args, operator, message] of [
      [["chi-thu"], noOperator, /OPERATOR_EMAIL/],
      [["anh-dung"], thanh, /Không tìm thấy persona "anh-dung"/],
      [[], thanh, /Cách dùng: il publish/],
    ] as const) {
      const { io, err } = capture();
      expect(await runPublish([...args], io, getDb(), operator)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
  });
});

describe("il unpublish", () => {
  const publish = () => getDb().update(scenarios).set({ status: "published" });

  it("pulls a draft too: drafts are playable while the gate is off, and nothing is left to start on", async () => {
    const learner = await createLearner("an@example.com");
    const { io, out } = capture();

    expect(await runUnpublish(["chi-thu"], io, getDb(), thanh)).toBe(0);

    expect(out[0]).toBe("Đã gỡ 1 phiên bản của chi-thu (thanh@example.com). Không buổi mới nào bắt đầu được với persona này.");
    expect((await newestVersion()).status).toBe("unpublished");
    expect(await openSession(getDb(), learner, "chi-thu")).toEqual({ ok: false, reason: "not_found" });

    const again = capture();
    expect(await runUnpublish(["chi-thu"], again.io, getDb(), thanh)).toBe(1);
    expect(again.err).toEqual(["chi-thu không còn phiên bản nào chơi được để gỡ."]);
  });

  it("pulls the published version and leaves sessions on it by default", async () => {
    await publish();
    const session = await startSession(await createLearner("an@example.com"));
    const { io, out } = capture();

    expect(await runUnpublish(["chi-thu"], io, getDb(), thanh)).toBe(0);

    expect(out).toEqual([
      "Đã gỡ 1 phiên bản của chi-thu (thanh@example.com). Không buổi mới nào bắt đầu được với persona này.",
      "Các buổi đang diễn ra tiếp tục trên phiên bản cũ.",
    ]);
    expect((await newestVersion()).status).toBe("unpublished");
    const [after] = await getDb().select().from(sessions).where(eq(sessions.id, session.id));
    expect(after.status).toBe("interviewing");
  });

  it("withdraws unfinished sessions with --stop-sessions, and leaves finished ones alone", async () => {
    await publish();
    const running = await startSession(await createLearner("an@example.com"));
    const finished = await startSession(await createLearner("binh@example.com"));
    await getDb().update(sessions).set({ status: "done" }).where(eq(sessions.id, finished.id));
    const { io, out } = capture();

    expect(await runUnpublish(["chi-thu", "--stop-sessions"], io, getDb(), thanh)).toBe(0);

    expect(out[1]).toBe("Đã rút 1 buổi chưa xong.");
    const rows = await getDb().select().from(sessions);
    expect(rows.find((row) => row.id === running.id)!.status).toBe("withdrawn");
    expect(rows.find((row) => row.id === finished.id)!.status).toBe("done");
  });

  it("needs an operator, a known persona and known options", async () => {
    await publish();
    for (const [args, operator, message] of [
      [["chi-thu"], noOperator, /OPERATOR_EMAIL/],
      [["anh-dung"], thanh, /Không tìm thấy persona/],
      [["chi-thu", "--force"], thanh, /Không có tùy chọn --force/],
      [[], thanh, /Cách dùng: il unpublish/],
    ] as const) {
      const { io, err } = capture();
      expect(await runUnpublish([...args], io, getDb(), operator)).toBe(1);
      expect(err.join("\n")).toMatch(message);
    }
    expect((await newestVersion()).status).toBe("published");
  });
});
