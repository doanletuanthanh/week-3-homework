import { describe, expect, it } from "vitest";
import type { ScenarioRow, SessionRow } from "@/db/repo/sessions";
import { SESSION_STATUSES } from "@/db/schema";
import { toBrowserReveal } from "@/engine/seal";
import { buildSessionView } from "@/server/session-view";
import { chiThu } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, playedSession } from "../helpers/reveal-fixtures";

/**
 * The props the session page hands to client components travel to the browser inside the page
 * payload. These tests read them serialised, as the browser receives them.
 */

const basis = basisOf(playedSession(), NOTES);
const reveal = assemble(basis, fullParts(basis));
const target = chiThu.items.find((item) => item.id === "paid-app")!;
const turns = basis.turns.map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));

const scenario = { id: "s", personaId: "chi-thu", topicId: "ux-chi-tieu", version: 1, content: chiThu } as ScenarioRow;

function sessionOf(overrides: Partial<SessionRow>): SessionRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    scenarioId: "s",
    personaId: "chi-thu",
    status: "interviewing",
    isDemo: false,
    endedAt: null,
    turnClaim: null,
    canvasText: NOTES,
    canvasTokens: null,
    canvasFrozenAt: null,
    deviceClass: "desktop",
    guess: null,
    revealedAt: null,
    revealParts: {},
    revealJson: null,
    revealReadyAt: null,
    revealRunToken: null,
    revealRunAttempt: 0,
    revealHeartbeatAt: null,
    startedAt: new Date("2026-09-25T15:30:00Z"),
    updatedAt: new Date("2026-09-25T16:00:00Z"),
    ...overrides,
  };
}

const ended = { endedAt: new Date(), canvasFrozenAt: new Date() };
const ready = { ...ended, guess: 4, revealedAt: new Date(), revealJson: reveal, revealReadyAt: new Date(), revealParts: fullParts(basis) };
const view = (session: SessionRow) => buildSessionView({ session, scenario, topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm", turns, waitlisted: false });
const props = (session: SessionRow) => JSON.stringify(view(session));

const everySealedString = chiThu.items.flatMap((item) => [item.content, item.sample_question, item.topic_tag, item.hook_line, item.do_not_assert.text, `"${item.id}"`]);
const targetStrings = [target.content, target.sample_question, target.topic_tag, target.hook_line, target.do_not_assert.text, `"${target.id}"`];

describe("buildSessionView: which screen a session's state renders (PRD §7)", () => {
  it.each([
    ["interviewing, not ended", sessionOf({}), "interview"],
    ["interviewing, ended by turn 30, notes not frozen yet", sessionOf({ endedAt: new Date() }), "interview"],
    ["interviewing, ended and frozen, no guess", sessionOf(ended), "guess"],
    ["interviewing, ended, result ready, no guess", sessionOf({ ...ready, guess: null, revealedAt: null }), "guess"],
    ["revealed, result not ready", sessionOf({ ...ended, status: "revealed", guess: 4, revealedAt: new Date() }), "computing"],
    ["revealed, result ready", sessionOf({ ...ready, status: "revealed" }), "reveal"],
    ["replaying", sessionOf({ ...ready, status: "replaying" }), "reveal"],
    ["done", sessionOf({ ...ready, status: "done" }), "reveal"],
    ["withdrawn", sessionOf({ ...ready, status: "withdrawn" }), "withdrawn"],
    ["generating", sessionOf({ status: "generating" }), "ended"],
    ["failed_eval", sessionOf({ status: "failed_eval" }), "ended"],
  ] as const)("%s → %s", (_name, session, screen) => {
    expect(view(session).screen).toBe(screen);
  });

  it("withdrawn: the page gets who, the topic, the day and the turn it stopped at, with the transcript", () => {
    expect(view(sessionOf({ ...ready, status: "withdrawn" }))).toEqual({
      screen: "withdrawn",
      personaName: "Chị Thu",
      topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm",
      date: "25/09",
      turnCount: 6,
      turns,
    });
  });

  it("tells the interview screen that turn 30 ended the session, so it sends the end request", () => {
    expect(view(sessionOf({ endedAt: new Date() }))).toMatchObject({ screen: "interview", endedOnServer: true });
    expect(view(sessionOf({}))).toMatchObject({ screen: "interview", endedOnServer: false });
  });

  it("heads a result with the persona, the day in Vietnam and the number of learner turns", () => {
    expect(view(sessionOf({ ...ready, status: "revealed" }))).toMatchObject({
      header: { personaName: "Chị Thu", date: "25/09", turnCount: 6 },
      print: { topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm", date: "25/09/2026", fileName: "thoi-quen-hoi-chi-thu-2026-09-25" },
    });
    // 18:30 UTC is already the next day in Vietnam.
    expect(view(sessionOf({ ...ready, status: "done", startedAt: new Date("2026-09-25T18:30:00Z") }))).toMatchObject({ header: { date: "26/09" } });
  });
});

describe("the serialised props of the session page", () => {
  it.each(SESSION_STATUSES.filter((status) => status !== "revealed" && status !== "replaying" && status !== "done"))(
    "%s: carry no reveal data and nothing authored about any item, even with a result stored",
    (status) => {
      const text = props(sessionOf({ ...ready, status }));
      for (const sealed of everySealedString) expect(text).not.toContain(sealed);
      expect(text).not.toContain("NHẬN XÉT");
      expect(text).not.toContain('"reveal"');
    },
  );

  it("guess screen: the persona's name and the item count, and nothing else of the session", () => {
    expect(view(sessionOf({ ...ready, guess: null, revealedAt: null }))).toEqual({
      screen: "guess",
      sessionId: "11111111-1111-4111-8111-111111111111",
      personaName: "chị Thu",
      itemCount: 11,
    });
  });

  it("computing screen: the guess and the header, no number of the result", () => {
    const computing = view(sessionOf({ ...ended, status: "revealed", guess: 4, revealedAt: new Date(), revealParts: fullParts(basis) }));
    expect(computing).toEqual({
      screen: "computing",
      sessionId: "11111111-1111-4111-8111-111111111111",
      guess: 4,
      header: { personaName: "Chị Thu", date: "25/09", turnCount: 6 },
    });
  });

  it.each(["revealed", "replaying"] as const)("%s: the reveal in the props is the sealed one, with nothing of the target", (status) => {
    const session = sessionOf({ ...ready, status });
    const rendered = view(session);
    expect(rendered).toMatchObject({ screen: "reveal", reveal: toBrowserReveal({ status, guess: 4, canvasText: NOTES, reveal }) });

    const text = JSON.stringify(rendered);
    for (const sealed of targetStrings) expect(text).not.toContain(sealed);
    // The stored result and the runner's bookkeeping stay on the server.
    for (const field of ["revealJson", "revealParts", "canvasMatches", "verifierChecks", "sealed", "itemId", "reason", "secret_terms", "weight"]) {
      expect(text).not.toContain(`"${field}"`);
    }
    expect(text).not.toContain("lý do nội bộ của judge");
    expect(text).not.toContain("lý do của verifier");
  });

  it("done: the target is in the props", () => {
    const text = props(sessionOf({ ...ready, status: "done" }));
    expect(text).toContain(target.content);
    expect(text).toContain(target.sample_question);
    // Still only what a screen needs: no ids, no reasons, no stored result.
    for (const field of ["revealJson", "revealParts", "canvasMatches", "itemId", "reason"]) expect(text).not.toContain(`"${field}"`);
  });

  it("does not show a revealed session's result when the guess is missing", () => {
    expect(view(sessionOf({ ...ready, status: "revealed", guess: null })).screen).toBe("ended");
  });
});
