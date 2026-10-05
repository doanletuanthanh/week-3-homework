import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getSession, listTurns } from "@/db/repo/sessions";
import { sessions, turns } from "@/db/schema";
import { openSession } from "@/server/sessions";
import { PERSONA_ID, createLearner, resetDatabase } from "../helpers/test-db";

beforeEach(resetDatabase);

describe("openSession", () => {
  it("creates the session together with turn 0, the persona's opening line", async () => {
    const learner = await createLearner("linh@example.com");

    const session = await openSession(getDb(), learner, PERSONA_ID);

    expect(session).toMatchObject({ userId: learner.id, personaId: PERSONA_ID, status: "interviewing", isDemo: false });
    const transcript = await listTurns(getDb(), learner.id, session!.id);
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toMatchObject({ index: 0, learnerText: null });
    expect(transcript[0].personaText).toContain("chị là Thu");
  });

  it("returns the existing session instead of starting a second one for the same persona", async () => {
    const learner = await createLearner("linh@example.com");

    const first = await openSession(getDb(), learner, PERSONA_ID);
    const second = await openSession(getDb(), learner, PERSONA_ID);

    expect(second!.id).toBe(first!.id);
    expect(await getDb().select().from(sessions)).toHaveLength(1);
    expect(await getDb().select().from(turns)).toHaveLength(1);
  });

  it("creates one session when the same learner presses start several times at once", async () => {
    const learner = await createLearner("linh@example.com");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => openSession(getDb(), learner, PERSONA_ID)),
    );

    expect(new Set(results.map((session) => session!.id)).size).toBe(1);
    expect(await getDb().select().from(sessions)).toHaveLength(1);
    expect(await getDb().select().from(turns)).toHaveLength(1);
  });

  it("gives a demo account a new session every time", async () => {
    const demo = await createLearner("demo@example.com", { ADMIN_EMAILS: [], DEMO_ACCOUNT_EMAILS: ["demo@example.com"] });

    const first = await openSession(getDb(), demo, PERSONA_ID);
    const second = await openSession(getDb(), demo, PERSONA_ID);

    expect(second!.id).not.toBe(first!.id);
    expect(first!.isDemo).toBe(true);
  });

  it("gives each learner their own session with the same persona", async () => {
    const a = await openSession(getDb(), await createLearner("a@example.com"), PERSONA_ID);
    const b = await openSession(getDb(), await createLearner("b@example.com"), PERSONA_ID);
    expect(a!.id).not.toBe(b!.id);
  });

  it("returns null for an unknown persona and creates nothing", async () => {
    const learner = await createLearner("linh@example.com");
    expect(await openSession(getDb(), learner, "khong-co")).toBeNull();
    expect(await getDb().select().from(sessions)).toHaveLength(0);
  });
});

describe("session ownership", () => {
  it("does not return learner A's session or turns to learner B", async () => {
    const a = await createLearner("a@example.com");
    const b = await createLearner("b@example.com");
    const session = await openSession(getDb(), a, PERSONA_ID);

    expect(await getSession(getDb(), a.id, session!.id)).not.toBeNull();
    expect(await getSession(getDb(), b.id, session!.id)).toBeNull();
    expect(await listTurns(getDb(), b.id, session!.id)).toEqual([]);
  });

  it("returns null for a session id that does not exist", async () => {
    const a = await createLearner("a@example.com");
    expect(await getSession(getDb(), a.id, randomUUID())).toBeNull();
  });
});
