import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { claimRevealRun, finaliseReveal, saveRevealPart, touchRevealRun } from "@/db/repo/reveal";
import { sessions } from "@/db/schema";
import type { RevealJson } from "@/engine/reveal-types";
import { getRevealView, revealRunIsDue, runReveal, submitGuess } from "@/server/reveal";
import { NOTES } from "../helpers/reveal-fixtures";
import {
  LEADING_ONLY,
  NO_REPLAY,
  agreeAll,
  endedSession,
  eventRows,
  failing,
  generatorStep,
  judgeStep,
  noClaims,
  revealCalls,
  revealModels,
  revealScript,
  sessionRow,
} from "../helpers/session-fixtures";
import { resetDatabase } from "../helpers/test-db";

const db = () => getDb();

/** A promise a test resolves by hand, to hold a scripted call open. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/** Makes the runner that holds the reveal look dead: its heartbeat is older than any stale limit. */
const stopHeartbeat = (sessionId: string) =>
  db().update(sessions).set({ revealHeartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(sessions.id, sessionId));

const okCalls = async (sessionId: string) => (await revealCalls(sessionId)).filter((row) => row.ok).map((row) => row.role);

beforeEach(async () => {
  await resetDatabase();
});

describe("reveal runner: one owner at a time", () => {
  it("two runners started together make three model calls in total", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const held = gate();
    // Whichever runner wins waits inside its first call until both have started.
    const slowJudge = { ...judgeStep(), before: () => held.opened };
    const first = revealModels({ ...revealScript(), END_JUDGE: [slowJudge] });
    const second = revealModels({ ...revealScript(), END_JUDGE: [slowJudge] });

    const runs = [runReveal(db(), sessionId, { llmDeps: first.llmDeps }), runReveal(db(), sessionId, { llmDeps: second.llmDeps })];
    setTimeout(held.open, 150);
    const outcomes = await Promise.all(runs);

    expect([...outcomes].sort()).toEqual(["finalised", "not_claimed"]);
    expect(await okCalls(sessionId)).toEqual(["END_JUDGE", "FEEDBACK", "VERIFIER"]);
    expect(first.calls("END_JUDGE").length + second.calls("END_JUDGE").length).toBe(1);
    expect((await sessionRow(sessionId)).revealRunAttempt).toBe(1);
  });

  it("a second runner cannot claim while the first one's heartbeat is fresh", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const claim = await claimRevealRun(db(), sessionId);
    expect(claim).toMatchObject({ exhausted: false });
    expect(await claimRevealRun(db(), sessionId)).toBeNull();
    expect(revealRunIsDue(await sessionRow(sessionId))).toBe(false);

    await stopHeartbeat(sessionId);
    expect(revealRunIsDue(await sessionRow(sessionId))).toBe(true);
    const takeover = await claimRevealRun(db(), sessionId);
    expect(takeover).toMatchObject({ exhausted: false });
    expect(takeover!.token).not.toBe(claim!.token);
    expect((await sessionRow(sessionId)).revealRunAttempt).toBe(2);
  });

  it("a runner whose session was taken over writes nothing", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const reached = gate();
    const held = gate();
    // The first runner is inside its judge call when another runner takes the session over.
    const stale = revealModels({
      END_JUDGE: [{ ...judgeStep(NOTES, []), before: async () => (reached.open(), await held.opened) }],
      FEEDBACK: [noClaims()],
      VERIFIER: [agreeAll()],
    });
    const staleRun = runReveal(db(), sessionId, { llmDeps: stale.llmDeps, heartbeatMs: 60_000 });
    await reached.opened;

    await stopHeartbeat(sessionId);
    expect(await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps })).toBe("finalised");
    const stored = await sessionRow(sessionId);

    held.open();
    expect(await staleRun).toBe("lost");

    // The stale runner's judge found nothing in the notes; the stored result is the other runner's.
    const after = await sessionRow(sessionId);
    expect(after.revealJson).toEqual(stored.revealJson);
    expect(after.revealJson!.counts.recognizedFull).toBe(2);
    expect(after.revealParts).toEqual(stored.revealParts);
    expect(after.revealReadyAt).toEqual(stored.revealReadyAt);
    // It stopped at the write it was refused: no generator or verifier call of its own.
    expect(stale.calls("FEEDBACK")).toHaveLength(0);
    expect(stale.calls("VERIFIER")).toHaveLength(0);
  });

  it("the heartbeat tells a runner it lost the session, and its open call is cut", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const hanging = revealModels({ END_JUDGE: [{ hang: true }] });
    const hangingRun = runReveal(db(), sessionId, { llmDeps: { ...hanging.llmDeps, attemptTimeoutMs: 60_000 }, heartbeatMs: 30 });
    await expect.poll(() => hanging.calls("END_JUDGE").length).toBe(1);

    await stopHeartbeat(sessionId);
    expect(await runReveal(db(), sessionId, { llmDeps: revealModels(revealScript()).llmDeps })).toBe("finalised");

    expect(await hangingRun).toBe("lost");
    // One cut attempt, not retried; the other runner's three calls.
    expect((await revealCalls(sessionId)).map((row) => `${row.role} ${row.ok ? "ok" : "cut"}`).sort()).toEqual([
      "END_JUDGE cut",
      "END_JUDGE ok",
      "FEEDBACK ok",
      "VERIFIER ok",
    ]);
  });

  it("every write refuses a token that is not the owner's", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const { token } = (await claimRevealRun(db(), sessionId))!;
    const stranger = "00000000-0000-4000-8000-000000000009";
    const reveal = { counts: { told: 0 } } as RevealJson;

    expect(await touchRevealRun(db(), sessionId, stranger)).toBe(false);
    expect(await saveRevealPart(db(), { sessionId, token: stranger, parts: { judge: { ok: false } } })).toBe(false);
    expect(await finaliseReveal(db(), { sessionId, token: stranger, reveal })).toBe(false);
    expect(await sessionRow(sessionId)).toMatchObject({ revealParts: {}, revealJson: null, revealReadyAt: null });

    expect(await touchRevealRun(db(), sessionId, token)).toBe(true);
    expect(await saveRevealPart(db(), { sessionId, token, parts: { judge: { ok: false } } })).toBe(true);
    expect(await finaliseReveal(db(), { sessionId, token, reveal })).toBe(true);
    // After the result exists, even the owner's token writes nothing.
    expect(await touchRevealRun(db(), sessionId, token)).toBe(false);
    expect(await saveRevealPart(db(), { sessionId, token, parts: { generator: { ok: false } } })).toBe(false);
    expect(await finaliseReveal(db(), { sessionId, token, reveal: { counts: { told: 9 } } as RevealJson })).toBe(false);
    expect((await sessionRow(sessionId)).revealJson).toEqual(reveal);
  });
});

