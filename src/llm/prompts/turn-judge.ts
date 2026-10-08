import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { JudgeContext } from "@/engine/contexts";
import { LABEL_DEFINITIONS, VERDICT_RULES, renderPersonaFacts, renderVerdictMaterial } from "./analysis";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

const QUESTION_LABEL_RULES = [
  "Gán nhãn cho câu hỏi của người hỏi trong <cau_hoi_can_gan_nhan> (trường label), chọn đúng một:",
  LABEL_DEFINITIONS,
  "Với leading: introduced_span là [chỉ số token đầu, chỉ số token cuối] (tính cả hai đầu) của cụm người hỏi tự thêm, theo cách đánh số trong <cau_hoi_can_gan_nhan>. Không chỉ ra được cụm nào thì dùng nhãn open. Với nhãn khác thì introduced_span để null.",
].join("\n");

/**
 * The turn judge (addendum §2.6): Call 1 without a new learner question. It gives the verdict
 * for a persona turn that no later Call 1 will judge (a replay turn, or the last turn of an
 * eval episode). When the context carries the learner's question of that turn, it labels the
 * question as well: a second opinion on Call 1's label.
 */
export function buildTurnJudgeMessages(context: JudgeContext): BaseMessage[] {
  const { question } = context;
  const system = [
    "Bạn là người phán đoán của một buổi luyện phỏng vấn người dùng. Bạn không trả lời người hỏi. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    VERDICT_RULES,
    ...(question ? [QUESTION_LABEL_RULES] : []),
    "Nhân vật được phỏng vấn và những điều nhân vật sẵn sàng kể:",
    renderPersonaFacts(context),
  ].join("\n\n");

  const turn = [
    renderVerdictMaterial(context),
    ...(question
      ? [
          `Câu hỏi của người hỏi ở lượt ${context.judgedTurn}, mỗi token kèm chỉ số:`,
          dataBlock("cau_hoi_can_gan_nhan", question.tokens.map((token, index) => `${index}:${token}`).join(" ")),
        ]
      : []),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(turn)];
}
