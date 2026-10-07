import { useSyncExternalStore } from "react";

/** PRD §6.0: narrower than 768px is mobile. */
const MOBILE_QUERY = "(max-width: 767.98px)";

/** For event handlers. Not for rendering: the server cannot know the answer. */
export function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** For rendering. The server render and the first client render say desktop. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, isMobileViewport, () => false);
}
