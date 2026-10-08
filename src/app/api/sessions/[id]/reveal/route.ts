import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireAckedApiUser } from "@/server/auth";
import { getRevealView, runReveal } from "@/server/reveal";
import { isUuid } from "@/server/uuid";

// A reveal whose runner died is restarted from here, after the response.
export const maxDuration = 300;

const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 * The reveal of the learner's own session, as a browser may see it: `{ready: false}` until the
 * guess is stored and the result exists, then the sealed-filtered result. Reading it calls no
 * model. When the result is missing and no runner is alive, one is started; any number of tabs
 * polling at once start at most one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const view = await getRevealView(getDb(), auth.user, id);
  if (!view.found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (view.ready) return NextResponse.json({ ready: true, reveal: view.reveal }, NO_STORE);
  if (view.due) after(() => runReveal(getDb(), id).catch((error: unknown) => console.error(error)));
  return NextResponse.json({ ready: false }, NO_STORE);
}
