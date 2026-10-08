import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { joinWaitlist } from "@/db/repo/waitlist";
import { WAITLIST_CONTEXTS } from "@/db/schema";
import { requireAckedApiUser } from "@/server/auth";
import { recordEvent } from "@/server/events";

const inputSchema = z.object({ context: z.enum(WAITLIST_CONTEXTS) });

/** "Báo tôi khi có" (FR-32): one row per learner and context, however often it is pressed. */
export async function POST(request: Request) {
  const auth = await requireAckedApiUser("/");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { user } = auth;
  const { context } = input.data;
  await getDb().transaction(async (tx) => {
    if (await joinWaitlist(tx, user.id, context)) {
      await recordEvent(tx, { userId: user.id, sessionId: null, isDemo: user.isDemo }, { name: "waitlist_joined", props: { context } });
    }
  });
  return NextResponse.json({ joined: true });
}
