import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { resolveUser } from "@/server/auth";
import { adoptRememberedRoleFilter } from "@/server/role-filter";
import { safeNextPath } from "@/server/safe-next";
import { createSupabaseServerClient } from "@/server/supabase";

/** OAuth return: exchanges the code for a session, then continues to the same-origin `next` path. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const failure = NextResponse.redirect(`${origin}/sign-in?error=1&next=${encodeURIComponent(next)}`);

  const code = searchParams.get("code");
  if (!code) return failure;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failure;

  // A session that is not a verified Google account is dropped at once.
  // Read from the client that just received the session, not from a second read of the cookies.
  const { data } = await supabase.auth.getClaims();
  const user = data && (await resolveUser(getDb(), data.claims, getEnv()));
  if (!user) {
    await supabase.auth.signOut();
    return failure;
  }
  // A library filter chosen as a guest goes onto the account; a learner yet to consent keeps it in the browser until Màn 0.
  await adoptRememberedRoleFilter(getDb(), user);
  return NextResponse.redirect(`${origin}${next}`);
}
