import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { recordTakeawayDownload } from "@/server/reveal";
import { isUuid } from "@/server/uuid";

/** "Tải về" was pressed. The page prints by itself; this only reports it, so the event is written by the server. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const outcome = await recordTakeawayDownload(getDb(), auth.user, id);
  if (outcome === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (outcome === "not_done") return NextResponse.json({ error: "not_done" }, { status: 409 });
  return NextResponse.json({ recorded: true });
}
