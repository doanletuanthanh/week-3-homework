import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { consumePendingAction, createPendingAction } from "@/db/repo/pending-actions";
import { pendingActions } from "@/db/schema";
import { createLearner, resetDatabase } from "../helpers/test-db";

const payload = { kind: "start_session", personaId: "chi-thu" } as const;

beforeEach(resetDatabase);

describe("pending action", () => {
  it("is consumed once: the second attempt gets nothing", async () => {
    const learner = await createLearner("linh@example.com");
    const token = await createPendingAction(getDb(), { userId: null, payload });

    expect(await consumePendingAction(getDb(), { token, userId: learner.id })).toEqual(payload);
    expect(await consumePendingAction(getDb(), { token, userId: learner.id })).toBeNull();
    expect(await getDb().select().from(pendingActions)).toHaveLength(0);
  });

  it("goes to exactly one of several concurrent requests", async () => {
    const learner = await createLearner("linh@example.com");
    const token = await createPendingAction(getDb(), { userId: null, payload });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumePendingAction(getDb(), { token, userId: learner.id })),
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("cannot be consumed after it expires, and stays unused", async () => {
    const learner = await createLearner("linh@example.com");
    const token = await createPendingAction(getDb(), { userId: null, payload });
    await getDb()
      .update(pendingActions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pendingActions.id, token));

    expect(await consumePendingAction(getDb(), { token, userId: learner.id })).toBeNull();
  });

  it("expires 15 minutes after it was created", async () => {
    const token = await createPendingAction(getDb(), { userId: null, payload });
    const [row] = await getDb().select().from(pendingActions).where(eq(pendingActions.id, token));
    const ttlMs = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(ttlMs - 15 * 60 * 1000)).toBeLessThan(5000);
  });

  it("created by a signed-in learner cannot be consumed by another learner", async () => {
    const owner = await createLearner("owner@example.com");
    const other = await createLearner("other@example.com");
    const token = await createPendingAction(getDb(), { userId: owner.id, payload });

    expect(await consumePendingAction(getDb(), { token, userId: other.id })).toBeNull();
    expect(await consumePendingAction(getDb(), { token, userId: owner.id })).toEqual(payload);
  });

  it("returns nothing for an unknown token", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await consumePendingAction(getDb(), { token: randomUUID(), userId: learner.id })).toBeNull();
  });
});
