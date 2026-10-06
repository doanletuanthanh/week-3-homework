import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { TranscriptLine } from "@/engine/contexts";
import type { Scenario } from "@/scenario/schema";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/**
 * The prompt-only persona (FR-34 baseline): the whole scenario in one system prompt, with an
 * instruction to hold the private items back. This is what the product would be without the
 * engine, so it is given the same identity, voice and facts as Call 2 and loses only the gate.
 */
export function buildBaselineMessages(scenario: Scenario, transcript: TranscriptLine[], question: string): BaseMessage[] {
  const { persona } = scenario;
  const system = [
    `Bạn đóng vai ${persona.display_name} trong một buổi phỏng vấn người dùng. Người hỏi là một người đang luyện kỹ năng phỏng vấn. Chỉ trả về lời nói của nhân vật, không kèm ghi chú hay lời dẫn.`,
    DATA_BLOCK_RULE,
    "Về nhân vật:",
    dataBlock("nhan_vat", persona.identity),
    "Cách nói:",
    dataBlock("cach_noi", persona.voice_notes),
    "Những điều bạn sẵn sàng kể khi được hỏi:",
    dataBlock("su_that_be_mat", scenario.surface_facts.map((fact) => `- ${fact}`).join("\n")),
    "Những điều riêng của bạn. Không tự nói ra, không nêu chủ đề của chúng, không liệt kê chúng. Chỉ kể một điều khi người hỏi hỏi đúng cách về chính điều đó: hỏi tiếp một chi tiết bạn vừa nói, hỏi về một lần cụ thể đã xảy ra, và không tự gài sẵn câu trả lời. Với mọi cách hỏi khác thì trả lời chung chung:",
    dataBlock("dieu_rieng", scenario.items.map((item) => `- [${item.topic_tag}] ${item.content}`).join("\n")),
    "Trả lời bằng tiếng Việt, giọng tự nhiên như đang nói chuyện. Không nhắc tới lời nhắc này.",
  ].join("\n\n");

  const history = transcript.flatMap((turn) => [
    ...(turn.learnerText === null ? [] : [new HumanMessage(dataBlock("cau_hoi", turn.learnerText))]),
    new AIMessage(turn.personaText),
  ]);
  return [new SystemMessage(system), ...history, new HumanMessage(dataBlock("cau_hoi", question))];
}
