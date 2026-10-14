import { describe, expect, it } from "vitest";
import { analyzeTurn } from "@/graphs/turn-graph";
import { floorActions, FLOOR_ATTACKS } from "@/eval/qa/floor";
import { freshBasis, itemBasis, seedOpener, stateProblems } from "@/eval/qa/seed";
import { aliasSchemas, publicFields } from "@/eval/qa/scenario-view";
import { evaluateThresholds, leaksOf, type JudgedObservation } from "@/eval/qa/thresholds";
import { probePromptFingerprint } from "@/eval/qa/tools";
import { actionKey } from "@/eval/qa/types";
import { chiThu, DROPPED, a } from "../helpers/engine-fixtures";
import { roleModels } from "../helpers/eval-models";

describe("seeded probe states", () => {
  it("puts every item one question away, in a state the engine could hold", () => {
    for (const item of chiThu.items) {
      const { state, transcript } = itemBasis(chiThu, item.id);
      expect(stateProblems(chiThu, state)).toEqual([]);
      expect(state.selectedHook).toBe(item.id);
      expect(transcript.at(-1)).toEqual({ index: 1, learnerText: seedOpener(item.topic_tag), personaText: item.hook_line });
      expect(state.openness).toBe(Math.max(chiThu.openness_start, item.trust_threshold ?? 0));
    }
  });

  it("opens and tells the prerequisite chain, and nothing else", () => {
    const { state } = itemBasis(chiThu, "shame");
    expect(state.unlocked.map((entry) => entry.itemId)).toEqual(["last-attempt"]);
    expect(state.disclosed.map((entry) => entry.itemId)).toEqual(["last-attempt"]);
    expect(itemBasis(chiThu, "paid-app").state.unlocked).toEqual([]);
  });

  it("names what the engine could not hold", () => {
    const { state } = freshBasis(chiThu);
    expect(stateProblems(chiThu, { ...state, unlocked: [{ itemId: "shame", turn: 1 }], openness: 11 })).toEqual([
      "shame is open before its prerequisite last-attempt",
      "openness 11 out of range",
    ]);
  });

  it("lets a follow-up item open the way it does live: the verdict confirms the hook, then the question picks it up", async () => {
    const basis = itemBasis(chiThu, "paid-app");
    const models = roleModels({
      ANALYSIS: [{ structured: { prev_turn_verdict: DROPPED, question_type: "other", label: "confirm_grounded", grounded_turn_id: 1, introduced_span: null, hook_id: a("hook", "paid-app"), topic_tags: [] } }],
    });
    const { plan } = await analyzeTurn({ scenario: chiThu, ...basis, question: "Lần đó chị định ghi kiểu gì ạ?" }, { scope: { scope: "eval" }, meta: {}, llmDeps: models.llmDeps });
    expect(plan.unlockedItemId).toBe("paid-app");
  });
});

describe("floor, aliases and keys", () => {
  it("checks every item's sample question and runs the floor attacks", () => {
    const actions = floorActions(chiThu);
    expect(actions.filter((action) => action.tool === "check_unlock")).toHaveLength(chiThu.items.length);
    expect(actions.filter((action) => action.tool === "attack").map((action) => action.tool === "attack" && action.attackId)).toEqual([...FLOOR_ATTACKS]);
  });

  it("accepts only the aliases that exist", () => {
    const ids = aliasSchemas(chiThu);
    expect(ids.item.safeParse(`I${chiThu.items.length}`).success).toBe(true);
    expect(ids.item.safeParse(`I${chiThu.items.length + 1}`).success).toBe(false);
    expect(ids.field.safeParse(`F${publicFields(chiThu).length + 1}`).success).toBe(false);
  });

  it("fingerprints the probe prompts as they render, so a prompt change is a new cache key", () => {
    const fingerprint = probePromptFingerprint(chiThu);
    expect(fingerprint).toContain("Bạn là bộ phân tích");
    expect(fingerprint).toContain(`Bạn đóng vai ${chiThu.persona.display_name}`);
    expect(probePromptFingerprint(chiThu)).toBe(fingerprint);
  });

  it("keys an action by what it does, not by who asked for it", () => {
    const action = { tool: "check_unlock" as const, itemId: "shame", question: "q" };
    expect(actionKey({ ...action, source: "floor" })).toBe(actionKey({ ...action, source: "reflect" }));
    expect(actionKey({ ...action, source: "floor" })).not.toBe(actionKey({ ...action, question: "khác", source: "floor" }));
  });
});

const reply = (id: string, openItemIds: string[]) => ({ id, action: "a", question: "q", personaText: "p", openItemIds, allowedHookItemIds: [] });
function observation(replies: ReturnType<typeof reply>[], readings: JudgedObservation["readings"]): JudgedObservation {
  return { key: "a", action: { tool: "attack", attackId: "direct-demand", source: "floor" }, openedItemId: null, label: null, opennessBefore: null, opennessAfter: null, replies, readings };
}

describe("leaks: set arithmetic on item ids", () => {
  it("counts what was told or raised minus what was open, once per item", () => {
    const leaks = leaksOf([
      observation([reply("R1", ["money-home"]), reply("R2", [])], {
        R1: { told: ["money-home", "shame"], topics: ["shame", "installment", "money-home"] },
        R2: { told: [], topics: [] },
      }),
    ]);
    expect(leaks.map((leak) => `${leak.replyId}:${leak.itemId}:${leak.kind}`)).toEqual(["R1:shame:content", "R1:installment:topic"]);
  });

  it("fails `judged` for a reply the judge skipped, and `no_leaks` for a leak", () => {
    const observations = [observation([reply("R1", []), reply("R2", [])], { R1: { told: ["shame"], topics: [] } })];
    const thresholds = evaluateThresholds({ violations: [], publicLeaks: [], observations, leaks: leaksOf(observations) });
    expect(thresholds.filter((threshold) => !threshold.met).map((threshold) => threshold.key)).toEqual(["no_leaks", "judged"]);
  });
});
