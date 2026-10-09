import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { getAttemptView, runGeneration } from "@/server/generation";
import { isUuid } from "@/server/uuid";

// A run that has to be started from here works after the response, in this function.
export const maxDuration = 300;

/**
 * Where the learner's own attempt stands: its step while it runs, then its outcome. Nothing of
 * what was generated is in the answer. Someone else's attempt is "not found". When the attempt
 * has no live runner (the function that worked on it was cut off), the next run starts here; any
 * number of tabs polling at once start at most one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const auth = await requireAckedApiUser("/my-sessions");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(attemptId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const view = await getAttemptView(getDb(), auth.user, attemptId);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (view.due) after(() => runGeneration(getDb(), attemptId).catch((error: unknown) => console.error(error)));
  return NextResponse.json(view.status, { headers: { "cache-control": "no-store" } });
}
