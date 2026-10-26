import { describe, expect, it } from "vitest";
import { ROUTING_RULES } from "@/llm/prompts/analysis";
import { applyTagRepair, buildRouteCheckMessages, buildTagRepairMessages, confusableItems, type RouteCheck } from "@/llm/prompts/route-check";
import { chiThu } from "../helpers/engine-fixtures";

const text = (messages: { text: string }[]) => messages.map((message) => message.text).join("\n");
const routes = (directs: (string | null)[]): RouteCheck => ({ routes: directs.map((direct, index) => ({ question: `Q${index + 1}`, direct, broad: [] })) });

describe("confusableItems", () => {
  it("finds nothing when every question routes to its own tag", () => {
    expect(confusableItems(3, routes(["T1", "T2", "T3"]))).toEqual([]);
  });

  it("marks both items of a swapped pair", () => {
    expect(confusableItems(3, routes(["T2", "T1", "T3"]))).toEqual([0, 1]);
  });

  it("marks a tag that absorbs another item's question, and that item", () => {
    expect(confusableItems(4, routes(["T1", "T1", "T3", "T4"]))).toEqual([0, 1]);
  });

  it("marks a question with no direct topic, or with no route at all", () => {
    expect(confusableItems(3, routes(["T1", null, "T3"]))).toEqual([1]);
    expect(confusableItems(3, { routes: routes(["T1", "T2", "T3"]).routes.slice(0, 2) })).toEqual([2]);
  });

  it("marks a question routed to an alias that is not one of the tags", () => {
    expect(confusableItems(3, routes(["T1", "T9", "X"]))).toEqual([1, 2]);
  });
});

describe("buildRouteCheckMessages", () => {
  const prompt = text(buildRouteCheckMessages(chiThu));

  it("routes under the rules Call 1 uses live", () => {
    expect(prompt).toContain(ROUTING_RULES);
  });

  it("holds the public tags and sample questions as data, and nothing secret", () => {
    expect(prompt).toContain(`<chu_de>\nT1: ${chiThu.items[0].topic_tag}`);
    expect(prompt).toContain(`<cau_hoi_mau>\nQ1: ${chiThu.items[0].sample_question}`);
    for (const item of chiThu.items) expect(prompt).not.toContain(item.content);
  });
});

describe("the tag repair", () => {
  it("names the other tags the new ones must stay apart from", () => {
    const prompt = text(buildTagRepairMessages({ focus: "general", constraints: [] }, chiThu, [0, 2]));
    expect(prompt).toContain("<can_sua>");
    expect(prompt).toContain(chiThu.items[0].content);
    expect(prompt).toContain(`- ${chiThu.items[1].topic_tag}`);
    expect(prompt).not.toContain(`- ${chiThu.items[0].topic_tag}`);
  });

  it("changes only the tag and question of the items it was asked about", () => {
    const { scenario, ignored } = applyTagRepair(chiThu, [0], {
      items: [
        { index: 0, topic_tag: "nhãn mới", sample_question: "Câu mới?" },
        { index: 1, topic_tag: "không được", sample_question: "Không?" },
      ],
    });
    expect(scenario.items[0]).toEqual({ ...chiThu.items[0], topic_tag: "nhãn mới", sample_question: "Câu mới?" });
    expect(scenario.items[1]).toEqual(chiThu.items[1]);
    expect(ignored).toEqual(["items[1]"]);
  });
});
