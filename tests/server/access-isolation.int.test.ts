import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getPendingCustomSession } from "@/db/repo/custom-topics";
import { getSession, listTurns } from "@/db/repo/sessions";
import { events, llmCalls } from "@/db/schema";
import type { AppUser } from "@/server/auth";
import { endSession, saveCanvas } from "@/server/canvas";
import { reportCustomProblem } from "@/server/custom-topic";
import { getReplayTranscriptView, runReplayTurn, skipReplay, startReplay, stopReplay } from "@/server/replay";
import { getRevealView, getTranscriptView, recordTakeawayDownload, submitGuess } from "@/server/reveal";
import { listSessions } from "@/server/session-list";
import { runTurn } from "@/server/turns";
import { roleModels } from "../helpers/eval-models";
import { mainData, replayTurn, revealedSession } from "../helpers/replay-fixtures";
import { endedSession, sessionRow } from "../helpers/session-fixtures";
import { createLearner, resetDatabase, startSession } from "../helpers/test-db";

/**
 * FR-3: a learner reads and changes their own sessions and nobody else's. Every service a learner
 * route calls is asked here, as learner B, for a session of learner A in each state a session
 * passes through. B must get exactly what a session id that does not exist gets, no model may be
 * called, and nothing of A's may change.
 */

const db = () => getDb();

/** Scripted models with no reply to give: a call to any of them fails the test. */
const noModels = () => roleModels({});
const question = () => ({ text: "Chị kể em nghe được không ạ?", expectedIndex: 1, turnKey: randomUUID() });

/** Every way a learner route reaches a session, as `(learner, sessionId) => answer`. */
const SERVICES: Record<string, (learner: AppUser, sessionId: string) => Promise<unknown>> = {
  "repo getSession": (learner, id) => getSession(db(), learner.id, id),
  "repo listTurns": (learner, id) => listTurns(db(), learner.id, id),
  "turns POST": (learner, id) => runTurn(db(), learner, id, question(), { llmDeps: noModels().llmDeps }),
  "turns POST, any turn number": (learner, id) => runTurn(db(), learner, id, { ...question(), expectedIndex: 7 }, { llmDeps: noModels().llmDeps }),
  "notes PUT": (learner, id) => saveCanvas(db(), learner, id, { text: "ghi đè ghi chú của người khác" }),
  "end POST": (learner, id) => endSession(db(), learner, id, { canvasText: "kết thúc buổi của người khác" }),
  "guess POST": (learner, id) => submitGuess(db(), learner, id, { guess: 3 }),
  "reveal GET": (learner, id) => getRevealView(db(), learner, id),
  "transcript GET": (learner, id) => getTranscriptView(db(), learner, id),
  "transcript GET ?branch=replay": (learner, id) => getReplayTranscriptView(db(), learner, id),
  "replay POST start": (learner, id) => startReplay(db(), learner, id),
  "replay POST skip": (learner, id) => skipReplay(db(), learner, id),
  "replay POST stop": (learner, id) => stopReplay(db(), learner, id),
  "replay turns POST": (learner, id) => runReplayTurn(db(), learner, id, question(), { llmDeps: noModels().llmDeps }),
  "download POST": (learner, id) => recordTakeawayDownload(db(), learner, id),
  "report-problem POST": (learner, id) => reportCustomProblem(db(), learner, id),
  "repo getPendingCustomSession": (learner, id) => getPendingCustomSession(db(), learner.id, id),
};

/** A session of learner A in each state of PRD §7 that a learner route can meet. */
const STATES: Record<string, () => Promise<string>> = {
  "interviewing, no question yet": async () => (await startSession(await createLearner("a@example.com"))).id,
  "interviewing, ended, no guess": async () => (await endedSession("a@example.com")).sessionId,
  "revealed, replay on offer": async () => (await revealedSession(undefined, undefined, undefined, "a@example.com")).sessionId,
  replaying: async () => {
    const { learner, sessionId } = await revealedSession(undefined, undefined, undefined, "a@example.com");
    await startReplay(db(), learner, sessionId);
    await replayTurn(learner, sessionId, 1);
    return sessionId;
  },
  done: async () => {
    const { learner, sessionId } = await revealedSession(undefined, undefined, undefined, "a@example.com");
    await skipReplay(db(), learner, sessionId);
    return sessionId;
  },
};

