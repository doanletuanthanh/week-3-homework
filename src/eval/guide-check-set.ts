import { z } from "zod";
import { callModel } from "@/llm/call-model";
import { GUIDE_LABELS, buildGuideCheckMessages, guideCheckSchema, type GuideLabel } from "@/llm/prompts/guide-check";
import { rate, type JudgementOptions, type SetScore } from "./judgement-eval";
import { mapPooled } from "./pool";

/**
 * `guide-check`: one interview guide per line, with the label each of its questions must get, in
 * order. The guide is sent as its questions joined by new lines, as a learner would paste it.
 */
export const guideCaseSchema = z.strictObject({
  id: z.string().min(1),
  idea: z.string().min(1).optional(),
  questions: z.array(z.strictObject({ text: z.string().min(1), expected: z.enum(GUIDE_LABELS) })).min(1),
  note: z.string().optional(),
});
export type GuideCase = z.infer<typeof guideCaseSchema>;

/** The gate of the guide check: leading questions it must catch. */
export const MIN_LEADING_RECALL = 0.9;
/** Guides the starter set needs before its result is taken as proof. */
export const MIN_GUIDE_SET_SIZE = 30;

export type GuideRow = { id: string; expected: GuideLabel[]; predicted: GuideLabel[] };

/**
 * Compared question by question. When the reply holds another number of questions than the guide,
 * its questions cannot be matched up: every leading question of that guide counts as missed.
 */
export function scoreGuideSet(rows: GuideRow[]): SetScore {
  let leading = 0;
  let caught = 0;
  let flaggedLeading = 0;
  let trueLeading = 0;
  let agreed = 0;
  let compared = 0;
  const mismatches: string[] = [];
  for (const row of rows) {
    leading += row.expected.filter((label) => label === "leading").length;
    if (row.predicted.length !== row.expected.length) {
      mismatches.push(`${row.id}: trả về ${row.predicted.length} câu, bộ có ${row.expected.length} câu`);
      continue;
    }
    row.expected.forEach((expected, index) => {
      const predicted = row.predicted[index];
      compared += 1;
      if (expected === predicted) agreed += 1;
      else mismatches.push(`${row.id} câu ${index + 1}: cần ${expected}, nhận ${predicted}`);
      if (predicted === "leading") flaggedLeading += 1;
      if (expected === "leading" && predicted === "leading") {
        caught += 1;
        trueLeading += 1;
      }
    });
  }
  const share = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`);
  return {
    size: rows.length,
    minSize: MIN_GUIDE_SET_SIZE,
    rates: [rate("leading_recall", "Bắt được câu dẫn dắt", caught, leading, MIN_LEADING_RECALL, true)],
    notes: [
      `Nhãn khớp: ${share(agreed, compared)} (${agreed}/${compared} câu so được)`,
      `Độ chính xác của nhãn leading: ${share(trueLeading, flaggedLeading)} (${trueLeading}/${flaggedLeading})`,
    ],
    mismatches,
  };
}

/** Runs the production guide check on each guide: one call per guide. */
export async function runGuideSet(cases: GuideCase[], options: JudgementOptions): Promise<SetScore> {
  const rows = await mapPooled(cases, options.concurrency ?? 1, async (entry): Promise<GuideRow> => {
    const reply = await callModel(
      "ANALYSIS",
      buildGuideCheckMessages({ guide: entry.questions.map((question) => question.text).join("\n"), idea: entry.idea ?? null }),
      { schema: guideCheckSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    return { id: entry.id, expected: entry.questions.map((question) => question.expected), predicted: reply.output.questions.map((question) => question.label) };
  });
  return scoreGuideSet(rows);
}
