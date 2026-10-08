import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getUser, signInPath } from "@/server/auth";
import { deleteAccount } from "@/server/delete-account";
import { createSupabaseServerClient } from "@/server/supabase";
import { DELETE_CONFIRM_WORD } from "@/strings/product-strings";

const inputSchema = z.object({ confirm: z.literal(DELETE_CONFIRM_WORD) });

/**
 * "Xóa vĩnh viễn" (FR-66): removes the account and its data in one transaction, then ends the
 * sign-in. A learner who never accepted the data notice can delete their account too.
 */
export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized", redirectTo: signInPath("/my-sessions") }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await deleteAccount(getDb(), user);
  if (!result.ok && result.error === "generating") return NextResponse.json({ error: "generating" }, { status: 409 });
  // `not_found`: another tab deleted the account a moment ago. What is left to do is the same.

  // The account is gone, so the auth server may refuse this sign-out; the cookies are removed either way.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => {});
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) cookieStore.delete(name);
  }
  return NextResponse.json({ deleted: true });
}
