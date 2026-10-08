import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { getTranscriptView } from "@/server/reveal";
import { isUuid } from "@/server/uuid";

/** The main transcript of the learner's own session, with only the marks its state allows. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const turns = await getTranscriptView(getDb(), auth.user, id);
  if (!turns) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ turns }, { headers: { "cache-control": "no-store" } });
}
