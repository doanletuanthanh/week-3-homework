import { useEffect, useRef, useState } from "react";
import { CANVAS_AUTOSAVE_DELAY_MS, CANVAS_AUTOSAVE_RETRY_MS } from "@/config/limits";

/** `retry`: the save failed and is tried again. `stop`: nothing will ever be saved again (frozen, signed out). */
export type SaveOutcome = "saved" | "retry" | "stop";

export type AutosaveState = {
  /** The text the server is known to hold. */
  saved: string;
  /** Failed saves in a row. */
  failures: number;
};

export type Autosaver = {
  /** The text changed: it is saved once the learner pauses. */
  change(text: string): void;
  /** Saves now instead of waiting for the pause. */
  flush(): void;
  stop(): void;
};

/**
 * Saves a text some time after its last change. One save runs at a time, always with the newest
 * text; a failed save is tried again later, and the text typed meanwhile is never lost because
 * the caller keeps it.
 */
export function createAutosaver(options: {
  initial: string;
  save: (text: string) => Promise<SaveOutcome>;
  onState: (state: AutosaveState) => void;
  delayMs?: number;
  retryMs?: number;
}): Autosaver {
  const delayMs = options.delayMs ?? CANVAS_AUTOSAVE_DELAY_MS;
  const retryMs = options.retryMs ?? CANVAS_AUTOSAVE_RETRY_MS;
  let saved = options.initial;
  let latest = options.initial;
  let failures = 0;
  /** The text of the save that is on its way, if any. */
  let inFlight: string | null = null;
  let saving = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(ms: number) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  }

  async function run() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (stopped || saving || latest === saved) return;

    saving = true;
    const text = latest;
    inFlight = text;
    const outcome = await options.save(text).catch((): SaveOutcome => "retry");
    saving = false;
    inFlight = null;
    if (stopped) return;
    if (outcome === "stop") {
      stopped = true;
      return;
    }

    if (outcome === "saved") {
      saved = text;
      failures = 0;
    } else {
      failures += 1;
    }
    options.onState({ saved, failures });
    // Text typed during the save, or the text that failed, still has to go out.
    if (latest !== saved && timer === null) schedule(outcome === "saved" ? delayMs : retryMs);
  }

  return {
    change(text) {
      latest = text;
      if (!stopped && !saving) schedule(delayMs);
    },
    flush() {
      // The page is going away: newer text cannot wait for the save that is on its way.
      if (saving && !stopped && latest !== inFlight) void options.save(latest).catch(() => {});
      else void run();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Autosaves `draft` (text the server may not have; null when there is none) while `active`.
 * Leaving the page saves at once instead of waiting for the pause.
 */
export function useAutosave(
  draft: string | null,
  initialSaved: string,
  save: (text: string) => Promise<SaveOutcome>,
  active: boolean,
): AutosaveState {
  const [state, setState] = useState<AutosaveState>({ saved: initialSaved, failures: 0 });
  const saved = useRef(initialSaved);
  const autosaver = useRef<Autosaver | null>(null);

  useEffect(() => {
    if (!active) return;
    const created = createAutosaver({
      initial: saved.current,
      save,
      onState: (next) => {
        saved.current = next.saved;
        setState(next);
      },
    });
    autosaver.current = created;
    const flush = () => created.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      created.stop();
      autosaver.current = null;
    };
  }, [save, active]);

  useEffect(() => {
    if (draft !== null && active) autosaver.current?.change(draft);
  }, [draft, active]);

  return state;
}
