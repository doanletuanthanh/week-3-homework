import { cookies } from "next/headers";

const COOKIE = "il_entered";

/**
 * A session with no question yet opens on Màn 3 (PRD §7), whose button leads into the interview.
 * The session's state cannot tell the two screens apart, so pressing "Bắt đầu" or "Tiếp tục buổi
 * luyện" is remembered here, for this browser, until it closes. Call only from a server action.
 */
export async function markSessionEntered(sessionId: string): Promise<void> {
  (await cookies()).set(COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}

/** True when this browser pressed the button that leads into this session. */
export async function hasEnteredSession(sessionId: string): Promise<boolean> {
  return (await cookies()).get(COOKIE)?.value === sessionId;
}
