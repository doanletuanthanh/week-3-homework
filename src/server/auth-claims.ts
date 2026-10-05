export type VerifiedIdentity = { id: string; email: string };

/**
 * Accepts only a Google sign-in. The JWT signature is already checked by `getClaims()`; this
 * checks what the token says. The provider is the real guard: `email_verified` lives in
 * user-editable metadata and is only a second look at what Google reported. Emails are
 * lower-cased here so every later comparison (admin and demo lists) is case-insensitive.
 */
export function verifyClaims(claims: unknown): VerifiedIdentity | null {
  if (typeof claims !== "object" || claims === null) return null;
  const { sub, email, is_anonymous, app_metadata, user_metadata } = claims as Record<string, unknown>;

  if (typeof sub !== "string" || sub === "") return null;
  if (typeof email !== "string" || email === "") return null;
  if (is_anonymous === true) return null;

  // app_metadata is written only by the auth server; a user cannot edit it.
  const provider = (app_metadata as Record<string, unknown> | undefined)?.provider;
  if (provider !== "google") return null;

  const emailVerified = (user_metadata as Record<string, unknown> | undefined)?.email_verified;
  if (emailVerified !== true) return null;

  return { id: sub, email: email.toLowerCase() };
}
