import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { endSession, type EndError } from "@/server/canvas";
import { runReveal } from "@/server/reveal";
import { isUuid } from "@/server/uuid";

// The three reveal calls run after the response, each with its own timeout and retries.
export const maxDuration = 300;

const STATUS: Record<EndError, number> = { invalid_input: 400, not_found: 404, session_ended: 409, in_flight: 409 };

/**
 * "Kết thúc buổi": ends the session and freezes the notes sent with the request. The reveal
 * starts here, while the learner is still on the guess screen.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: unknown = await request.json().catch(() => null);
  const result = await endSession(getDb(), auth.user, id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  // A repeated end request finds the reveal claimed or finished and starts nothing.
  after(() => runReveal(getDb(), id).catch((error: unknown) => console.error(error)));
  return NextResponse.json({ ended: true });
}
