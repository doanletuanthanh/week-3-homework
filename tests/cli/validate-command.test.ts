import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runValidate } from "../../cli/commands/validate";
import { CHI_THU_FILE, readChiThu } from "../helpers/sealed-strings";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

function tempFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "il-validate-")), "scenario.json");
  writeFileSync(path, content, "utf8");
  return path;
}

const noOtherPersonas = async () => [];

describe("il validate", () => {
  it("exits 0 for the chị Thu file and prints what it checked", async () => {
    const { io, out, err } = capture();

    expect(await runValidate([CHI_THU_FILE], io, noOtherPersonas)).toBe(0);
    expect(out).toEqual([`OK ${CHI_THU_FILE}: chi-thu, 11 item, 16 fact bề mặt.`]);
    expect(err).toEqual([]);
  });

  it("exits 1 and prints every violation with its path, code and message", async () => {
    const scenario = readChiThu();
    scenario.research_goal = "Chi tiêu của người trẻ.";
    scenario.items[1].hook_line = "Chị quên gia hạn hoài.";
    const file = tempFile(JSON.stringify(scenario));
    const { io, out, err } = capture();

    expect(await runValidate([file], io, noOtherPersonas)).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([
      `LỖI ${file}: 2 vi phạm`,
      "  research_goal  [research_goal_not_question]  Câu hỏi nghiên cứu phải là một câu hỏi, kết thúc bằng dấu chấm hỏi.",
      '  items[1].hook_line  [secret_term_leak]  Chứa cụm "gia hạn" mang nội dung của item paid-app.',
    ]);
  });

  it("asks the database for the tags of other personas of the same topic and reports a clash", async () => {
    const asked: string[][] = [];
    const { io, err } = capture();

    const code = await runValidate([CHI_THU_FILE], io, async (topicId, personaId) => {
      asked.push([topicId, personaId]);
      return [{ personaId: "anh-dung", topicTags: ["tiền gửi về nhà"] }];
    });

    expect(code).toBe(1);
    expect(asked).toEqual([["ux-chi-tieu", "chi-thu"]]);
    expect(err[1]).toContain("[topic_tag_taken]");
  });

  it("still checks the file without a database, and says the cross-persona rule was skipped", async () => {
    const { io, out } = capture();

    expect(await runValidate([CHI_THU_FILE], io)).toBe(0);
    expect(out[0]).toContain("bỏ qua kiểm tra trùng topic tag");
    expect(out[1]).toContain("OK");
  });

  it("still checks the file when the database cannot be reached", async () => {
    const { io, out } = capture();

    const code = await runValidate([CHI_THU_FILE], io, async () => {
      throw new Error("connection refused");
    });

    expect(code).toBe(0);
    expect(out[0]).toContain("Không kết nối được cơ sở dữ liệu");
  });

  it("exits 1 without a file argument", async () => {
    const { io, err } = capture();
    expect(await runValidate([], io, noOtherPersonas)).toBe(1);
    expect(err[0]).toContain("Thiếu đường dẫn file");
  });

  it("exits 1 for a file that does not exist", async () => {
    const { io, err } = capture();
    expect(await runValidate(["scenarios/khong-co.json"], io, noOtherPersonas)).toBe(1);
    expect(err).toEqual(['Không đọc được file "scenarios/khong-co.json".']);
  });

  it("exits 1 for a file that is not JSON", async () => {
    const file = tempFile("{ persona_id: chi-thu");
    const { io, err } = capture();

    expect(await runValidate([file], io, noOtherPersonas)).toBe(1);
    expect(err[0]).toContain("không phải JSON hợp lệ");
  });

  it("exits 1 for JSON that is not an object, without asking the database", async () => {
    const file = tempFile("null");
    let asked = false;
    const { io, err } = capture();

    const code = await runValidate([file], io, async () => {
      asked = true;
      return [];
    });

    expect(code).toBe(1);
    expect(asked).toBe(false);
    expect(err[1]).toContain("[schema]");
  });
});
