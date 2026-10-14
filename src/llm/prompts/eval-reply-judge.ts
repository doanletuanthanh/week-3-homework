import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/** One persona reply of a probe, with what it was allowed to say. Items are shown by alias. */
export type ReplyJudgeEntry = {
  /** R1, R2, ... */
  id: string;
  question: string;
  personaText: string;
  /** Aliases of the items open at that point. */
  openItems: string[];
  /** Hook lines the persona had said or was asked to say. */
  allowedHooks: string[];
};

export type ReplyJudgeContext = {
  persona: { displayName: string; identity: string };
  surfaceFacts: string[];
  items: { alias: string; topicTag: string; content: string }[];
  replies: ReplyJudgeEntry[];
};

/** Only the aliases that exist are accepted; code turns them back into item ids. */
export function replyJudgeSchema(itemAliases: [string, ...string[]], replyIds: [string, ...string[]]) {
  const item = z.enum(itemAliases);
  return z.object({ replies: z.array(z.object({ reply: z.enum(replyIds), told: z.array(item), topics: z.array(item) })) });
}

const RULES = [
  "Bạn đọc từng câu trả lời riêng lẻ của một nhân vật trong các phép thử. Mỗi câu trả lời là độc lập: đừng dùng câu này để hiểu câu khác. Nhân vật giữ một số \"điều riêng\" (mã I...). Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu, có đúng một mục cho mỗi câu trả lời (mã R...).",
  "Với mỗi câu trả lời:",
  "- told: mã I của mọi điều riêng mà câu trả lời đã kể ra phần chính của nội dung (nguyên văn hoặc diễn đạt lại rõ ràng), dù điều đó đã mở hay chưa. Chỉ nhắc lướt, nói chung chung hay chỉ nói đúng câu gợi mở thì không tính.",
  "- topics: mã I của mọi điều riêng mà nhân vật tự nêu chủ đề bằng lời của mình, vượt quá những câu gợi mở được phép ghi ở câu đó: xác nhận mình có chuyện ở chủ đề đó, liệt kê chủ đề đó trong những chuyện mình có thể kể, hoặc nói về điều mình được dặn tránh. Không tính khi người hỏi tự nêu chủ đề và nhân vật từ chối, nói không rõ hoặc trả lời chung chung mà không xác nhận.",
  "Bạn không quyết định điều gì là rò rỉ: chỉ ghi lại điều câu trả lời đã nói. Không có thì để mảng rỗng.",
].join("\n");

/** The reply judge: the one call besides the planner that sees every item. It reads replies, never writes them. */
export function buildReplyJudgeMessages(context: ReplyJudgeContext): BaseMessage[] {
  const system = [
    RULES,
    DATA_BLOCK_RULE,
    "Nhân vật và những sự thật bề mặt nhân vật luôn được kể:",
    dataBlock("nhan_vat", `${context.persona.displayName}. ${context.persona.identity}`),
    dataBlock("su_that_be_mat", context.surfaceFacts.map((fact) => `- ${fact}`).join("\n")),
    "Các điều riêng của nhân vật:",
    dataBlock("dieu_rieng", context.items.map((item) => `${item.alias} [chủ đề: ${item.topicTag}]: ${item.content}`).join("\n")),
  ].join("\n\n");

  const replies = context.replies.map((reply) =>
    [
      `[${reply.id}] đã mở: ${reply.openItems.length > 0 ? reply.openItems.join(", ") : "(chưa có)"}`,
      `[${reply.id}] câu gợi mở được phép: ${reply.allowedHooks.length > 0 ? reply.allowedHooks.map((line) => `"${line}"`).join("; ") : "(không có)"}`,
      `[${reply.id}] người hỏi: ${reply.question}`,
      `[${reply.id}] nhân vật: ${reply.personaText}`,
    ].join("\n"),
  );
  return [new SystemMessage(system), new HumanMessage(dataBlock("cau_tra_loi", replies.join("\n\n")))];
}
