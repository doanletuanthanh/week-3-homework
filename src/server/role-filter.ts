import { cookies } from "next/headers";
import type { Executor } from "@/db/client";
import { setRoleFilter } from "@/db/repo/users";
import type { RoleFilter } from "@/db/schema";
import type { AppUser } from "./auth";
import { parseRoleFilter } from "./library";

const COOKIE = "il_role";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * Remembers the library filter in this browser (FR-50). The cookie is a guest's alone: a learner
 * who has accepted the data notice has the choice on the account, and no cookie. Null removes it.
 * Call only from a server action.
 */
export async function rememberRoleFilter(role: RoleFilter | null): Promise<void> {
  const cookieStore = await cookies();
  if (role === null) cookieStore.delete(COOKIE);
  else cookieStore.set(COOKIE, role, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR_S });
}

/** The filter this browser remembers; a value outside the closed set is no filter. */
export async function rememberedRoleFilter(): Promise<RoleFilter | null> {
  return parseRoleFilter((await cookies()).get(COOKIE)?.value);
}

/**
 * Moves what this browser remembers onto the account, once: when a learner signs in, or accepts
 * the data notice after signing in. The account takes the value and the cookie is removed, so
 * from then on the account is the only source. Before the notice is accepted nothing is written
 * and the cookie stays. A choice carried over is not a press: no event. Call only from a server
 * action or a route handler.
 */
export async function adoptRememberedRoleFilter(db: Executor, user: Pick<AppUser, "id" | "noticeAcked">): Promise<void> {
  if (!user.noticeAcked) return;
  const cookieStore = await cookies();
  const remembered = cookieStore.get(COOKIE)?.value;
  if (remembered === undefined) return;
  const role = parseRoleFilter(remembered);
  if (role) await setRoleFilter(db, user.id, role);
  cookieStore.delete(COOKIE);
}
