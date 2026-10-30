import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

export const VOICE_VERDICTS = ["plain", "ai_voice"] as const;
export type VoiceVerdict = (typeof VOICE_VERDICTS)[number];

/** What a text is, as the judge is told: the same text reads differently as speech and as a description. */
export const VOICE_TEXT_KINDS = { speech: "lời nhân vật nói ra", identity: "đoạn mô tả nhân vật là ai" } as const;
export type VoiceTextKind = keyof typeof VOICE_TEXT_KINDS;

export const voiceJudgeSchema = z.object({ voice: z.enum(VOICE_VERDICTS), reason: z.string() });

// The examples are about a broken washing machine on purpose, and the signs are described, not
// quoted: no phrase of the rules may resemble a case of the set or the generator's reference pair,
// so a passing run does not mean the judge matched a phrase it was shown.
const RULES = [
  "Bạn đọc một đoạn văn tiếng Việt của một sản phẩm luyện phỏng vấn người dùng và cho biết nó nghe như người thật nói hay viết, hay như văn do AI viết. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
  "voice = \"ai_voice\" khi đoạn văn có một trong các dấu hiệu: gọi tên cảm xúc hay tính cách chung chung mà không kèm việc gì đã xảy ra; xếp nhiều tính từ khen chê liền nhau; từ sách vở, giọng bài viết hay khẩu hiệu không ai nói ngoài đời; kể xong một việc rồi kết bằng bài học, lời khuyên chung hay câu tóm tắt; câu dài nối nhiều vế cho trang trọng. Ví dụ: \"Với chị, mỗi lần sửa máy giặt là một dịp để trân trọng hơn những tiện nghi của gia đình.\".",
  "voice = \"plain\" khi đoạn văn kể việc cụ thể hay nêu sự thật bằng từ đời thường, câu ngắn như người thật nói, kể cả khi có từ đệm, câu cụt hay bỏ chủ ngữ. Một cảm xúc gắn với một việc cụ thể (sợ ai đó nghĩ gì, ngại làm gì) vẫn là plain. Ví dụ: \"Máy giặt kêu cạch cạch hai tuần chị mới gọi thợ, ổng lấy 400 nghìn.\".",
  "Với đoạn mô tả nhân vật, vài nét tính cách ngắn sau phần sự thật là bình thường; chỉ tính là ai_voice khi mô tả chủ yếu là tính từ chung chung, khẩu hiệu hay lời ca ngợi, kể cả khi chỉ câu cuối như vậy.",
  "Không chấm nội dung đúng sai hay hay dở, chỉ chấm giọng. reason: một câu ngắn bằng tiếng Việt chỉ ra chỗ quyết định.",
].join("\n");

/** The voice judge (eval only): reads one text, never writes one. Nothing at runtime calls it. */
export function buildVoiceJudgeMessages(input: { kind: VoiceTextKind; text: string }): BaseMessage[] {
  return [
    new SystemMessage([RULES, DATA_BLOCK_RULE].join("\n\n")),
    new HumanMessage([`Đoạn văn này là: ${VOICE_TEXT_KINDS[input.kind]}.`, dataBlock("doan_van", input.text)].join("\n")),
  ];
}
