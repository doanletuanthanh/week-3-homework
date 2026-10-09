import { eq } from "drizzle-orm";
import { z } from "zod";
import { CUSTOM_TOPIC_CHARS, GENERATION_DEADLINE_MS, MAX_FOCUS_CHARS } from "@/config/limits";
import type { Database } from "@/db/client";
import {
  createRunningAttempt,
  findOwnCustomTopic,
  getPendingCustomSession,
  lockGenerationBudget,
  recordRefusal,
  reportProblem,
  sweepStaleAttempts,
} from "@/db/repo/custom-topics";
import { users } from "@/db/schema";
import { LlmCallError, callModel, type CallModelDeps } from "@/llm/call-model";
import { buildModerationMessages, clampModeration, moderationSchema } from "@/llm/prompts/moderation";
import type { AppUser } from "./auth";
import { readCustomQuota, type CustomQuota, type QuotaBlock } from "./custom-quota";
import { recordEvent } from "./events";
import { quotaKeyOf } from "./quota";

/** Body of the submit API (Màn 10). Limits are enforced here, whatever the browser allowed. */
export const customTopicInputSchema = z.object({
  topic: z.string().trim().min(CUSTOM_TOPIC_CHARS.min).max(CUSTOM_TOPIC_CHARS.max),
  focus: z.string().trim().max(MAX_FOCUS_CHARS).default(""),
  /** "Thử lại": the failed session whose custom topic this is another try in. */
  retryOf: z.uuid().optional(),
});

export type SubmitResult =
  | { ok: true; sessionId: string; attemptId: string }
  /**
   * `refused`: moderation turned the topic down; nothing was created and no attempt was used.
   * `no_identity`: the auth server holds no Google identity for the learner, so the limits cannot
   * be checked against deleted accounts. `llm_failed`: the moderation call failed; nothing was created.
   */
  | { ok: false; error: "invalid_input" | "refused" | "no_identity" | "llm_failed" }
  | { ok: false; error: "blocked"; block: QuotaBlock; runningSessionId: string | null };

export type SubmitOptions = {
  llmDeps?: Partial<CallModelDeps>;
  /** When the submit request started: the attempt's ten minutes count from here. */
  requestStartedAt?: number;
};

/**
 * The limits as Màn 10 shows them. Attempts whose runner is gone are closed first, whoever they
 * belong to: a dead attempt of another learner would otherwise hold budget this one is refused for.
 */
export async function getCustomQuota(db: Database, user: Pick<AppUser, "id">): Promise<CustomQuota> {
  await sweepStaleAttempts(db);
  return readCustomQuota(db, user);
}

/**
 * "Tạo kịch bản": one moderation call that also classifies the focus, inside the request and
 * before anything exists (FR-55). A refusal creates no session and uses no attempt. An accepted
 * topic gets, in one transaction, its custom topic, a `generating` session and a running attempt
 * holding its part of the budget; the caller then starts the runner.
 *
 * The limits are read twice: before the moderation call, so a learner who cannot start gets the
 * right message without a model being called, and again inside the creating transaction under
 * the learner's row lock and the budget lock, which is the check that counts.
 */
export async function submitCustomTopic(db: Database, user: AppUser, rawInput: unknown, options: SubmitOptions = {}): Promise<SubmitResult> {
  const requestStartedAt = options.requestStartedAt ?? Date.now();
  const input = customTopicInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const { topic, focus: focusRaw, retryOf } = input.data;

  if (!user.isDemo && (await quotaKeyOf(db, user.id)) === null) return { ok: false, error: "no_identity" };
  const before = await getCustomQuota(db, user);
  if (before.block) return { ok: false, error: "blocked", block: before.block, runningSessionId: before.runningSessionId };

  let moderation;
  try {
    // The one call that reads the learner's own words about what they want to practise (FR-53).
    const reply = await callModel("MODERATION", buildModerationMessages({ topic, focusRaw }), { schema: moderationSchema, meta: {}, scope: { scope: "moderation" } }, options.llmDeps);
    moderation = clampModeration(reply.output);
  } catch (error) {
    if (!(error instanceof LlmCallError)) throw error;
    console.warn(JSON.stringify({ event: "moderation_failed", attempts: error.attempts }));
    return { ok: false, error: "llm_failed" };
  }

  if (moderation.decision === "refuse") {
    await recordRefusal(db, { userId: user.id, topicText: topic, focus: moderation.focus, focusRaw, reasonCode: moderation.reasonCode });
    return { ok: false, error: "refused" };
  }
  const { constraints, focus } = moderation;

  const retried = retryOf ? await getPendingCustomSession(db, user.id, retryOf) : null;
  return db.transaction(async (tx): Promise<SubmitResult> => {
    // Holds the account: no second request of the same learner gets past here until this one is done.
    const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    if (!account) return { ok: false, error: "invalid_input" };
    await lockGenerationBudget(tx);
    // An attempt whose runner is gone holds budget it will never use: it is closed before the budget is read.
    await sweepStaleAttempts(tx);
    const quota = await readCustomQuota(tx, user);
    if (quota.block) return { ok: false, error: "blocked", block: quota.block, runningSessionId: quota.runningSessionId };

    const topicId = retried?.attempt.topicId && (await findOwnCustomTopic(tx, user.id, retried.attempt.topicId)) ? retried.attempt.topicId : null;
    const { attempt, session } = await createRunningAttempt(tx, {
      userId: user.id,
      isDemo: user.isDemo,
      topicId,
      topicText: topic,
      focus,
      focusRaw,
      constraints,
      reserveUsd: quota.reserveUsd,
      deadlineAt: new Date(requestStartedAt + GENERATION_DEADLINE_MS),
    });
    await recordEvent(tx, { userId: user.id, sessionId: session.id, isDemo: user.isDemo }, { name: "custom_topic_requested", props: { focus, constraints } });
    return { ok: true, sessionId: session.id, attemptId: attempt.id };
  });
}

/** "Kịch bản này có vấn đề" on the reveal of the learner's own custom session. */
export async function reportCustomProblem(db: Database, user: AppUser, sessionId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!(await reportProblem(tx, user.id, sessionId))) return false;
    await recordEvent(tx, { userId: user.id, sessionId, isDemo: user.isDemo }, { name: "custom_problem_reported", props: {} });
    return true;
  });
}
