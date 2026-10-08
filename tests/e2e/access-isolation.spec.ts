import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { signInAndAccept } from "./helpers/auth";
import { db } from "./helpers/db";
import { PRIMARY_NOTES, PRIMARY_QUESTIONS, endedInterview, expectResult, guess } from "./helpers/reveal";

/**
 * FR-3 over HTTP: learner B asks every route of the API for a session of learner A. Each answer
 * must be the one a session id that does not exist gets, byte for byte, so B cannot even learn
 * that the session exists.
 */

type Call = { method: "GET" | "POST" | "PUT"; path: string; body?: unknown };

/** Every request a learner's browser can send about a session, per route file under `src/app/api`. */
const SESSION_ROUTES: Record<string, (id: string) => Call[]> = {
  "sessions/[id]/turns": (id) => [{ method: "POST", path: `/api/sessions/${id}/turns`, body: { text: "Chị kể em nghe ạ?", expectedIndex: 7, turnKey: randomUUID() } }],
  "sessions/[id]/notes": (id) => [{ method: "PUT", path: `/api/sessions/${id}/notes`, body: { text: "ghi đè ghi chú của người khác" } }],
  "sessions/[id]/end": (id) => [{ method: "POST", path: `/api/sessions/${id}/end`, body: { canvasText: "kết thúc buổi của người khác" } }],
  "sessions/[id]/guess": (id) => [{ method: "POST", path: `/api/sessions/${id}/guess`, body: { guess: 3 } }],
  "sessions/[id]/reveal": (id) => [{ method: "GET", path: `/api/sessions/${id}/reveal` }],
  "sessions/[id]/transcript": (id) => [
    { method: "GET", path: `/api/sessions/${id}/transcript` },
    { method: "GET", path: `/api/sessions/${id}/transcript?branch=replay` },
  ],
  "sessions/[id]/replay": (id) => [
    { method: "POST", path: `/api/sessions/${id}/replay`, body: { action: "start" } },
    { method: "POST", path: `/api/sessions/${id}/replay`, body: { action: "skip" } },
    { method: "POST", path: `/api/sessions/${id}/replay`, body: { action: "stop" } },
  ],
  "sessions/[id]/replay/turns": (id) => [{ method: "POST", path: `/api/sessions/${id}/replay/turns`, body: { text: "Chị kể em nghe ạ?", expectedIndex: 1, turnKey: randomUUID() } }],
  "sessions/[id]/download": (id) => [{ method: "POST", path: `/api/sessions/${id}/download` }],
};
/** Routes that take no session id: they act on the signed-in learner alone. */
const OWN_ROUTES = ["sessions", "waitlist", "account"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [relative("src/app/api", dir).split(sep).join("/")] : [];
  });
}

async function send(request: APIRequestContext, call: Call) {
  const response = await request.fetch(call.path, {
    method: call.method,
    data: call.body as never,
    headers: { "content-type": "application/json" },
  });
  return { status: response.status(), body: await response.text() };
}

test.describe("another learner's session", () => {
  test("the table below names every route file of the API", () => {
    expect(routeFiles("src/app/api").sort()).toEqual([...Object.keys(SESSION_ROUTES), ...OWN_ROUTES].sort());
  });

  test("every route answers learner B as it answers for a session that does not exist, and changes nothing", async ({ page, context, browser }) => {
    // Learner A: a played session with a result, a guess, and the replay on offer.
    const { sessionId } = await endedInterview(page, context, "isolation-owner", PRIMARY_QUESTIONS, PRIMARY_NOTES);
    await guess(page, 5);
    await expectResult(page, 5, 2);
    const before = JSON.stringify(await db.session(sessionId));
    const turnsBefore = JSON.stringify(await db.turnsOf(sessionId));
    const callsBefore = await db.llmCallCount();
    const eventsBefore = (await db.eventsOf(sessionId)).length;

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const b = await signInAndAccept(other, otherContext, "isolation-intruder", "/");
    const missingId = randomUUID();

    for (const [route, calls] of Object.entries(SESSION_ROUTES)) {
      for (const [position, theirs] of calls(sessionId).entries()) {
        const answer = await send(other.request, theirs);
        const missing = await send(other.request, calls(missingId)[position]);
        expect(answer, `${route} ${theirs.method} ${theirs.path}`).toEqual({ status: 404, body: JSON.stringify({ error: "not_found" }) });
        expect(answer, `${route}: same as a session that does not exist`).toEqual(missing);
      }
    }

    // Nothing of A's reached B through the list or the page either.
    const list = await other.request.get("/api/sessions");
    expect(await list.json()).toEqual({ items: [], nextOffset: null });
    const theirPage = await other.goto(`/sessions/${sessionId}`);
    expect(theirPage?.status()).toBe(404);
    await expect(other.getByRole("heading", { name: "Không tìm thấy buổi này." })).toBeVisible();
    const html = await other.content();
    for (const text of ["Chị quản lý tiền nong thế nào ạ?", "mỗi tháng gửi ba mẹ 3 triệu", "Chị trả lời câu thứ"]) expect(html).not.toContain(text);
    await other.goto("/my-sessions");
    await expect(other.getByRole("heading", { name: "Bạn chưa luyện buổi nào" })).toBeVisible();

    // A's session is exactly what it was: no turn, note, guess, replay, model call or event.
    expect(JSON.stringify(await db.session(sessionId))).toBe(before);
    expect(JSON.stringify(await db.turnsOf(sessionId))).toBe(turnsBefore);
    expect(await db.replayOf(sessionId)).toBeUndefined();
    expect(await db.llmCallCount()).toBe(callsBefore);
    expect(await db.eventsOf(sessionId)).toHaveLength(eventsBefore);
    expect(await db.sessionsOf(b.userId)).toEqual([]);
    await otherContext.close();
  });

  test("a visitor who is not signed in gets 401 from every route, with where to sign in", async ({ request }) => {
    const id = randomUUID();
    for (const [route, calls] of Object.entries(SESSION_ROUTES)) {
      for (const call of calls(id)) {
        const answer = await send(request, call);
        expect(answer.status, `${route} ${call.method}`).toBe(401);
        expect(JSON.parse(answer.body), route).toEqual({ error: "unauthorized", redirectTo: `/sign-in?next=${encodeURIComponent(`/sessions/${id}`)}` });
      }
    }
    for (const call of [
      { method: "GET", path: "/api/sessions" },
      { method: "POST", path: "/api/waitlist", body: { context: "no_more_personas" } },
    ] satisfies Call[]) {
      expect((await send(request, call)).status, call.path).toBe(401);
    }
    const account = await request.delete("/api/account", { data: { confirm: "XÓA" } });
    expect(account.status()).toBe(401);
    expect(await account.json()).toEqual({ error: "unauthorized", redirectTo: "/sign-in?next=%2Fmy-sessions" });
  });

  test("an id that is not a session id is not found either, without reaching the database", async ({ page, context }) => {
    await signInAndAccept(page, context, "isolation-bad-id", "/");
    for (const calls of Object.values(SESSION_ROUTES)) {
      for (const call of calls("not-a-session-id")) {
        expect(await send(page.request, call), call.path).toEqual({ status: 404, body: JSON.stringify({ error: "not_found" }) });
      }
    }
  });
});
