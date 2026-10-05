import { describe, expect, it } from "vitest";
import { verifyClaims } from "@/server/auth-claims";

const google = {
  sub: "5f0c2a52-7b2e-4c60-9b1e-0d1c8f1f2a11",
  email: "Linh.N@Gmail.com",
  is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { email_verified: true },
};

describe("verifyClaims", () => {
  it("accepts a verified Google account and lower-cases its email", () => {
    expect(verifyClaims(google)).toEqual({ id: google.sub, email: "linh.n@gmail.com" });
  });

  it.each(["email", "github", "azure", "anonymous", undefined])("rejects provider %s", (provider) => {
    expect(verifyClaims({ ...google, app_metadata: { provider } })).toBeNull();
  });

  it("rejects a token that only lists google among its providers", () => {
    expect(verifyClaims({ ...google, app_metadata: { provider: "email", providers: ["email", "google"] } })).toBeNull();
  });

  it("does not take the provider from user-editable metadata", () => {
    expect(
      verifyClaims({ ...google, app_metadata: { provider: "email" }, user_metadata: { provider: "google", email_verified: true } }),
    ).toBeNull();
  });

  it.each([false, "true", undefined])("rejects email_verified = %s", (emailVerified) => {
    expect(verifyClaims({ ...google, user_metadata: { email_verified: emailVerified } })).toBeNull();
  });

  it("rejects anonymous sessions and tokens without subject or email", () => {
    expect(verifyClaims({ ...google, is_anonymous: true })).toBeNull();
    expect(verifyClaims({ ...google, sub: "" })).toBeNull();
    expect(verifyClaims({ ...google, email: undefined })).toBeNull();
    expect(verifyClaims({ ...google, app_metadata: undefined })).toBeNull();
  });

  it.each([null, undefined, "token", 42])("rejects non-object claims: %s", (claims) => {
    expect(verifyClaims(claims)).toBeNull();
  });
});