describe("reveal runner: resume and exhaustion", () => {
  it("a restart after the judge completed makes two calls, and each logical call succeeds once", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    // The first runner stores the judge's output, then dies inside the generator call.
    const dying = revealModels({ END_JUDGE: [judgeStep()], FEEDBACK: [{ hang: true }, { hang: true }, { hang: true }] });
    const dyingRun = runReveal(db(), sessionId, { llmDeps: { ...dying.llmDeps, attemptTimeoutMs: 400 }, heartbeatMs: 60_000 });
    await expect.poll(async () => Object.keys((await sessionRow(sessionId)).revealParts)).toEqual(["judge"]);

    await stopHeartbeat(sessionId);
    // No judge reply is scripted: a second judge call would fail the run.
    const resumed = revealModels({ FEEDBACK: [generatorStep()], VERIFIER: [agreeAll()] });
    expect(await runReveal(db(), sessionId, { llmDeps: resumed.llmDeps })).toBe("finalised");
    expect(resumed.calls("END_JUDGE")).toHaveLength(0);
    expect(resumed.calls("FEEDBACK")).toHaveLength(1);
    expect(resumed.calls("VERIFIER")).toHaveLength(1);

    expect(await dyingRun).toBe("lost");
    expect((await okCalls(sessionId)).sort()).toEqual(["END_JUDGE", "FEEDBACK", "VERIFIER"]);
    const session = await sessionRow(sessionId);
    expect(session.revealRunAttempt).toBe(2);
    expect(session.revealJson).toMatchObject({ failed: { judge: false, generator: false, verifier: false }, counts: { recognizedFull: 2 } });
  });

  it("a restart with every part stored makes no call at all", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const { token } = (await claimRevealRun(db(), sessionId))!;
    await saveRevealPart(db(), { sessionId, token, parts: { judge: { ok: false }, generator: { ok: false }, verifier: { ok: false } } });
    await stopHeartbeat(sessionId);

    const none = revealModels({});
    expect(await runReveal(db(), sessionId, { llmDeps: none.llmDeps })).toBe("finalised");
    expect(await revealCalls(sessionId)).toEqual([]);
    expect((await sessionRow(sessionId)).revealJson!.failed).toEqual({ judge: true, generator: true, verifier: true });
  });

  it("when every allowed runner has died, the next one writes the degraded result without calling a model", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    // Three runners claimed and died; the first got as far as storing the judge's output.
    const first = revealModels({ END_JUDGE: [judgeStep()], FEEDBACK: [{ hang: true }] });
    const firstRun = runReveal(db(), sessionId, { llmDeps: { ...first.llmDeps, attemptTimeoutMs: 300 }, heartbeatMs: 60_000 });
    await expect.poll(async () => Object.keys((await sessionRow(sessionId)).revealParts)).toEqual(["judge"]);
    for (let run = 2; run <= 3; run += 1) {
      await stopHeartbeat(sessionId);
      expect(await claimRevealRun(db(), sessionId)).toMatchObject({ exhausted: false });
    }
    expect((await sessionRow(sessionId)).revealRunAttempt).toBe(3);

    // The third runner is still alive: nobody may write.
    expect(await runReveal(db(), sessionId, { llmDeps: revealModels({}).llmDeps })).toBe("not_claimed");
    await stopHeartbeat(sessionId);
    const none = revealModels({});
    expect(await runReveal(db(), sessionId, { llmDeps: none.llmDeps })).toBe("finalised");

    expect(none.calls("FEEDBACK")).toHaveLength(0);
    expect(none.calls("VERIFIER")).toHaveLength(0);
    const session = await sessionRow(sessionId);
    expect(session.revealRunAttempt).toBe(3);
    // What was stored is kept; what never finished counts as failed.
    expect(session.revealJson).toMatchObject({ failed: { judge: false, generator: true, verifier: true }, counts: { told: 2, recognizedFull: 2 }, claims: [] });

    await submitGuess(db(), learner, sessionId, { guess: 4 });
    expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ ready: true, reveal: { takeaway: { praise: null, comments: [], habit: null, emptyLine: true } } });
    expect(await firstRun).toBe("lost");
  });

  it("a degraded result is never overwritten", async () => {
    const { sessionId } = await endedSession("linh@example.com");
    const degraded = revealModels({ END_JUDGE: failing(), FEEDBACK: failing(), VERIFIER: failing() });
    expect(await runReveal(db(), sessionId, { llmDeps: degraded.llmDeps })).toBe("finalised");
    const stored = await sessionRow(sessionId);
    expect(stored.revealJson!.failed).toEqual({ judge: true, generator: true, verifier: true });

    // Later runners, with working models and with the heartbeat long gone, change nothing.
    await stopHeartbeat(sessionId);
    const healthy = revealModels(revealScript());
    expect(await runReveal(db(), sessionId, { llmDeps: healthy.llmDeps })).toBe("not_claimed");
    expect(await claimRevealRun(db(), sessionId)).toBeNull();
    expect(healthy.records).toEqual([]);
    const after = await sessionRow(sessionId);
    expect(after.revealJson).toEqual(stored.revealJson);
    expect(after.revealReadyAt).toEqual(stored.revealReadyAt);
    expect(await revealCalls(sessionId)).toHaveLength(9);
  });

  it("two tabs polling a reveal that has no runner start one runner between them", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com");
    await submitGuess(db(), learner, sessionId, { guess: 3 });
    const views = await Promise.all([getRevealView(db(), learner, sessionId), getRevealView(db(), learner, sessionId)]);
    expect(views).toEqual([
      { found: true, ready: false, due: true },
      { found: true, ready: false, due: true },
    ]);

    // Both polls ask for a runner, as the route does.
    const models = revealModels(revealScript());
    const outcomes = await Promise.all([runReveal(db(), sessionId, { llmDeps: models.llmDeps }), runReveal(db(), sessionId, { llmDeps: models.llmDeps })]);
    expect([...outcomes].sort()).toEqual(["finalised", "not_claimed"]);
    expect(await okCalls(sessionId)).toEqual(["END_JUDGE", "FEEDBACK", "VERIFIER"]);
  });
});

