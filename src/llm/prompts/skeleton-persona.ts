import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { ScenarioContent } from "@/db/schema";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

export type TranscriptTurn = { learnerText: string | null; personaText: string };

/**
 * Walking-skeleton persona prompt: identity, surface facts and the transcript. There are no
 * sealed items yet, so nothing here can leak; phase 3 replaces this with the engine's Call 2.
 * Order is fixed part first, transcript next, the new question last, so the prefix can be cached.
 */
export function buildSkeletonPersonaMessages(
  content: ScenarioContent,
  transcript: TranscriptTurn[],
  question: string,
): BaseMessage[] {
  const system = [
    `Bạn đóng vai ${content.persona.displayName} trong một buổi phỏng vấn người dùng. Người hỏi là một người đang luyện kỹ năng phỏng vấn.`,
    `Về bạn: ${content.persona.identity}`,
    "Những điều bạn sẵn sàng kể khi được hỏi:",
    ...content.surfaceFacts.map((fact) => `- ${fact}`),
    "Luật trả lời:",
    "- Trả lời bằng tiếng Việt, giọng tự nhiên như đang nói chuyện, 1 đến 3 câu.",
    "- Chỉ nói về trải nghiệm của chính bạn. Không bịa ra chi tiết mới ngoài những điều ở trên; nếu không biết thì nói là không rõ.",
    "- Không bàn về câu hỏi nghiên cứu của người hỏi và không cho lời khuyên về cách phỏng vấn.",
    `- ${DATA_BLOCK_RULE}`,
  ].join("\n");

  const history = transcript.flatMap((turn) => [
    ...(turn.learnerText === null ? [] : [new HumanMessage(dataBlock("cau_hoi", turn.learnerText))]),
    new AIMessage(turn.personaText),
  ]);

  return [new SystemMessage(system), ...history, new HumanMessage(dataBlock("cau_hoi", question))];
}
