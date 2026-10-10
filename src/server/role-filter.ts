import { cookies } from "next/headers";
import type { RoleFilter } from "@/db/schema";
import { parseRoleFilter } from "./library";

const COOKIE = "il_role";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * Remembers the library filter in this browser (FR-50): what a guest's choice is kept in, and
 * what a learner's choice falls back to. Clearing the filter removes the cookie. Call only from
 * a server action.
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
