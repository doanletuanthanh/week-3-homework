import type { ResolvedAnalysis } from "./aliases";
import { isValidRange } from "./tokens";
import { isGoodLabel, type CheckedAnalysis, type Correction, type EngineState } from "./types";

/**
 * Checks every reference in Call 1 output before any rule reads it. Code cannot check meaning,
 * only that the evidence a label needs points at something real; a label without it becomes
 * `open`. `state` is snapshot t-1 with the verdict for turn t-1 already applied, so a hook the
 * persona dropped last turn can be picked up in this one.
 */
export function checkAnalysis(
  analysis: ResolvedAnalysis,
  context: { state: EngineState; turnIndex: number; learnerTokenCount: number },
): { checked: CheckedAnalysis; corrections: Correction[] } {
  const { state, turnIndex, learnerTokenCount } = context;
  const corrections: Correction[] = [];
  let label = analysis.label;

  // A good label must rest on an earlier persona turn. Turn 0 is the authored opening line.
  const grounded = analysis.grounded_turn_id;
  const groundedOk = typeof grounded === "number" && Number.isInteger(grounded) && grounded >= 1 && grounded < turnIndex;
  if (isGoodLabel(label) && !groundedOk) {
    corrections.push({
      field: "label",
      from: label,
      to: "open",
      reason: "grounded_turn_id không trỏ tới lượt persona nào trước lượt này",
    });
    label = "open";
  }
  if (label === "leading" && !isValidRange(analysis.introduced_span, learnerTokenCount)) {
    corrections.push({
      field: "label",
      from: label,
      to: "open",
      reason: "introduced_span trống hoặc ngoài phạm vi token của câu hỏi",
    });
    label = "open";
  }

  let hookItemId = analysis.hook_item_id;
  if (hookItemId !== null) {
    const pickable = state.ledger.some((entry) => entry.itemId === hookItemId && entry.closedAt === null);
    if (!pickable) {
      corrections.push({ field: "hook_id", from: hookItemId, to: null, reason: "hook chưa được thả hoặc không còn nhặt được" });
      hookItemId = null;
    }
  }

  const [tagItemId = null, ...extraTags] = analysis.tag_item_ids;
  if (extraTags.length > 0) {
    corrections.push({ field: "topic_tags", from: analysis.tag_item_ids, to: [tagItemId], reason: "chỉ giữ tag đầu tiên" });
  }

  return {
    checked: {
      question_type: analysis.question_type,
      label,
      grounded_turn_id: isGoodLabel(label) ? grounded : null,
      introduced_span: label === "leading" ? [analysis.introduced_span![0], analysis.introduced_span![1]] : null,
      hook_item_id: hookItemId,
      tag_item_id: tagItemId,
    },
    corrections,
  };
}
