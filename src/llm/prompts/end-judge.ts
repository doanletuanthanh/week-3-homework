import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { EndJudgeContext } from "@/engine/reveal-contexts";
import { VERDICT_RULES, renderPersonaFacts, renderVerdictMaterial } from "./analysis";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

const CANVAS_RULES = [
  "Việc thứ hai: đối chiếu ghi chú của người hỏi trong <ghi_chu> với những điều trong <moi_dieu> (trường canvas_matches). Ghi chú được viết trong lúc nghe; mỗi token kèm chỉ số.",
  "- Với mỗi đoạn ghi chú ghi lại đúng phần chính của một điều trong <moi_dieu> (nguyên văn, hoặc diễn đạt khác đi nhưng cùng ý): thêm một mục kind = \"item\", item_id = mã (I...) của điều đó, range = [chỉ số token đầu, chỉ số token cuối] (tính cả hai đầu) của đúng đoạn đó.",
  "- Chỉ nhắc tới chủ đề mà không nói ra điều đó thì không tính. Đoạn nói ngược lại với điều đó thì không tính.",
  "- Với mỗi đoạn ghi chú khẳng định một điều về nhân vật mà nhân vật chưa từng nói trong <hoi_thoai>, không khớp điều nào trong <moi_dieu> và không khớp <su_that_be_mat>: thêm một mục kind = \"never_said\", item_id = null.",
  "- Đoạn chỉ ghi lại điều trong <su_that_be_mat>, câu tự hỏi, việc cần làm, hay ý không nói về nhân vật: không thêm mục nào.",
  "- Một điều được ghi nhiều lần: chỉ thêm mục cho lần đầu. Các đoạn không chồng lên nhau.",
  "- reason: một câu ngắn giải thích. Ghi chú trống thì canvas_matches là mảng rỗng.",
].join("\n");

/**
 * Reveal call 1 (addendum §2.3): the verdict for the last persona turn, which no later Call 1
 * judged, and the frozen notes matched against every item. The session has ended, so every
 * item's content is here. The notes are learner text: they sit in a data block.
 */
export function buildEndJudgeMessages(context: EndJudgeContext): BaseMessage[] {
  const system = [
    "Bạn là người chấm cuối buổi của một buổi luyện phỏng vấn người dùng đã kết thúc. Bạn không nói chuyện với ai. Bạn làm hai việc và trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    `Việc thứ nhất. Ở đây trường prev_turn_verdict có tên là last_turn_verdict.\n${VERDICT_RULES}`,
    CANVAS_RULES,
    "Nhân vật được phỏng vấn và những điều nhân vật sẵn sàng kể:",
    renderPersonaFacts(context),
  ].join("\n\n");

  const notes = context.canvasTokens.length > 0 ? context.canvasTokens.map((token, index) => `${index}:${token}`).join(" ") : "(trống)";
  const human = [
    renderVerdictMaterial(context),
    dataBlock("moi_dieu", context.allItems.map((item) => `${item.alias}: ${item.content}`).join("\n")),
    "Ghi chú của người hỏi, đã đóng băng khi buổi kết thúc:",
    dataBlock("ghi_chu", notes),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(human)];
}
