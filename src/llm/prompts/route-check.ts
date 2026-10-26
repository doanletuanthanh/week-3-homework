import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { Scenario } from "@/scenario/schema";
import { ROUTING_RULES } from "./analysis";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";
import { repairSystem, type GeneratorInput } from "./scenario-generator";

/** Where the routing check sends each sample question: aliases as in its prompt, `Q<n>` and `T<n>`. */
export const routeCheckSchema = z.object({
  routes: z.array(z.object({ question: z.string(), direct: z.string().nullable(), broad: z.array(z.string()) })),
});
export type RouteCheck = z.infer<typeof routeCheckSchema>;

const tagAlias = (index: number) => `T${index + 1}`;
const questionAlias = (index: number) => `Q${index + 1}`;

/**
 * The generator's routing check: every item's sample question, routed under the rules Call 1
 * uses live, to the scenario's topic tags. It sees only public text, offline, so it may see every
 * tag and every question at once.
 */
export function buildRouteCheckMessages(scenario: Pick<Scenario, "items">): BaseMessage[] {
  const system = [
    "Bạn là người kiểm tra định tuyến chủ đề của một kịch bản luyện phỏng vấn người dùng. Bạn không trả lời câu hỏi nào. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    "Với mỗi câu hỏi Qn trong <cau_hoi_mau>, xét riêng câu đó như <cau_hoi_moi> trong cách định tuyến dưới đây và cho biết direct và broad của nó. Ở đây không cần direct_span.",
    ROUTING_RULES,
  ].join("\n\n");
  const request = [
    "Các chủ đề:",
    dataBlock("chu_de", scenario.items.map((item, index) => `${tagAlias(index)}: ${item.topic_tag}`).join("\n")),
    "Các câu hỏi:",
    dataBlock("cau_hoi_mau", scenario.items.map((item, index) => `${questionAlias(index)}: ${item.sample_question}`).join("\n")),
    "Trả về routes: đúng một mục cho mỗi câu hỏi, question là mã Q của câu đó.",
  ];
  return [new SystemMessage(system), new HumanMessage(request.join("\n"))];
}

/**
 * Items whose tag cannot be told apart, by position: its own question does not route directly to
 * it (another tag, none, an unknown alias or no route at all), or another item's question does.
 */
export function confusableItems(itemCount: number, check: RouteCheck): number[] {
  const directOf = new Map(check.routes.map((route) => [route.question, route.direct]));
  const confusable = new Set<number>();
  for (let index = 0; index < itemCount; index += 1) {
    const direct = directOf.get(questionAlias(index));
    if (direct !== tagAlias(index)) confusable.add(index);
    const absorbed = direct === undefined || direct === null ? -1 : Number(/^T(\d+)$/.exec(direct)?.[1] ?? 0) - 1;
    if (absorbed >= 0 && absorbed < itemCount && absorbed !== index) confusable.add(absorbed);
  }
  return [...confusable].sort((a, b) => a - b);
}

/** A repair of confusable items: a new tag and sample question for each, by position. */
export const tagRepairSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), topic_tag: z.string(), sample_question: z.string() })),
});
export type TagRepair = z.infer<typeof tagRepairSchema>;

/** One targeted repair of `topic_tag` and `sample_question` for the items the routing check could not tell apart. */
export function buildTagRepairMessages(input: Pick<GeneratorInput, "focus" | "constraints">, scenario: Pick<Scenario, "items">, confusable: number[]): BaseMessage[] {
  const named = new Set(confusable);
  const request = [
    "Mỗi item trong <can_sua> có topic_tag dễ nhầm: câu hỏi mẫu của nó không hỏi đúng vào nhãn của nó, hoặc câu hỏi của item khác lại rơi vào nhãn đó.",
    dataBlock(
      "can_sua",
      confusable
        .map((index) => {
          const item = scenario.items[index];
          return JSON.stringify({ index, content: item.content, secret_terms: item.secret_terms, topic_tag: item.topic_tag, sample_question: item.sample_question });
        })
        .join("\n"),
    ),
    "Nhãn của các item còn lại, giữ nguyên:",
    dataBlock("nhan_khac", scenario.items.flatMap((item, index) => (named.has(index) ? [] : [`- ${item.topic_tag}`])).join("\n") || "(không có)"),
    "Với mỗi item trong <can_sua>, viết topic_tag mới chỉ một khía cạnh riêng của content, phân biệt được với mọi nhãn khác, và sample_question mới hỏi đúng vào khía cạnh đó. Không dùng cụm nào trong secret_terms. Trả về items, index giữ nguyên.",
  ];
  return [new SystemMessage(repairSystem(input)), new HumanMessage(request.join("\n"))];
}

/** The scenario with the new tags and questions of the confusable items; any other index is ignored and named. */
export function applyTagRepair(scenario: Scenario, confusable: number[], repair: TagRepair): { scenario: Scenario; ignored: string[] } {
  const allowed = new Set(confusable);
  const next = structuredClone(scenario);
  const ignored: string[] = [];
  for (const { index, topic_tag, sample_question } of repair.items) {
    if (!allowed.has(index)) {
      ignored.push(`items[${index}]`);
      continue;
    }
    next.items[index] = { ...next.items[index], topic_tag, sample_question };
    allowed.delete(index);
  }
  return { scenario: next, ignored };
}
