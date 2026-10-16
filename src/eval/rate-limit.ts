import { LlmCallError } from "@/llm/call-model";

export type RateLimitOptions = {
  /** Waits before a step is tried again after a rate limit. Tests pass none. */
  rateLimitDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

/** The provider kept refusing for load after every wait: the run stops. Probes it finished are cached, so the next run does not pay for them again. */
export class RateLimitError extends Error {
  constructor(cause: unknown) {
    super("the provider kept answering 429 (rate limit) after every wait", { cause });
    this.name = "RateLimitError";
  }
}

const DEFAULT_RATE_LIMIT_DELAYS_MS = [5_000, 20_000, 60_000];

function isRateLimit(error: unknown): boolean {
  if (!(error instanceof LlmCallError)) return false;
  const cause = error.cause as { status?: unknown; message?: unknown } | undefined;
  return cause?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|rate limit/iu.test(String(cause?.message ?? ""));
}

/**
 * Runs one step of an evaluation again, after a growing wait, while the provider answers with a
 * rate limit. A step writes nothing until it succeeds, so repeating it is safe.
 */
export async function withRateLimitBackoff<T>(step: () => Promise<T>, options: RateLimitOptions): Promise<T> {
  const delays = options.rateLimitDelaysMs ?? DEFAULT_RATE_LIMIT_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await step();
    } catch (error) {
      if (!isRateLimit(error)) throw error;
      if (attempt >= delays.length) throw new RateLimitError(error);
      await sleep(delays[attempt]);
    }
  }
}