describe("a session withdrawn while its reveal is computed", () => {
  it("gets no result, no event and no new status from a runner that finishes afterwards", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com", NO_REPLAY, "ghi vội");
    await submitGuess(db(), learner, sessionId, { guess: 1 });
    const reached = gate();
    const held = gate();
    const models = revealModels({
      END_JUDGE: [{ ...judgeStep("ghi vội", []), before: async () => (reached.open(), await held.opened) }],
      FEEDBACK: [noClaims()],
      VERIFIER: [agreeAll()],
    });
    const run = runReveal(db(), sessionId, { llmDeps: models.llmDeps, heartbeatMs: 60_000 });
    await reached.opened;

    // The operator pulls the persona and stops its sessions.
    await db().update(sessions).set({ status: "withdrawn" }).where(eq(sessions.id, sessionId));
    held.open();

    expect(await run).toBe("lost");
    expect(await sessionRow(sessionId)).toMatchObject({ status: "withdrawn", revealJson: null, revealReadyAt: null, revealParts: {} });
    expect(await eventRows(sessionId, "reveal")).toEqual([]);
    expect(models.calls("FEEDBACK")).toHaveLength(0);
    expect(await getRevealView(db(), learner, sessionId)).toEqual({ found: true, ready: false, due: false });
  });
});

