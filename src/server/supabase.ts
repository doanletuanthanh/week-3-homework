import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase Auth client bound to this request's cookies. Used for auth only; data goes through Drizzle. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot write cookies; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
