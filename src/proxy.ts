import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/server/content-security-policy";

const CSP_HEADER = "Content-Security-Policy";

/**
 * Refreshes the Supabase session cookie and sets the Content-Security-Policy. It authorises
 * nothing: every page, server action and route handler verifies the user itself.
 */
export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy({
    nonce: btoa(crypto.randomUUID()),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  // Next.js reads the nonce from the policy on the request and puts it on its own scripts.
  request.headers.set(CSP_HEADER, csp);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getClaims();
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
