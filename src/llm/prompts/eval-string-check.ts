import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

export const stringCheckSchema = z.object({ real_user_claim: z.boolean(), reason: z.string() });

// The examples are about commuting on purpose: they must not resemble any scenario.
const RULES = [
  "Bạn kiểm một chuỗi cố định của một sản phẩm luyện phỏng vấn người dùng. Sản phẩm dùng nhân vật hư cấu; không chuỗi nào được khẳng định điều gì về người dùng thật. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
  "real_user_claim = true khi chuỗi nêu như một sự thật một điều về người dùng thật, khách hàng thật hay con người ngoài đời nói chung: số liệu, hành vi, nhu cầu, ý kiến, hoặc kết quả nghiên cứu. Ví dụ: \"Đa số người đi làm ghét chờ xe buýt.\", \"Nghiên cứu cho thấy người dùng bỏ ứng dụng sau hai tuần.\".",
  "real_user_claim = false khi chuỗi là: lời một nhân vật hư cấu nói về chính mình (\"Có dạo anh định đi xe buýt nhưng rồi thôi.\"); một câu hỏi; một nhãn mô tả cách hỏi của người học; hoặc lời sản phẩm nói về chính sản phẩm và cách nó xử lý dữ liệu.",
  "reason: một câu giải thích ngắn bằng tiếng Việt.",
].join("\n");

export function buildStringCheckMessages(input: { origin: string; text: string }): BaseMessage[] {
  return [
    new SystemMessage([RULES, DATA_BLOCK_RULE].join("\n\n")),
    new HumanMessage([`Chuỗi này là: ${input.origin}.`, dataBlock("chuoi", input.text)].join("\n")),
  ];
}
