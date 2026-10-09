import { after, NextResponse } from "next/server";
import { GENERATION_RUN_LIMIT_MS } from "@/config/limits";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { submitCustomTopic } from "@/server/custom-topic";
import { runGeneration } from "@/server/generation";

// The scenario is prepared after the response, in this same function. A run stops itself at
// 270 s, below the platform's 300 s; what is left is done by a later run (see `runGeneration`).
export const maxDuration = 300;

const STATUS = { invalid_input: 400, refused: 422, no_identity: 403, llm_failed: 502, blocked: 409 } as const;

/**
 * "Tạo kịch bản" (Màn 10). Moderation runs inside this request, before anything exists. An
 * accepted topic answers with the session that is being prepared; the runner then starts.
 */
export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const auth = await requireAckedApiUser("/custom-topic");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body: unknown = await request.json().catch(() => null);
  const result = await submitCustomTopic(getDb(), auth.user, body, { requestStartedAt });
  if (!result.ok) {
    const detail = result.error === "blocked" ? { block: result.block, runningSessionId: result.runningSessionId } : {};
    return NextResponse.json({ error: result.error, ...detail }, { status: STATUS[result.error] });
  }

  // The function has been alive since the request started: moderation used part of its time.
  const runLimitMs = Math.max(1_000, GENERATION_RUN_LIMIT_MS - (Date.now() - requestStartedAt));
  after(() => runGeneration(getDb(), result.attemptId, { runLimitMs }).catch((error: unknown) => console.error(error)));
  return NextResponse.json({ sessionId: result.sessionId, attemptId: result.attemptId });
}
