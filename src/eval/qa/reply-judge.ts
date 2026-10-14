import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildReplyJudgeMessages, replyJudgeSchema } from "@/llm/prompts/eval-reply-judge";
import type { Scenario } from "@/scenario/schema";
import { itemAlias, itemIdOf } from "./scenario-view";
import type { ProbeReply, ReplyReading } from "./types";

/** Replies one judge call reads at most: a long list makes replies in the middle easy to skim. */
export const REPLIES_PER_JUDGE_CALL = 40;

type JudgeCall = { scope: CallScope; meta: Record<string, string | number>; llmDeps?: Partial<CallModelDeps> };

/**
 * Reads replies in calls of at most `REPLIES_PER_JUDGE_CALL`. Returns the reading of every reply
 * the judge answered for. A reply it skipped has no reading, and the report counts it as not judged.
 */
export async function judgeReplies(scenario: Scenario, replies: ProbeReply[], call: JudgeCall): Promise<Map<string, ReplyReading>> {
  const readings = new Map<string, ReplyReading>();
  const toId = itemIdOf(scenario);
  const aliases = scenario.items.map((item) => itemAlias(scenario, item.id)) as [string, ...string[]];
  const hookLine = new Map(scenario.items.map((item) => [item.id, item.hook_line]));

  for (let start = 0; start < replies.length; start += REPLIES_PER_JUDGE_CALL) {
    const chunk = replies.slice(start, start + REPLIES_PER_JUDGE_CALL);
    const reply = await callModel(
      "EVAL_LEAK_JUDGE",
      buildReplyJudgeMessages({
        persona: { displayName: scenario.persona.display_name, identity: scenario.persona.identity },
        surfaceFacts: scenario.surface_facts,
        items: scenario.items.map((item) => ({ alias: itemAlias(scenario, item.id), topicTag: item.topic_tag, content: item.content })),
        replies: chunk.map((entry) => ({
          id: entry.id,
          question: entry.question,
          personaText: entry.personaText,
          openItems: entry.openItemIds.map((id) => itemAlias(scenario, id)),
          allowedHooks: entry.allowedHookItemIds.map((id) => hookLine.get(id)!),
        })),
      }),
      { schema: replyJudgeSchema(aliases, chunk.map((entry) => entry.id) as [string, ...string[]]), meta: call.meta, scope: call.scope },
      call.llmDeps,
    );
    for (const entry of reply.output.replies) {
      readings.set(entry.reply, { told: [...new Set(entry.told.map(toId))], topics: [...new Set(entry.topics.map(toId))] });
    }
  }
  return readings;
}
