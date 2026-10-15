import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";
import { LABEL_DEFINITION } from "./analysis";

/** What a question of a guide is, in the order the checker prefers when several apply. */
export const GUIDE_LABELS = ["leading", "compound", "hypothetical_future", "closed", "open"] as const;
export type GuideLabel = (typeof GUIDE_LABELS)[number];

/**
 * A model may split a line into two questions, so a reply can hold more than the guide's lines.
 * A longer reply is cut to this in code: a schema limit would turn it into a failed, retried and
 * billed call.
 */
export const MAX_GUIDE_REPLY_QUESTIONS = 40;

export const guideCheckSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string(),
        label: z.enum(GUIDE_LABELS),
        hint: z.string(),
      }),
    ),
});
export type GuideCheck = z.infer<typeof guideCheckSchema>;

// In a guide nobody has answered yet, so the definitions that need an earlier answer do not apply:
// only `open` and `leading` are taken from Call 1, word for word.
const RULES = [
  "Bạn kiểm tra bộ câu hỏi mà một lập trình viên định dùng để phỏng vấn người dùng thật trước khi làm app. Bạn không trả lời các câu hỏi. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
  "Tách <bo_cau_hoi> thành từng câu hỏi theo đúng thứ tự (trường questions). Một dòng có thể chứa một câu, một câu có thể kéo dài qua nhiều dòng; bỏ qua dòng không phải câu hỏi (tiêu đề, ghi chú). Mỗi câu hỏi: text là câu hỏi như người viết đã viết, label là nhãn, hint là gợi ý sửa.",
  "Nhãn (trường label), chọn đúng một; khi nhiều nhãn cùng đúng thì chọn nhãn đứng trước trong danh sách này. Trong các định nghĩa lấy từ buổi luyện, \"nhân vật\" là người được phỏng vấn:",
  LABEL_DEFINITION.leading,
  "- compound: một câu hỏi gộp hai câu hỏi trở lên mà người được hỏi phải trả lời cùng lúc. Ví dụ: \"Anh đi làm bằng gì và mất bao lâu?\". Hai câu hỏi tách rời nằm chung một dòng thì là hai câu hỏi riêng, không phải compound.",
  "- hypothetical_future: hỏi về điều người được hỏi sẽ làm, sẽ dùng, sẽ trả tiền, hoặc nếu... thì..., thay vì điều họ đã làm. Ví dụ: \"Nếu giá vé tăng gấp đôi thì anh sẽ đi làm bằng gì?\". Câu hỏi đưa ra một giải pháp (như một app) rồi hỏi người được hỏi có dùng hay có thích không thì là leading.",
  "- closed: chỉ trả lời có/không hoặc chọn một, và không thuộc các nhãn trên. Ví dụ: \"Anh có đi xe buýt không?\".",
  LABEL_DEFINITION.open,
  "hint: một câu ngắn bằng tiếng Việt, tối đa 25 từ. Với open thì hint là chuỗi rỗng. Với các nhãn khác, chỉ ra vì sao và đề xuất cách hỏi lại hướng về một lần cụ thể đã xảy ra, không cài sẵn câu trả lời.",
  "<y_tuong_app> (nếu có) chỉ để hiểu bối cảnh; câu hỏi nhắc tới ý tưởng app không vì thế mà thành leading, trừ khi nó mời người được hỏi đồng ý với ý tưởng hay giải pháp đó.",
].join("\n");

/** One call per guide. The guide and the idea are the learner's own words, so both sit in data blocks. */
export function buildGuideCheckMessages(input: { guide: string; idea: string | null }): BaseMessage[] {
  return [
    new SystemMessage([RULES, DATA_BLOCK_RULE].join("\n\n")),
    new HumanMessage(
      [
        "Ý tưởng app:",
        dataBlock("y_tuong_app", input.idea ?? "(không có)"),
        "Bộ câu hỏi cần kiểm tra:",
        dataBlock("bo_cau_hoi", input.guide),
      ].join("\n"),
    ),
  ];
}
