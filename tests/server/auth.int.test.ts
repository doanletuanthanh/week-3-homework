import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { acknowledgeNotice } from "@/db/repo/users";
import { users } from "@/db/schema";
import { resolveUser } from "@/server/auth";
import { DATA_NOTICE_VERSION } from "@/strings/product-strings";
import { googleClaims, resetDatabase } from "../helpers/test-db";

const lists = { ADMIN_EMAILS: ["admin@example.com"], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] };

beforeEach(resetDatabase);

describe("resolveUser", () => {
  it("creates the user row on first sign-in, keyed by the auth id, with no consent yet", async () => {
    const claims = googleClaims("Linh@Example.com");

    const user = await resolveUser(getDb(), claims, lists);

    expect(user).toEqual({ id: claims.sub, email: "linh@example.com", isAdmin: false, isDemo: false, noticeAcked: false });
    const [row] = await getDb().select().from(users).where(eq(users.id, claims.sub));
    expect(row).toMatchObject({ email: "linh@example.com", visibilityAckVersion: null, visibilityAckAt: null });
  });

  it("does not create a second row or lose consent on later requests", async () => {
    const claims = googleClaims("linh@example.com");
    await resolveUser(getDb(), claims, lists);
    await acknowledgeNotice(getDb(), claims.sub, DATA_NOTICE_VERSION);

    const again = await resolveUser(getDb(), claims, lists);

    expect(again?.noticeAcked).toBe(true);
    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  it("derives admin and demo from the env lists, ignoring the case of the token email", async () => {
    expect(await resolveUser(getDb(), googleClaims("ADMIN@example.com"), lists)).toMatchObject({ isAdmin: true, isDemo: false });
    expect(await resolveUser(getDb(), googleClaims("Demo@Example.com"), lists)).toMatchObject({ isAdmin: false, isDemo: true });
  });

  it("rejects a non-Google provider and writes no user row", async () => {
    const claims = { ...googleClaims("mallory@example.com"), app_metadata: { provider: "email", providers: ["email"] } };

    expect(await resolveUser(getDb(), claims, lists)).toBeNull();
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it("rejects an unverified email and writes no user row", async () => {
    const claims = { ...googleClaims("admin@example.com"), user_metadata: { email_verified: false } };

    expect(await resolveUser(getDb(), claims, lists)).toBeNull();
    expect(await getDb().select().from(users)).toHaveLength(0);
  });
});

describe("data notice consent", () => {
  it("stores the version and the time of consent", async () => {
    const claims = googleClaims("linh@example.com");
    await resolveUser(getDb(), claims, lists);
    const before = Date.now();

    await acknowledgeNotice(getDb(), claims.sub, DATA_NOTICE_VERSION);

    const [row] = await getDb().select().from(users).where(eq(users.id, claims.sub));
    expect(row.visibilityAckVersion).toBe(DATA_NOTICE_VERSION);
    expect(row.visibilityAckAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.visibilityAckAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("asks again when the stored consent is for an older notice version", async () => {
    const claims = googleClaims("linh@example.com");
    await resolveUser(getDb(), claims, lists);
    await acknowledgeNotice(getDb(), claims.sub, DATA_NOTICE_VERSION - 1);

    expect((await resolveUser(getDb(), claims, lists))?.noticeAcked).toBe(false);
  });
});
