"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { acknowledgeNotice } from "@/db/repo/users";
import { DATA_NOTICE_VERSION } from "@/strings/product-strings";
import { getUser, noticePath, requireAckedUser, requireUser } from "./auth";
import { resumePendingAction, storePendingAction } from "./pending-actions";
import { safeNextPath } from "./safe-next";
import { openSession, sessionEntryPath } from "./sessions";
import { createSupabaseServerClient } from "./supabase";

/** Where a resumed pending action is performed after sign-in and consent. */
const RESUME_PATH = "/resume";

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/** Sends the browser to Google; Supabase returns it to /auth/callback, which continues to `next`. */
async function redirectToGoogle(next: string): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/sign-in?error=1&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  await redirectToGoogle(safeNextPath(formData.get("next") as string | null));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** "Bắt đầu" on the prep screen. Guests and learners without consent continue after sign-in and Màn 0. */
export async function startSession(formData: FormData): Promise<void> {
  const personaId = String(formData.get("personaId") ?? "");
  const user = await getUser();

  if (user?.noticeAcked) {
    redirect(sessionEntryPath(await openSession(getDb(), user, personaId), personaId));
  }

  // A guest can reach this line, so nothing is stored for a persona that does not exist.
  if (!(await getScenarioByPersona(getDb(), personaId))) redirect("/");
  await storePendingAction(user, { kind: "start_session", personaId });
  if (!user) await redirectToGoogle(RESUME_PATH);
  redirect(noticePath(RESUME_PATH));
}

/** "Tôi hiểu" on Màn 0: stores consent with its version and time, then resumes what the learner started. */
export async function acceptDataNotice(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next") as string | null);
  const user = await requireUser(next);
  await acknowledgeNotice(getDb(), user.id, DATA_NOTICE_VERSION);

  const resumed = await resumePendingAction({ ...user, noticeAcked: true });
  redirect(resumed ?? (next === RESUME_PATH ? "/" : next));
}

/** Posted by the resume page for a learner who already gave consent. */
export async function resumeAfterSignIn(): Promise<void> {
  const user = await requireAckedUser(RESUME_PATH);
  redirect((await resumePendingAction(user)) ?? "/");
}
