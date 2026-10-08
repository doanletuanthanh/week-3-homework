import { cookies } from "next/headers";

/** Where a test may make the server fail: while a page renders, or while the layout does. */
export type TestFault = "page" | "layout";

const COOKIE = "il_test_fault";

/**
 * Lets the end-to-end tests see the error pages, which nothing else can bring up. It does
 * something only when the app runs for those tests: the switch is on and the model provider is
 * the local stub. A deployed app has neither, so the cookie means nothing there.
 */
export function testFaultsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.E2E_TEST_FAULTS === "true" && /^http:\/\/127\.0\.0\.1[:/]/u.test(env.OPENAI_BASE_URL ?? "");
}

/** Fails the render when the tests asked for a failure at this place. */
export async function failIfAsked(fault: TestFault): Promise<void> {
  if (!testFaultsEnabled()) return;
  if ((await cookies()).get(COOKIE)?.value === fault) throw new Error(`test fault: ${fault}`);
}
