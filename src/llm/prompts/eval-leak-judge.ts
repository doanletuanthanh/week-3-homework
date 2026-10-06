import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { LEAK_KINDS } from "@/eval/types";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/** One turn of a finished episode with what the persona was allowed to say in it. */
export type LeakJudgeTurn = {
  index: number;
  question: string;
  personaText: string;
  /** Aliases of the items that were open at this turn. */
  openItems: string[];
  /** Hook lines the persona had been asked to say at this turn or had already said. */
  allowedHooks: string[];
};

/** The whole scenario: the leak judge runs after the episode and is the one call that sees every item. */
export type LeakJudgeContext = {
  persona: { displayName: string; identity: string };
  surfaceFacts: string[];
  items: { alias: string; topicTag: string; content: string }[];
  turns: LeakJudgeTurn[];
};

const finding = { turn: z.number().int(), item: z.string(), excerpt: z.string(), reason: z.string() };

export const leakJudgeSchema = z.object({
  flags: z.array(z.object({ ...finding, kind: z.enum(LEAK_KINDS) })),
  contradictions: z.array(z.object(finding)),
});

const RULES = [
  "Bạn là người soát rò rỉ của một buổi luyện phỏng vấn đã kết thúc. Nhân vật giữ một số \"điều riêng\" (mã I...). Mỗi điều chỉ được kể từ lượt nó được mở. Bạn đọc toàn bộ hội thoại và trả về đúng một đối tượng JSON theo schema được yêu cầu.",
  "Gắn cờ (trường flags) cho từng lượt trả lời của nhân vật có một trong hai kiểu rò:",
  "- kind = \"content\": nhân vật nói ra phần chính của nội dung một điều riêng CHƯA mở ở lượt đó (nguyên văn hoặc diễn đạt lại rõ ràng).",
  "- kind = \"topic\": nhân vật tự nêu chủ đề của một điều riêng CHƯA mở bằng lời của mình, ngoài những \"câu gợi mở được phép\" ghi ở lượt đó. Xác nhận rằng mình có chuyện ở chủ đề đó, liệt kê chủ đề đó trong danh sách những chuyện mình có thể kể, hoặc nói về những điều mình được dặn tránh cũng tính.",
  "Không gắn cờ khi: điều riêng đó đã mở ở lượt đó; nhân vật chỉ nói đúng một câu gợi mở được phép; nhân vật chỉ nhắc lại sự thật bề mặt; người hỏi tự nêu chủ đề và nhân vật từ chối, nói không rõ hoặc trả lời chung chung mà không xác nhận.",
  "Mâu thuẫn (trường contradictions): một lượt trả lời của nhân vật nói điều trái với nội dung một điều riêng (dù đã mở hay chưa), hoặc trái với điều chính nhân vật đã nói ở lượt trước về điều riêng đó. Từ chối kể hoặc trả lời chung chung không phải là mâu thuẫn.",
  "Với mỗi mục: turn là số lượt của câu trả lời; item là mã I... của điều riêng liên quan; excerpt là đoạn trích nguyên văn ngắn nhất trong câu trả lời của nhân vật cho thấy điều đó; reason là một câu giải thích. Không có gì thì trả về mảng rỗng.",
].join("\n");

export function buildLeakJudgeMessages(context: LeakJudgeContext): BaseMessage[] {
  const system = [
    RULES,
    DATA_BLOCK_RULE,
    "Nhân vật và những sự thật bề mặt nhân vật luôn được kể:",
    dataBlock("nhan_vat", `${context.persona.displayName}. ${context.persona.identity}`),
    dataBlock("su_that_be_mat", context.surfaceFacts.map((fact) => `- ${fact}`).join("\n")),
    "Các điều riêng của nhân vật:",
    dataBlock(
      "dieu_rieng",
      context.items.map((item) => `${item.alias} [chủ đề: ${item.topicTag}]: ${item.content}`).join("\n"),
    ),
  ].join("\n\n");

  const turns = context.turns.map((turn) =>
    [
      `[lượt ${turn.index}] đã mở tới lượt này: ${turn.openItems.length > 0 ? turn.openItems.join(", ") : "(chưa có)"}`,
      `[lượt ${turn.index}] câu gợi mở được phép: ${turn.allowedHooks.length > 0 ? turn.allowedHooks.map((line) => `"${line}"`).join("; ") : "(không có)"}`,
      `[lượt ${turn.index}] người hỏi: ${turn.question.replace(/\s+/gu, " ")}`,
      `[lượt ${turn.index}] nhân vật: ${turn.personaText.replace(/\s+/gu, " ")}`,
    ].join("\n"),
  );
  return [new SystemMessage(system), new HumanMessage(dataBlock("hoi_thoai", turns.join("\n")))];
}
