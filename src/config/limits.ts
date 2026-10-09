/** Days start at midnight in Vietnam, where the learners are. */
export const DAY_ZONE = "Asia/Ho_Chi_Minh";

/** Longest learner question, in characters (PRD Màn 4). */
export const MAX_QUESTION_CHARS = 500;

/** Longest notes canvas, in characters (PRD Màn 4). */
export const MAX_CANVAS_CHARS = 5000;

/** Learner turns in one session (PRD Màn 3: "Tối đa 30 lượt"). */
export const MAX_TURNS = 30;

/** A pending action can be resumed for this long after it was requested. */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

/** One model attempt is abandoned after this long. */
export const LLM_ATTEMPT_TIMEOUT_MS = 45_000;

/** Technical retries after the first attempt of a model call. */
export const LLM_MAX_RETRIES = 2;

/**
 * One turn (its model calls with their retries: two, or three on a replay) is abandoned after this long. Shorter than the
 * claim below, so a running turn never loses its claim to a second request.
 */
export const TURN_TIME_BUDGET_MS = 110_000;

/** A turn claim left by a request that died is taken over after this long. */
export const TURN_CLAIM_TTL_MS = 120_000;

/** The notes are saved this long after the learner stops typing. */
export const CANVAS_AUTOSAVE_DELAY_MS = 800;

/** A failed notes save is tried again after this long. */
export const CANVAS_AUTOSAVE_RETRY_MS = 3000;

/**
 * How long the browser has to send the final notes after turn 30 ended the session. After it,
 * the server freezes the last autosaved text itself.
 */
export const CANVAS_FREEZE_GRACE_MS = 60_000;

/** The reveal runner refreshes its heartbeat this often while it lives. */
export const REVEAL_HEARTBEAT_MS = 15_000;

/** A reveal runner whose heartbeat is older than this died, and another may take the reveal over. */
export const REVEAL_STALE_MS = 150_000;

/** Runners one reveal may have. When the last one dies too, the degraded result is written. */
export const REVEAL_MAX_RUNS = 3;

/** The reveal screen asks whether the result is ready this often. */
export const REVEAL_POLL_MS = 2_000;

/** After this long the reveal screen adds that the learner may close the page. */
export const REVEAL_SLOW_AFTER_MS = 30_000;

/** Shortest `QUOTA_HASH_SECRET` the app and the CLI accept. */
export const QUOTA_HASH_SECRET_MIN_LENGTH = 32;

/** Length of a custom topic, in characters (FR-52). */
export const CUSTOM_TOPIC_CHARS = { min: 10, max: 300 } as const;

/** Longest answer to "Bạn muốn luyện điều gì trong buổi này?", in characters. */
export const MAX_FOCUS_CHARS = 300;

/** Custom-topic attempts one learner may start in a day; refusals and system errors do not count (FR-56). */
export const CUSTOM_ATTEMPTS_PER_DAY = 3;

/** Failed custom-topic attempts after which the path is closed to the account for good (FR-56). */
export const CUSTOM_LIFETIME_FAILURES = 6;

/** Topics refused by moderation in one day after which the path is closed until midnight (FR-55). */
export const CUSTOM_REFUSALS_PER_DAY = 10;

/** Share of the daily generation budget one account may use (FR-56). */
export const GENERATION_ACCOUNT_SHARE = 0.2;

/** One run of a generation attempt stops itself after this long, below the 300 s Vercel gives a function, and leaves the rest to the next run. */
export const GENERATION_RUN_LIMIT_MS = 270_000;

/** An attempt that has no result this long after its submit request started is closed as a system error (PRD §7: 10 minutes). */
export const GENERATION_DEADLINE_MS = 600_000;

/** Runs one attempt may have. A run that dies with its function is followed by the next one, which goes on from what was stored. */
export const GENERATION_MAX_RUNS = 3;

/** The generation runner refreshes its heartbeat this often while it lives. */
export const GENERATION_HEARTBEAT_MS = 15_000;

/** A running attempt whose heartbeat is older than this lost its runner: another run may take it over. */
export const GENERATION_STALE_MS = 60_000;

/** The "Đang chuẩn bị" screen asks for the attempt's step this often. */
export const GENERATION_POLL_MS = 2_000;

/** Times the generator is given the `validate` violations of its own output to fix (addendum §2.8). */
export const GENERATOR_FEEDBACK_LOOPS = 2;

/** One try of the scenario generator is abandoned after this long. The attempt's own 270 s limit still ends the run. */
export const GENERATOR_ATTEMPT_TIMEOUT_MS = 100_000;
