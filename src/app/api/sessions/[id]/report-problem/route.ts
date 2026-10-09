import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { reportCustomProblem } from "@/server/custom-topic";
import { isUuid } from "@/server/uuid";

/** "Kịch bản này có vấn đề" (FR-56): the learner's own custom session, from its reveal on. Pressing again changes nothing. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id) || !(await reportCustomProblem(getDb(), auth.user, id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ reported: true });
}
