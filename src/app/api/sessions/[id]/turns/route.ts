import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { runSkeletonTurn, type TurnError } from "@/server/turns";
import { isUuid } from "@/server/uuid";

// Must outlast every attempt of the model call (3 x 45 s), or a retry is cut off unrecorded.
export const maxDuration = 150;

const STATUS: Record<TurnError, number> = {
  invalid_text: 400,
  not_found: 404,
  conflict: 409,
  turn_limit: 409,
  llm_failed: 502,
};

/** One learner question in, one persona reply out. The response carries nothing else. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const result = await runSkeletonTurn(getDb(), auth.user, id, body?.text);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });

  return NextResponse.json({ personaText: result.personaText, turnIndex: result.turnIndex });
}
