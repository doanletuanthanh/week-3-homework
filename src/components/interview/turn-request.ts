import type { ReplayOutcome } from "@/engine/replay-result";
import { isMobileViewport } from "@/hooks/use-is-mobile";

type Failed = { ok: false; error: string; redirectTo?: string };

export type TurnOutcome = { ok: true; personaText: string; turnIndex: number } | Failed;

/** A replay turn: the reply, its number (1 to 3), and from the turn that ends the replay, its outcome. */
export type ReplayTurnOutcome = { ok: true; personaText: string; replayTurnIndex: number; unchecked: boolean; outcome?: ReplayOutcome } | Failed;

type StreamHandlers = { onDelta: (text: string) => void; onChecking?: () => void };

/**
 * Reads a turn API. A reply that streams arrives as one JSON event per line; everything else
 * (errors before the persona starts, a reply already stored) is a plain JSON body. Returns the
 * fields of the answer that ended the turn.
 */
async function readTurnResponse(response: Response, handlers: StreamHandlers): Promise<{ ok: true; fields: Record<string, unknown> } | Failed> {
  if (!response.headers.get("content-type")?.includes("ndjson") || !response.body) {
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, fields: body };
    return { ok: false, error: body.error ?? "unknown", redirectTo: body.redirectTo };
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === "delta") handlers.onDelta(event.text);
      else if (event.type === "checking") handlers.onChecking?.();
      else if (event.type === "done") return { ok: true, fields: event };
      else return { ok: false, error: event.error };
    }
  }
  // The stream stopped before saying how the turn ended.
  return { ok: false, error: "unknown" };
}

type TurnBody = { text: string; turnKey: string; expectedIndex: number };

async function post(url: string, body: TurnBody, handlers: StreamHandlers) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-class": isMobileViewport() ? "mobile" : "desktop" },
      body: JSON.stringify(body),
    });
    return await readTurnResponse(response, handlers);
  } catch {
    return { ok: false as const, error: "unknown" };
  }
}

/** Sends one question. Never throws: a request that could not be made is the `unknown` error. */
export async function postTurn(sessionId: string, body: TurnBody, onDelta: (text: string) => void): Promise<TurnOutcome> {
  const reply = await post(`/api/sessions/${sessionId}/turns`, body, { onDelta });
  if (!reply.ok) return reply;
  const { personaText, turnIndex } = reply.fields as { personaText: string; turnIndex: number };
  return { ok: true, personaText, turnIndex };
}

/** Sends one replay question. `onChecking` is called when the reply is complete and the judge starts. */
export async function postReplayTurn(sessionId: string, body: TurnBody, handlers: Required<StreamHandlers>): Promise<ReplayTurnOutcome> {
  const reply = await post(`/api/sessions/${sessionId}/replay/turns`, body, handlers);
  if (!reply.ok) return reply;
  const { personaText, replayTurnIndex, unchecked, outcome } = reply.fields as Omit<Extract<ReplayTurnOutcome, { ok: true }>, "ok">;
  return { ok: true, personaText, replayTurnIndex, unchecked, outcome };
}

/** `data` is the parsed body of a successful answer. */
export type PlainOutcome = { ok: true; data: unknown } | Failed;

/** A JSON request to one of the session's other routes (notes, end, replay). Never throws. */
export async function sendJson(url: string, method: "PUT" | "POST", body: unknown): Promise<PlainOutcome> {
  try {
    // `keepalive` lets a save that starts while the page is closing still reach the server.
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    const answer = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, data: answer };
    return { ok: false, error: answer.error ?? "unknown", redirectTo: answer.redirectTo };
  } catch {
    return { ok: false, error: "unknown" };
  }
}
