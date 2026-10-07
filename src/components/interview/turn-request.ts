import { isMobileViewport } from "@/hooks/use-is-mobile";

export type TurnOutcome =
  | { ok: true; personaText: string; turnIndex: number }
  | { ok: false; error: string; redirectTo?: string };

/**
 * Reads the turn API. A reply that streams arrives as one JSON event per line; everything else
 * (errors before the persona starts, a reply already stored) is a plain JSON body.
 */
async function readTurnResponse(response: Response, onDelta: (text: string) => void): Promise<TurnOutcome> {
  if (!response.headers.get("content-type")?.includes("ndjson") || !response.body) {
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, personaText: body.personaText, turnIndex: body.turnIndex };
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
      if (event.type === "delta") onDelta(event.text);
      else if (event.type === "done") return { ok: true, personaText: event.personaText, turnIndex: event.turnIndex };
      else return { ok: false, error: event.error };
    }
  }
  // The stream stopped before saying how the turn ended.
  return { ok: false, error: "unknown" };
}

/** Sends one question. Never throws: a request that could not be made is the `unknown` error. */
export async function postTurn(
  sessionId: string,
  body: { text: string; turnKey: string; expectedIndex: number },
  onDelta: (text: string) => void,
): Promise<TurnOutcome> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-class": isMobileViewport() ? "mobile" : "desktop" },
      body: JSON.stringify(body),
    });
    return await readTurnResponse(response, onDelta);
  } catch {
    return { ok: false, error: "unknown" };
  }
}

export type PlainOutcome = { ok: true } | { ok: false; error: string; redirectTo?: string };

/** A JSON request to one of the session's other routes (notes, end). Never throws. */
export async function sendJson(url: string, method: "PUT" | "POST", body: unknown): Promise<PlainOutcome> {
  try {
    // `keepalive` lets a save that starts while the page is closing still reach the server.
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    if (response.ok) return { ok: true };
    const answer = await response.json().catch(() => ({}));
    return { ok: false, error: answer.error ?? "unknown", redirectTo: answer.redirectTo };
  } catch {
    return { ok: false, error: "unknown" };
  }
}
