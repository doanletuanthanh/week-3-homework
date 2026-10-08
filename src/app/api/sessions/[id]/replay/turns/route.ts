import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import type { ReplayOutcome } from "@/engine/replay-result";
import { requireAckedApiUser } from "@/server/auth";
import { runReplayTurn, type ReplayTurnError, type ReplayTurnResult } from "@/server/replay";
import { isUuid } from "@/server/uuid";

// Above the time budget of one replay turn (110 s for its three calls).
export const maxDuration = 300;

const STATUS: Record<ReplayTurnError, number> = {
  invalid_input: 400,
  not_found: 404,
  replay_ended: 409,
  in_flight: 409,
  conflict: 409,
  llm_failed: 502,
};

type Done = { personaText: string; replayTurnIndex: number; unchecked: boolean; outcome?: ReplayOutcome };

/** One event per line: persona text, that the judge has started, then the turn count or an error state. */
type StreamEvent = { type: "delta"; text: string } | { type: "checking" } | ({ type: "done" } & Done) | { type: "error"; error: ReplayTurnError | "server_error" };

/** `outcome` is in the answer only from the turn that ended the replay: until then nothing of the target leaves the server. */
function done(result: Extract<ReplayTurnResult, { ok: true }>): Done {
  const { personaText, replayTurnIndex, unchecked, outcome } = result;
  return { personaText, replayTurnIndex, unchecked, ...(outcome ? { outcome } : {}) };
}

/**
 * One learner question of the replay in, one persona reply out, streamed like a main turn. After
 * the reply the judge runs ("Đang kiểm tra…"), and only then is the turn written. Everything
 * decided before the persona starts talking is answered as plain JSON with its HTTP status. A
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

  const turn: Promise<ReplayTurnResult | { ok: false; error: "server_error" }> = runReplayTurn(getDb(), auth.user, id, body, {
    onPersonaDelta: (text) => {
      streaming!();
      void send({ type: "delta", text });
    },
    onJudging: () => void send({ type: "checking" }),
  }).catch((error: unknown) => {
    console.error(error);
    return { ok: false as const, error: "server_error" as const };
  });

  // Whichever comes first: the first piece of the reply, or the whole outcome.
  const first = await Promise.race([started, turn]);
  if (first !== "stream") {
    void writer.close().catch(() => {});
    if (first.ok) return NextResponse.json(done(first));
    return NextResponse.json({ error: first.error }, { status: first.error === "server_error" ? 500 : STATUS[first.error] });
  }

  const finished = turn.then(async (result) => {
    await send(result.ok ? { type: "done", ...done(result) } : { type: "error", error: result.error });
    await writer.close().catch(() => {});
  });
  // Keeps the function alive until the turn is committed or its claim released, even when the
  // browser has gone away mid-stream.
  after(() => finished);
  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
