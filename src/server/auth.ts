import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv, type Env } from "@/config/env";
import { getDb, type Executor } from "@/db/client";
import { upsertUser } from "@/db/repo/users";
import { DATA_NOTICE_VERSION } from "@/strings/product-strings";
import { verifyClaims } from "./auth-claims";
import { createSupabaseServerClient } from "./supabase";

export type AppUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  isDemo: boolean;
  /** True when the learner accepted the current version of the data notice. */
  noticeAcked: boolean;
};

/**
 * Turns verified token claims into the app user: rejects anything that is not a verified Google
 * account, creates or updates the `user` row, and derives the admin and demo flags from env.
 */
export async function resolveUser(
  db: Executor,
  claims: unknown,
  env: Pick<Env, "ADMIN_EMAILS" | "DEMO_ACCOUNT_EMAILS">,
): Promise<AppUser | null> {
  const identity = verifyClaims(claims);
  if (!identity) return null;
  const row = await upsertUser(db, identity);
  return {
    id: row.id,
    email: row.email,
    isAdmin: env.ADMIN_EMAILS.includes(row.email),
    isDemo: env.DEMO_ACCOUNT_EMAILS.includes(row.email),
    noticeAcked: row.visibilityAckVersion === DATA_NOTICE_VERSION,
  };
}

/** The signed-in learner for this request, or null. Verified once per request. */
export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return resolveUser(getDb(), data.claims, getEnv());
});

export function signInPath(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

export function noticePath(next: string): string {
  return `/data-notice?next=${encodeURIComponent(next)}`;
}

/** For pages and server actions: sends a signed-out visitor to sign-in, returning to `next`. */
export async function requireUser(next: string): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect(signInPath(next));
  return user;
}

/** As `requireUser`, and the learner must have accepted the current data notice (Màn 0). */
export async function requireAckedUser(next: string): Promise<AppUser> {
  const user = await requireUser(next);
  if (!user.noticeAcked) redirect(noticePath(next));
  return user;
}

export type ApiAuth =
  | { ok: true; user: AppUser }
  | { ok: false; status: 401 | 403; body: { error: "unauthorized" | "notice_required"; redirectTo: string } };

/** For route handlers, which answer with JSON instead of redirecting. `next` is where the client resumes. */
export async function requireAckedApiUser(next: string): Promise<ApiAuth> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401, body: { error: "unauthorized", redirectTo: signInPath(next) } };
  if (!user.noticeAcked) {
    return { ok: false, status: 403, body: { error: "notice_required", redirectTo: noticePath(next) } };
  }
  return { ok: true, user };
}
