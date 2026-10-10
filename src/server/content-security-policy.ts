type Options = {
  /** Fresh for every request; Next.js puts it on the scripts it writes into the page. */
  nonce: string;
  /** `NEXT_PUBLIC_SUPABASE_URL`: the first stop of the Google sign-in. */
  supabaseUrl: string | undefined;
  /** `next dev` evaluates strings and talks to its own websocket. */
  dev: boolean;
};

/** Where the sign-in form may end up after its redirects: the auth server, then Google. */
function signInOrigins(supabaseUrl: string | undefined): string[] {
  try {
    return supabaseUrl ? [new URL(supabaseUrl).origin, "https://accounts.google.com"] : [];
  } catch {
    return [];
  }
}

/**
 * The Content-Security-Policy of every response. Scripts run only with this request's nonce, so
 * learner text that reached the page as markup could still not run. The browser talks to this
 * origin alone: Supabase and the model providers are reached from the server.
 *
 * `style-src` allows inline styles because components size blocks with `style` attributes, which
 * a nonce cannot cover. `form-action` names the sign-in's redirects because browsers apply it to
 * each of them when the form is posted before the page's scripts have loaded.
 */
export function contentSecurityPolicy({ nonce, supabaseUrl, dev }: Options): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "form-action": ["'self'", ...signInOrigins(supabaseUrl)],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
