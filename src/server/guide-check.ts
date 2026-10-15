import { z } from "zod";
import { GUIDE_CHECK_LIMITS } from "@/config/limits";
import type { Database } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { countGuideChecksToday, fillGuideCheck, reserveGuideCheck } from "@/db/repo/guide-checks";
import { LlmCallError, callModel, type CallModelDeps } from "@/llm/call-model";
import { GUIDE_LABELS, MAX_GUIDE_REPLY_QUESTIONS, buildGuideCheckMessages, guideCheckSchema, type GuideCheck, type GuideLabel } from "@/llm/prompts/guide-check";
import { buildModerationMessages, clampModeration, moderationSchema } from "@/llm/prompts/moderation";
import type { AppUser } from "./auth";
import { canStartSession } from "./cost-cap";

/** Input of the guide check. The limits are counted here, whatever the browser allowed. */
export const guideCheckInputSchema = z.object({
  guide: z
    .string()
    .trim()
    .min(1)
    .max(GUIDE_CHECK_LIMITS.chars)
    // A size limit on what is sent, not a reading of it: the model splits the guide into questions.
    .refine((guide) => guide.split("\n").filter((line) => line.trim() !== "").length <= GUIDE_CHECK_LIMITS.lines),
  idea: z
    .string()
    .trim()
    .max(GUIDE_CHECK_LIMITS.ideaChars)
    .refine((idea) => !idea.includes("\n"))
    .default(""),
});

export type GuideCheckResult =
  | { ok: true; questions: GuideCheck["questions"]; counts: Record<GuideLabel, number>; left: number | null }
  /**
   * `limit`: today's checks are used up. `over_cap`: today's session budget is spent. `refused`:
   * moderation turned the idea down. `llm_failed`: a call failed after its retries. Both still count:
   * their attempts were paid for, so giving the check back would let a guide that always fails run without limit.
   */
  | { ok: false; error: "invalid_input" | "limit" | "over_cap" | "refused" | "llm_failed" };

/** Checks left today; null for a demo account, whose checks are not counted (the session cap still holds). */
export async function guideChecksLeft(db: Database, user: Pick<AppUser, "id" | "isDemo">): Promise<number | null> {
  if (user.isDemo) return null;
  const [perDay, used] = await Promise.all([getConfig(db, "guide_checks_per_day"), countGuideChecksToday(db, user.id)]);
  return Math.max(0, perDay - used);
}

/**
 * "Kiểm tra bộ câu hỏi": labels each question of a learner's interview guide with one structured
 * call on the ANALYSIS model, after moderation of the app idea when one is given. The spend is
 * charged to the session scope, so the session cap covers it. Nothing the learner typed is stored:
 * only a `guide_checked` event with counts, which is also what the daily limit counts.
 */
export async function checkGuide(
  db: Database,
  user: Pick<AppUser, "id" | "isDemo">,
  rawInput: unknown,
  options: { llmDeps?: Partial<CallModelDeps> } = {},
): Promise<GuideCheckResult> {
  const input = guideCheckInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { guide } = input.data;
  const idea = input.data.idea || null;

  if (!(await canStartSession(db, user.isDemo))) return { ok: false, error: "over_cap" };
  const pending = { idea: idea !== null, refused: false, failed: false, questions: 0, flagged: 0 };
  let eventId: string | null = null;
  if (!user.isDemo) {
    const perDay = await getConfig(db, "guide_checks_per_day");
    eventId = await db.transaction((tx) => reserveGuideCheck(tx, user.id, perDay, pending));
    if (eventId === null) return { ok: false, error: "limit" };
  }

  try {
    if (idea !== null) {
      const reply = await callModel("MODERATION", buildModerationMessages({ topic: idea, focusRaw: "" }), { schema: moderationSchema, meta: {}, scope: { scope: "moderation" } }, options.llmDeps);
      if (clampModeration(reply.output).decision === "refuse") {
        if (eventId) await fillGuideCheck(db, eventId, { ...pending, refused: true });
        return { ok: false, error: "refused" };
      }
    }
    const reply = await callModel("ANALYSIS", buildGuideCheckMessages({ guide, idea }), { schema: guideCheckSchema, meta: { purpose: "guide_check" }, scope: { scope: "session" } }, options.llmDeps);
    const questions = reply.output.questions.slice(0, MAX_GUIDE_REPLY_QUESTIONS);
    const counts = Object.fromEntries(GUIDE_LABELS.map((label) => [label, questions.filter((question) => question.label === label).length])) as Record<GuideLabel, number>;
    if (eventId) await fillGuideCheck(db, eventId, { ...pending, questions: questions.length, flagged: questions.length - counts.open });
    return { ok: true, questions, counts, left: await guideChecksLeft(db, user) };
  } catch (error) {
    if (!(error instanceof LlmCallError)) throw error;
    if (eventId) await fillGuideCheck(db, eventId, { ...pending, failed: true });
    console.warn(JSON.stringify({ event: "guide_check_failed", attempts: error.attempts }));
    return { ok: false, error: "llm_failed" };
  }
}