describe("a session with no replay moment is done whichever of guess and result comes last", () => {
  const noReplayScript = () => ({ END_JUDGE: [judgeStep("ghi vội", [])], FEEDBACK: [noClaims()], VERIFIER: [agreeAll()] });

  it("result, then guess", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com", NO_REPLAY, "ghi vội");
    await runReveal(db(), sessionId, { llmDeps: revealModels(noReplayScript()).llmDeps });
    expect((await sessionRow(sessionId)).status).toBe("interviewing");

    await submitGuess(db(), learner, sessionId, { guess: 1 });
    expect((await sessionRow(sessionId)).status).toBe("done");
    expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ ready: true, reveal: { mode: "done", replay: { level: "none" } } });
    expect(await eventRows(sessionId, "reveal")).toHaveLength(1);
  });

  it("guess, then result", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com", NO_REPLAY, "ghi vội");
    await submitGuess(db(), learner, sessionId, { guess: 1 });
    expect((await sessionRow(sessionId)).status).toBe("revealed");
    expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ ready: false });

    await runReveal(db(), sessionId, { llmDeps: revealModels(noReplayScript()).llmDeps });
    expect((await sessionRow(sessionId)).status).toBe("done");
    const [event, ...more] = await eventRows(sessionId, "reveal");
    expect(more).toEqual([]);
    expect(event.props).toMatchObject({ guess: 1, told: 1, replay_level: "none" });
    expect((event.props as { latency_ms: number }).latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("guess and result at the same moment: done, with one event", async () => {
    const { learner, sessionId } = await endedSession("linh@example.com", NO_REPLAY, "ghi vội");
    await Promise.all([submitGuess(db(), learner, sessionId, { guess: 0 }), runReveal(db(), sessionId, { llmDeps: revealModels(noReplayScript()).llmDeps })]);
    expect((await sessionRow(sessionId)).status).toBe("done");
    expect(await eventRows(sessionId, "reveal")).toHaveLength(1);
  });

  it("a session with a replay moment stays revealed: something is still held back", async () => {
    for (const [email, script] of [
      ["linh@example.com", undefined],
      ["minh@example.com", LEADING_ONLY],
    ] as const) {
      const { learner, sessionId } = await endedSession(email, script, "ghi vội");
      await submitGuess(db(), learner, sessionId, { guess: 2 });
      await runReveal(db(), sessionId, { llmDeps: revealModels(noReplayScript()).llmDeps });
      expect((await sessionRow(sessionId)).status).toBe("revealed");
      expect((await getRevealView(db(), learner, sessionId)) as object).toMatchObject({ ready: true, reveal: { mode: "offer" } });
    }
  });
});
