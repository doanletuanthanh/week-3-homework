import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { saveCanvas, type CanvasError } from "@/server/canvas";
import { isUuid } from "@/server/uuid";

const STATUS: Record<CanvasError, number> = { invalid_input: 400, not_found: 404, frozen: 409 };

/** Autosave of the notes canvas. Answers only whether the text was saved. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: unknown = await request.json().catch(() => null);
  const result = await saveCanvas(getDb(), auth.user, id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  return NextResponse.json({ saved: true });
}
