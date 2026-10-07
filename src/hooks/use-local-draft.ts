import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "il:draft:";

/** What this page wrote, so a draft still works when the browser refuses `localStorage`. */
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

/**
 * Text the learner typed that the server does not have yet (an unsent question, unsaved notes).
 * It is kept in `localStorage`, so it is still there after a reload or a sign-in round trip.
 */
export function readDraft(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Stores the draft, or removes it with `null`. A browser without storage keeps it for this page only. */
export function writeDraft(key: string, text: string | null): void {
  memory.set(key, text);
  try {
    if (text === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, text);
  } catch {
    // Private mode or a full quota: the copy in memory is all there is.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The draft under `key` (null when there is none) and its setter. The server render has no draft. */
export function useLocalDraft(key: string): [string | null, (text: string | null) => void] {
  const draft = useSyncExternalStore(
    subscribe,
    () => readDraft(key),
    () => null,
  );
  const setDraft = useCallback((text: string | null) => writeDraft(key, text), [key]);
  return [draft, setDraft];
}
