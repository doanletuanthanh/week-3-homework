import type { APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type TurnStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; personaText: string; turnIndex: number }
  | { type: "error"; error: string };

export type TurnApiReply = {
  status: number;
  contentType: string;
  /** The whole response body as sent, for checks on everything that reached the browser. */
  raw: string;
  /** Set when the reply was streamed: one event per line. */
  events: TurnStreamEvent[] | null;
  /** Set when the reply was a plain JSON body. */
  json: Record<string, unknown> | null;
};

/** Posts one question to the turn API the way the page does, and reads either kind of reply. */
export async function postTurn(
  request: APIRequestContext,
  sessionId: string,
  body: { text: unknown; expectedIndex?: unknown; turnKey?: unknown } | string,
): Promise<TurnApiReply> {
  const data = typeof body === "string" ? body : { turnKey: randomUUID(), ...body };
  const response = await request.post(`/api/sessions/${sessionId}/turns`, {
    data,
    headers: { "content-type": "application/json" },
  });
  const raw = await response.text();
  const contentType = response.headers()["content-type"] ?? "";
  const streamed = contentType.includes("ndjson");
  return {
    status: response.status(),
    contentType,
    raw,
    events: streamed ? raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TurnStreamEvent) : null,
    json: streamed ? null : (JSON.parse(raw || "null") as Record<string, unknown> | null),
  };
}

/** The persona text and turn index of a successful reply, streamed or stored. */
export function turnOutcome(reply: TurnApiReply): { personaText: string; turnIndex: number } | null {
  const done = reply.events?.find((event) => event.type === "done");
  if (done?.type === "done") return { personaText: done.personaText, turnIndex: done.turnIndex };
  if (reply.status === 200 && reply.json) return reply.json as { personaText: string; turnIndex: number };
  return null;
}
