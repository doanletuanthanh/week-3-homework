import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { FeedbackContext, FeedbackSlot } from "@/engine/reveal-contexts";
import { tokenize } from "@/engine/tokens";
import { renderTranscript } from "./analysis";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";
import { PLAIN_VOICE_LINES } from "./plain-voice";

/** Word caps of a comment, of a quote inside it, and of a better question. */
export const PRAISE_WORDS = 25;
export const COMMENT_WORDS = 20;
export const QUOTE_WORDS = 8;
export const QUESTION_WORDS = 15;

const RULES = [
  "Code đã chọn sẵn các nhận xét cần viết trong <nhan_xet_can_viet>; mỗi dòng là một ô có mã (S...). Viết đúng một claim cho mỗi ô, không thêm ô nào khác:",
  "- slot: mã của ô.",
  `- text: đúng một câu, hai vế: vế đầu nêu điều đã xảy ra ở lượt được trích, theo đúng lời trong <hoi_thoai>; vế sau nói lần sau nên hỏi hay làm gì. Ô praise chỉ cần vế đầu. Ô praise không quá ${PRAISE_WORDS} chữ, các ô khác không quá ${COMMENT_WORDS} chữ. Gọi nhân vật bằng cách gọi trong <nhan_vat>, không gọi là "nhân vật". Trích lời ai thì không quá ${QUOTE_WORDS} chữ. Chỉ nói về cách hỏi của người hỏi trong buổi này. Không khẳng định gì về người dùng thật. Không thêm chi tiết nào về nhân vật ngoài <hoi_thoai>. Chỉ khen ở ô loại praise.`,
  "- cited_turns: số lượt được trích, chỉ chọn trong các lượt của ô đó.",
  "- Loại praise: trích lời nhân vật mà câu hỏi ở lượt đó đã bám vào. suggested_question = null.",
  "- Loại leading: người hỏi tự thêm ý của mình vào câu hỏi (cụm được ghi trong ô). Màn hình đã hiện cụm đó cùng câu nhân vật chưa từng nói điều này, nên text không giải thích lại thế nào là dẫn dắt: vế đầu nêu câu hỏi ở lượt đó hỏi về chuyện gì, vế sau nói lần sau nên hỏi gì trước. suggested_question: một câu hỏi thay cho câu ở lượt đầu tiên của ô, hỏi cùng chủ đề mà không cài sẵn câu trả lời và không thêm ý mới.",
  "- Loại hypothetical_future: người hỏi hỏi về điều sẽ làm hoặc \"nếu... thì...\". suggested_question: một câu hỏi về một lần cụ thể đã xảy ra, thay cho câu ở lượt đầu tiên của ô.",
  "- Loại heard_not_followed: người hỏi đã ghi lại một điều trong ghi chú nhưng câu ngay sau lại hỏi sang chuyện khác. canvas_range: đúng range ghi trong ô. item_id: mã (I...) ghi trong ô. cited_turns phải có lượt đầu tiên của ô. suggested_question: một câu hỏi tiếp vào lời nhân vật vừa nói, thay cho câu ở lượt đó.",
  "- Loại habit: mô tả thói quen lặp lại qua các lượt của ô: nhân vật vừa nhắc tới một điều, câu ngay sau hỏi sang chuyện khác. suggested_question = null.",
  "- Trường không dùng tới thì để null.",
  `Câu hỏi thay thế (suggested_question) là câu người hỏi có thể nói với nhân vật: một câu, không quá ${QUESTION_WORDS} chữ, như nói thành lời với người thật và xưng hô như trong <hoi_thoai>; không dẫn dắt.`,
  "Giọng văn:",
  ...PLAIN_VOICE_LINES,
  "- Không liệt kê, không gạch đầu dòng trong text.",
].join("\n");

/**
 * One comment written two ways, on a topic no scenario covers, so the model hears the voice
 * without a sentence it could copy into a real comment.
 */
export const FEEDBACK_VOICE_REFERENCE = [
  "Ví dụ về giọng, chủ đề gửi xe ở chung cư (chỉ để tham khảo giọng, không chép):",
  "- leading chưa tốt: \"Bạn có xu hướng đưa sẵn nhận định vào câu hỏi, điều này dễ khiến câu trả lời của anh Quân bị định hướng.\"",
  "- leading tốt: \"Ở lượt 2 bạn hỏi luôn chuyện mất vé, lần sau hỏi anh Quân gửi xe thế nào trước.\"",
  "- praise chưa tốt: \"Bạn đã lắng nghe rất tốt và khai thác sâu trải nghiệm gửi xe đầy thú vị của anh Quân.\"",
  "- praise tốt: \"Bạn hỏi tiếp đúng chữ 'tháng rồi mất vé' của anh Quân, nên anh kể ra lần đó.\"",
].join("\n");

const oneLine = (text: string) => tokenize(text).join(" ");

/** One slot per line, so no learner text can start a line of its own. */
function renderSlot(slot: FeedbackSlot): string {
  const parts = [`- ${slot.id}`, `loại: ${slot.type}`, `lượt: ${slot.turns.join(", ")}`];
  if (slot.spans.length > 0) parts.push(`cụm tự thêm: ${slot.spans.map((span) => `lượt ${span.turn} "${oneLine(span.text)}"`).join("; ")}`);
  if (slot.note) parts.push(`ghi chú [${slot.note.range[0]}, ${slot.note.range[1]}]: "${oneLine(slot.note.text)}"`, `điều: ${slot.note.itemAlias}`);
  return parts.join(" | ");
}

/**
 * Reveal call 2 (addendum §2.4): the words of the comments code triggered. It is told which item
 * is sealed, by alias, and is given nothing else about it: not its content, its sample question
 * or its hook line. Of the other untold items it gets nothing at all: code drops a comment that
 * names one (`resolveClaims`).
 */
export function buildFeedbackMessages(context: FeedbackContext): BaseMessage[] {
  const { sealed } = context;
  const system = [
    "Bạn là người viết nhận xét cho một buổi luyện phỏng vấn người dùng đã kết thúc. Bạn viết cho người hỏi, bằng tiếng Việt, gọi người hỏi là \"bạn\". Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    RULES,
    ...(sealed
      ? [
          `Điều ${sealed.itemAlias} đang niêm phong: không viết gì về nó${sealed.hookTurn === null ? "" : `, và không nhắc lại lời nhân vật nói ở lượt ${sealed.hookTurn}`}.`,
        ]
      : []),
    FEEDBACK_VOICE_REFERENCE,
    "Ví dụ cách gọi tên từng kiểu câu hỏi cần sửa (chỉ để tham khảo giọng, không chép lại):",
    dataBlock(
      "vi_du",
      [`- câu đóng: ${context.errorPatterns.closed}`, `- giả định tương lai: ${context.errorPatterns.hypothetical_future}`, `- khác: ${context.errorPatterns.other}`, `- thói quen: ${context.habitLabel}`].join("\n"),
    ),
  ].join("\n\n");

  const human = [
    dataBlock("nhan_vat", `${context.persona.displayName}. ${context.persona.identity}`),
    dataBlock("hoi_thoai", renderTranscript(context.transcript)),
    "Các nhận xét cần viết:",
    dataBlock("nhan_xet_can_viet", context.slots.length > 0 ? context.slots.map(renderSlot).join("\n") : "(không có)"),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(human)];
}
