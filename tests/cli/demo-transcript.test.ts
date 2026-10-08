import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_TURNS } from "@/config/limits";
import { demoTranscriptPath, loadDemoTranscript } from "../../cli/commands/seed-demo";
import { CliError } from "../../cli/scenario-file";
import { chiThu } from "../helpers/engine-fixtures";

async function fileWith(content: unknown): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "il-demo-")), "transcript.json");
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

const valid = { persona_id: "chi-thu", questions: ["Chị kể em nghe được không ạ?"], canvas_text: "ghi chú" };

describe("the prepared demo transcript of chị Thu", () => {
  it("is a valid transcript for the persona it is filed under", async () => {
    const transcript = await loadDemoTranscript(demoTranscriptPath("chi-thu"), "chi-thu");

    expect(transcript.persona_id).toBe(chiThu.persona_id);
    expect(transcript.questions.length).toBeGreaterThanOrEqual(6);
    expect(transcript.questions.length).toBeLessThanOrEqual(MAX_TURNS);
    // The demo shows the notes being matched, so it has some.
    expect(transcript.canvas_text.trim()).not.toBe("");
  });

  it("takes none of its questions or notes from what the persona holds", async () => {
    const transcript = await loadDemoTranscript(demoTranscriptPath("chi-thu"), "chi-thu");
    const written = [...transcript.questions, transcript.canvas_text].join("\n");
    for (const item of chiThu.items) expect(written).not.toContain(item.content);
  });
});

describe("loadDemoTranscript", () => {
  it("accepts a transcript of the asked persona", async () => {
    expect(await loadDemoTranscript(await fileWith(valid), "chi-thu")).toEqual(valid);
  });

  it("refuses a transcript written for another persona", async () => {
    await expect(loadDemoTranscript(await fileWith(valid), "anh-khoa")).rejects.toThrow(/là của persona "chi-thu", không phải "anh-khoa"/u);
  });

  it.each([
    ["no question", { ...valid, questions: [] }],
    ["an empty question", { ...valid, questions: ["   "] }],
    ["a question longer than the composer allows", { ...valid, questions: ["a".repeat(501)] }],
    ["more questions than a session has turns", { ...valid, questions: Array.from({ length: MAX_TURNS + 1 }, () => "Câu hỏi?") }],
    ["notes longer than the canvas allows", { ...valid, canvas_text: "a".repeat(5001) }],
    ["no notes field", { persona_id: "chi-thu", questions: ["Câu hỏi?"] }],
  ])("refuses %s, as a message for the operator", async (_name, content) => {
    await expect(loadDemoTranscript(await fileWith(content), "chi-thu")).rejects.toBeInstanceOf(CliError);
  });

  it("refuses a missing file and broken JSON, as a message for the operator", async () => {
    await expect(loadDemoTranscript("evalsets/demo/khong-co.json", "chi-thu")).rejects.toBeInstanceOf(CliError);
    await expect(loadDemoTranscript(await fileWith("{ not json"), "chi-thu")).rejects.toBeInstanceOf(CliError);
  });
});
