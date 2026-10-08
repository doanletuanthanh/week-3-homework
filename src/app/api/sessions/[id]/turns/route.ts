import { after, NextResponse } from "next/server";
import { CANVAS_FREEZE_GRACE_MS, MAX_TURNS } from "@/config/limits";
import { getDb } from "@/db/client";
import { DEVICE_CLASSES, type DeviceClass } from "@/db/schema";
import { requireAckedApiUser } from "@/server/auth";
import { freezeAbandonedCanvas } from "@/server/canvas";
import { runReveal } from "@/server/reveal";
import { runTurn, type TurnError, type TurnResult } from "@/server/turns";
import { isUuid } from "@/server/uuid";

// Above the time budget of one turn (110 s) plus the wait before the notes of a session that
// turn 30 ended are frozen (60 s), with room left for the reveal that the freeze starts.
export const maxDuration = 300;

/** The browser reports its screen class in a header (FR-38); anything else is ignored. */
function deviceClassOf(request: Request): DeviceClass | undefined {
  const value = request.headers.get("x-device-class");
  return DEVICE_CLASSES.find((deviceClass) => deviceClass === value);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS: Record<TurnError, number> = {
  invalid_input: 400,
  not_found: 404,
  session_ended: 409,
  turn_limit: 409,
  in_flight: 409,
  conflict: 409,
  llm_failed: 502,
};

/** One event per line. Persona text first, then the turn count or an error state; nothing else. */
type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; personaText: string; turnIndex: number }
  | { type: "error"; error: TurnError | "server_error" };

/**
 * One learner question in, one persona reply out.
 *
 * The reply is streamed as newline-delimited JSON once the persona starts talking. Everything
 * decided before that (bad input, a stale tab, a turn already running, a failed analysis call,
 * a reply already stored for this `turnKey`) is answered as plain JSON with its HTTP status. A
 * stream that ends in an `error` event wrote no turn: the browser drops the partial text.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAckedApiUser(`/sessions/${id}`);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: unknown = await request.json().catch(() => null);
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const send = (event: StreamEvent) => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});

  let streaming: (() => void) | undefined;
  const started = new Promise<"stream">((resolve) => (streaming = () => resolve("stream")));

  const turn: Promise<TurnResult | { ok: false; error: "server_error" }> = runTurn(getDb(), auth.user, id, body, {
    deviceClass: deviceClassOf(request),
    onPersonaDelta: (text) => {
      streaming!();
      void send({ type: "delta", text });
    },
  }).catch((error: unknown) => {
    console.error(error);
    return { ok: false as const, error: "server_error" as const };
  });

  // Turn 30 ended the session. The browser follows with the end request carrying the notes as
  // typed; when it never does, the notes are frozen as last autosaved and the reveal starts from them.
  after(async () => {
    const result = await turn;
    if (!result.ok || result.turnIndex < MAX_TURNS) return;
    await sleep(CANVAS_FREEZE_GRACE_MS);
    try {
      if (await freezeAbandonedCanvas(getDb(), id)) await runReveal(getDb(), id);
    } catch (error) {
      console.error(error);
    }
  });

  // Whichever comes first: the first piece of the reply, or the whole outcome.
  const first = await Promise.race([started, turn]);
  if (first !== "stream") {
    void writer.close().catch(() => {});
    if (first.ok) return NextResponse.json({ personaText: first.personaText, turnIndex: first.turnIndex });
    return NextResponse.json({ error: first.error }, { status: first.error === "server_error" ? 500 : STATUS[first.error] });
  }

  const finished = turn.then(async (result) => {
    await send(result.ok ? { type: "done", personaText: result.personaText, turnIndex: result.turnIndex } : { type: "error", error: result.error });
    await writer.close().catch(() => {});
  });
  // Keeps the function alive until the turn is committed or its claim released, even when the
  // browser has gone away mid-stream.
  after(() => finished);
  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
