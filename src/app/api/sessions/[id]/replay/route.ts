import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { skipReplay, startReplay, stopReplay, type ReplayActionError } from "@/server/replay";
import { isUuid } from "@/server/uuid";

const STATUS: Record<ReplayActionError, number> = { not_found: 404, not_offered: 409, not_replaying: 409, in_flight: 409 };

const bodySchema = z.object({ action: z.enum(["start", "skip", "stop"]) });

/**
 * The three things a learner can do with the replay their reveal offers: start it ("Quay lại lượt
 * N"), skip it ("Bỏ qua, cho tôi xem luôn"), or stop it while it runs ("Dừng"). Starting answers
 * only that it started. Skipping and stopping end the replay, so the session is `done` and its
 * page shows what was held; the answer to a stop carries the outcome, which is no longer sealed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = getDb();
  if (body.data.action === "stop") {
    const stopped = await stopReplay(db, auth.user, id);
    if (!stopped.ok) return NextResponse.json({ error: stopped.error }, { status: STATUS[stopped.error] });
    return NextResponse.json({ outcome: stopped.outcome });
  }
  const result = body.data.action === "start" ? await startReplay(db, auth.user, id) : await skipReplay(db, auth.user, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  return NextResponse.json({ ok: true });
}