beforeEach(resetDatabase);

describe.each(Object.keys(STATES))("learner B and a session of learner A that is %s", (state) => {
  it("gets from every service what a session that does not exist gets, and changes nothing", async () => {
    const sessionId = await STATES[state]();
    const b = await createLearner("b@example.com");
    const mainBefore = await mainData(sessionId);
    const rowBefore = JSON.stringify(await sessionRow(sessionId));
    const callsBefore = (await db().select().from(llmCalls)).length;
    const eventsBefore = (await db().select().from(events)).length;

    for (const [name, call] of Object.entries(SERVICES)) {
      const theirs = await call(b, sessionId);
      const missing = await call(b, randomUUID());
      expect(theirs, name).toEqual(missing);
      // The answer itself carries nothing: no text, no number.
      expect(JSON.stringify(theirs ?? null), name).toMatch(/^(null|false|\[\]|"not_found"|\{"found":false\}|\{"ok":false,"error":"not_found"\})$/u);
    }

    expect(await mainData(sessionId)).toBe(mainBefore);
    expect(JSON.stringify(await sessionRow(sessionId))).toBe(rowBefore);
    expect(await db().select().from(llmCalls)).toHaveLength(callsBefore);
    expect(await db().select().from(events)).toHaveLength(eventsBefore);
    expect(await listSessions(db(), b)).toEqual({ items: [], nextOffset: null, total: 0 });
  });
});

describe("the owner, for comparison", () => {
  it("gets a real answer from the same services, so the refusals above are about ownership", async () => {
    const { learner, sessionId } = await revealedSession(undefined, undefined, undefined, "a@example.com");

    expect(await getSession(db(), learner.id, sessionId)).not.toBeNull();
    expect(await getRevealView(db(), learner, sessionId)).toMatchObject({ found: true, ready: true });
    expect(await getTranscriptView(db(), learner, sessionId)).toHaveLength(7);
    expect((await listSessions(db(), learner)).items).toMatchObject([{ id: sessionId }]);
  });
});

describe("every learner route is in the table above", () => {
  // Each route file under the session, by the services its handler calls. A new route file fails
  // this test until its services are listed here and asked above.
  const ROUTES: Record<string, string[]> = {
    "sessions/[id]/turns": ["turns POST"],
    "sessions/[id]/notes": ["notes PUT"],
    "sessions/[id]/end": ["end POST"],
    "sessions/[id]/guess": ["guess POST"],
    "sessions/[id]/reveal": ["reveal GET"],
    "sessions/[id]/transcript": ["transcript GET", "transcript GET ?branch=replay"],
    "sessions/[id]/replay": ["replay POST start", "replay POST skip", "replay POST stop"],
    "sessions/[id]/replay/turns": ["replay turns POST"],
    "sessions/[id]/download": ["download POST"],
    "sessions/[id]/report-problem": ["report-problem POST"],
    // Keyed by an attempt, not a session: asked as another learner in custom-topic.int.test.ts.
    "custom-topics/[attemptId]": [],
    // These take no session id: they act on the signed-in learner alone.
    sessions: [],
    "custom-topics": [],
    waitlist: [],
    account: [],
  };

  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(path);
      return entry.name === "route.ts" ? [relative("src/app/api", dir).split(sep).join("/")] : [];
    });
  }

  it("lists every route file of the API, and every service it names is asked", () => {
    expect(routeFiles("src/app/api").sort()).toEqual(Object.keys(ROUTES).sort());
    for (const [route, services] of Object.entries(ROUTES)) {
      for (const service of services) expect(Object.keys(SERVICES), route).toContain(service);
      if (route.includes("[id]")) expect(services.length, route).toBeGreaterThan(0);
    }
  });
});
