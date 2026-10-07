import { z } from "zod";
import { CANVAS_FREEZE_GRACE_MS, MAX_CANVAS_CHARS } from "@/config/limits";
import type { Database, Executor } from "@/db/client";
import { endAndFreeze, freezeEndedCanvas, saveCanvasText } from "@/db/repo/canvas";
import type { SessionRow } from "@/db/repo/sessions";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";

/** The notes as typed: not trimmed, and the length is checked here whatever the browser allowed. */
// Postgres text cannot hold a NUL character.
const canvasText = z.string().max(MAX_CANVAS_CHARS).refine((text) => !text.includes("\u0000"));

/** Body of the notes autosave. */
export const canvasInputSchema = z.object({ text: canvasText });
/** Body of the end request: the notes as they are on screen, including text not yet autosaved. */
export const endInputSchema = z.object({ canvasText });

export type CanvasError = "invalid_input" | "not_found" | "frozen";
export type CanvasResult = { ok: true } | { ok: false; error: CanvasError };

/** Silent autosave of the notes. Nothing reads them before the session ends. */
export async function saveCanvas(db: Database, user: AppUser, sessionId: string, rawInput: unknown): Promise<CanvasResult> {
  const input = canvasInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const outcome = await saveCanvasText(db, { userId: user.id, sessionId, text: input.data.text });
  return outcome === "saved" ? { ok: true } : { ok: false, error: outcome };
}

/** The end event carries what SM-9 counts: whether the frozen notes were empty. */
function recordEnd(text: string) {
  return (tx: Executor, session: SessionRow) =>
    recordEvent(
      tx,
      { userId: session.userId, sessionId: session.id, isDemo: session.isDemo },
      { name: "session_ended", props: { canvas_empty: text.trim() === "", device_class: session.deviceClass } },
    );
}

export type EndError = "invalid_input" | "not_found" | "session_ended" | "in_flight";
export type EndResult = { ok: true } | { ok: false; error: EndError };

/**
 * "Kết thúc buổi", and the request the browser sends by itself after turn 30. Ends the session
 * and freezes the notes sent with it. Ending a session that already ended with frozen notes
 * succeeds and changes nothing, so a repeated request is harmless.
 */
export async function endSession(db: Database, user: AppUser, sessionId: string, rawInput: unknown): Promise<EndResult> {
  const input = endInputSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "invalid_input" };
  const text = input.data.canvasText;
  const outcome = await endAndFreeze(db, { userId: user.id, sessionId, canvasText: text }, recordEnd(text));
  if (outcome === "ended" || outcome === "already_frozen") return { ok: true };
  return { ok: false, error: outcome === "not_interviewing" ? "session_ended" : outcome };
}

/**
 * Fallback for a session that turn 30 ended while the browser went away: freezes the notes as
 * last autosaved. `graceMs` is how long the browser is given to send the final notes first.
 */
export async function freezeAbandonedCanvas(db: Database, sessionId: string, graceMs: number = CANVAS_FREEZE_GRACE_MS): Promise<boolean> {
  return freezeEndedCanvas(db, { sessionId, graceMs }, (tx, session) => recordEnd(session.canvasText)(tx, session));
}
