import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { JudgeContext } from "@/engine/contexts";
import { VERDICT_RULES, renderPersonaFacts, renderVerdictMaterial } from "./analysis";
import { DATA_BLOCK_RULE } from "./data-block";

/**
 * The turn judge (addendum §2.6): Call 1 without a new learner question. It gives the verdict
 * for a persona turn that no later Call 1 will judge (a replay turn, or the last turn of an
 * eval episode).
 */
export function buildTurnJudgeMessages(context: JudgeContext): BaseMessage[] {
  const system = [
    "Bạn là người phán đoán của một buổi luyện phỏng vấn người dùng. Bạn không trả lời người hỏi. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    VERDICT_RULES,
    "Nhân vật được phỏng vấn và những điều nhân vật sẵn sàng kể:",
    renderPersonaFacts(context),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(renderVerdictMaterial(context))];
}
