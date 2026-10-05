/** Longest learner question, in characters (PRD Màn 4). */
export const MAX_QUESTION_CHARS = 500;

/** Learner turns in one session (PRD Màn 3: "Tối đa 30 lượt"). */
export const MAX_TURNS = 30;

/** A pending action can be resumed for this long after it was requested. */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

/** One model attempt is abandoned after this long. */
export const LLM_ATTEMPT_TIMEOUT_MS = 45_000;

/** Technical retries after the first attempt of a model call. */
export const LLM_MAX_RETRIES = 2;
