"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getSession, getVisibleScenario } from "@/db/repo/sessions";
import { acknowledgeNotice } from "@/db/repo/users";
import { DATA_NOTICE_VERSION } from "@/strings/product-strings";
import { getUser, noticePath, requireAckedUser, requireUser } from "./auth";
import { chooseRoleFilter, reportTopicOpened } from "./library";
import { resumePendingAction, storePendingAction } from "./pending-actions";
import { adoptRememberedRoleFilter, rememberRoleFilter } from "./role-filter";
import { safeNextPath } from "./safe-next";
import { markSessionEntered } from "./session-entry";
import { openSession, sessionEntryPath, sessionStartFailedPath, type OpenSessionResult } from "./sessions";
import { createSupabaseServerClient } from "./supabase";
import { isUuid } from "./uuid";

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
  // Nothing of the learner's choices stays in a browser they signed out of.
  await rememberRoleFilter(null);
  redirect("/");
}

/** "Bắt đầu" on the prep screen. Guests and learners without consent continue after sign-in and Màn 0. */
export async function startSession(formData: FormData): Promise<void> {
  const personaId = String(formData.get("personaId") ?? "");
  const user = await getUser();

  if (user?.noticeAcked) {
    let result: OpenSessionResult;
    try {
      result = await openSession(getDb(), user, personaId);
    } catch (error) {
      // The session is created in one transaction, so a failure leaves nothing half made.
      console.error(error);
      redirect(sessionStartFailedPath(personaId));
    }
    if (result.ok) await markSessionEntered(result.session.id);
    redirect(sessionEntryPath(result, personaId));
  }

  // A guest can reach this line, so nothing is stored for a persona that does not exist.
  if (!(await getVisibleScenario(getDb(), personaId, user?.id ?? null))) redirect("/");
  await storePendingAction(user, { kind: "start_session", personaId });
  if (!user) await redirectToGoogle(RESUME_PATH);
  redirect(noticePath(RESUME_PATH));
}

/** "Tiếp tục buổi luyện" on Màn 3, for a session with no question yet: leads into the interview. */
export async function continueSession(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const user = await requireAckedUser("/my-sessions");
  if (!isUuid(sessionId) || !(await getSession(getDb(), user.id, sessionId))) redirect("/my-sessions");
  await markSessionEntered(sessionId);
  redirect(`/sessions/${sessionId}`);
}

/** "Tôi hiểu" on Màn 0: stores consent with its version and time, then resumes what the learner started. */
export async function acceptDataNotice(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next") as string | null);
  const user = await requireUser(next);
  await acknowledgeNotice(getDb(), user.id, DATA_NOTICE_VERSION);
  // A filter chosen before consent was kept by the browser: the account takes it now.
  await adoptRememberedRoleFilter(getDb(), { id: user.id, noticeAcked: true });

  const resumed = await resumePendingAction({ ...user, noticeAcked: true });
  redirect(resumed ?? (next === RESUME_PATH ? "/" : next));
}

/** Posted by the resume page for a learner who already gave consent. */
export async function resumeAfterSignIn(): Promise<void> {
  const user = await requireAckedUser(RESUME_PATH);
  redirect((await resumePendingAction(user)) ?? "/");
}

/**
 * A chip of the library filter (Màn 2); the chosen chip sends an empty value, which clears it.
 * The library is shown again with the choice applied: where to go is never read from the request.
 */
export async function selectRoleFilter(formData: FormData): Promise<void> {
  const user = await getUser();
  const role = await chooseRoleFilter(getDb(), user, formData.get("role"));
  // The account is the only source for a consenting learner; the cookie is a guest's.
  await rememberRoleFilter(user?.noticeAcked ? null : role);
  revalidatePath("/library");
}

/** Màn 2b is on a learner's screen: called by the page itself, once per time it is shown. */
export async function topicOpened(topicId: string): Promise<void> {
  await reportTopicOpened(getDb(), await getUser(), topicId);
}
