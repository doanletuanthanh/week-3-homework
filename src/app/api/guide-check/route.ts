import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { checkGuide } from "@/server/guide-check";

/** Moderation and the check each have their retries. */
export const maxDuration = 300;

const STATUS = { invalid_input: 400, limit: 429, over_cap: 503, refused: 422, llm_failed: 502 } as const;

/** "Kiểm tra bộ câu hỏi": one model call per guide, within the learner's daily limit. */
export async function POST(request: Request) {
  const auth = await requireAckedApiUser("/guide-check");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const result = await checkGuide(getDb(), auth.user, await request.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  return NextResponse.json(result);
}
