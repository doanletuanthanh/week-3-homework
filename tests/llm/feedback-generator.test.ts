import { describe, expect, it } from "vitest";
import { commentSlots } from "@/engine/reveal-compute";
import { buildFeedbackContext } from "@/engine/reveal-contexts";
import { COMMENT_WORDS, FEEDBACK_VOICE_REFERENCE, PRAISE_WORDS, QUESTION_WORDS, QUOTE_WORDS, buildFeedbackMessages } from "@/llm/prompts/feedback-generator";
import { PLAIN_VOICE_LINES } from "@/llm/prompts/plain-voice";
import { tokenize } from "@/scenario/text-normalize";
import { curatedPersonas } from "../helpers/curated-scenarios";
import { NOTES, basisOf, judgedNotes, playedSession, selectionOf } from "../helpers/reveal-fixtures";

const basis = basisOf(playedSession(), NOTES);
const selection = selectionOf(basis);
const context = buildFeedbackContext(basis, selection, commentSlots(basis, selection, judgedNotes().matches));
const [system, human] = buildFeedbackMessages(context).map((message) => message.text);

describe("buildFeedbackMessages: short comments in the plain voice", () => {
  it("keeps the first line the e2e stub picks the generator by", () => {
    expect(system.startsWith("Bạn là người viết nhận xét cho một buổi luyện phỏng vấn người dùng đã kết thúc.")).toBe(true);
  });

  it("asks for one sentence under the word caps, a short quote and a short better question", () => {
    expect(system).toContain("text: đúng một câu, hai vế: vế đầu nêu điều đã xảy ra ở lượt được trích");
    for (const cap of [PRAISE_WORDS, COMMENT_WORDS, QUOTE_WORDS, QUESTION_WORDS]) expect(system).toContain(`không quá ${cap} chữ`);
  });

  it("carries the shared voice lines, the leading rule and the reference pair, and bans no list of words", () => {
    for (const line of PLAIN_VOICE_LINES) expect(system).toContain(`${line}\n`);
    expect(system).toContain("text không giải thích lại thế nào là dẫn dắt: vế đầu nêu câu hỏi ở lượt đó hỏi về chuyện gì");
    expect(system).toContain(FEEDBACK_VOICE_REFERENCE);
    expect(system).not.toContain("Không dùng chữ");
  });

  it("keeps the sealed-item sentence when a replay target is held", () => {
    expect(selection.level).toBe("primary");
    expect(system).toMatch(/Điều I\d+ đang niêm phong: không viết gì về nó/u);
  });

  it("gives the generator nothing of an untold item: no content, no secret term, no list of them", () => {
    const told = new Set(basis.state.disclosed.map((entry) => entry.itemId));
    const untold = basis.scenario.items.filter((entry) => !told.has(entry.id));
    expect(untold.length).toBeGreaterThan(0);
    for (const item of untold) {
      expect(human, item.id).not.toContain(item.content);
      for (const term of item.secret_terms) expect(human, term).not.toContain(term);
    }
    expect([system, human].join("\n")).not.toContain("dieu_bo_lo");
  });

  it("gives a reference pair that shares no four-word run with a library scenario", () => {
    const runs = (text: string) => {
      const words = tokenize(text);
      return words.slice(0, -3).map((_, start) => words.slice(start, start + 4).join(" "));
    };
    const library = new Set(curatedPersonas().flatMap(({ scenario }) => scenario.items.flatMap((item) => [item.content, item.hook_line, item.sample_question]).flatMap(runs)));
    expect(runs(FEEDBACK_VOICE_REFERENCE).filter((run) => library.has(run))).toEqual([]);
  });
});
