/**
 * Returns `raw` only when it is a path on this site; anything else becomes "/".
 * Used for every redirect target that arrives in a URL or a form field.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/";
  try {
    const url = new URL(raw, "http://localhost");
    if (url.origin !== "http://localhost") return "/";
    // Checked after normalisation: "/.//host" collapses to "//host", which a browser reads as another origin.
    const path = url.pathname + url.search;
    if (path.startsWith("//") || path.startsWith("/\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}
