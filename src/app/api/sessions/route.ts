import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { listSessions } from "@/server/session-list";

/** "Tải thêm" on Buổi của tôi: the learner's own sessions from `offset` on, newest first. */
export async function GET(request: Request) {
  const auth = await requireAckedApiUser("/my-sessions");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const raw = new URL(request.url).searchParams.get("offset") ?? "0";
  const offset = Number(raw);
  if (!/^\d{1,9}$/u.test(raw)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { items, nextOffset } = await listSessions(getDb(), auth.user, offset);
  return NextResponse.json({ items, nextOffset }, { headers: { "cache-control": "no-store" } });
}
