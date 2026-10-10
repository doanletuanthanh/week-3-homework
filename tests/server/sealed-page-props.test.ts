import { describe, expect, it } from "vitest";
import type { ScenarioRow, SessionRow } from "@/db/repo/sessions";
import { SESSION_STATUSES } from "@/db/schema";
import { toBrowserReveal } from "@/engine/seal";
import { buildSessionView, opensOnPrep } from "@/server/session-view";
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
    focus: null,
    problemReportedAt: null,
    startedAt: new Date("2026-09-25T15:30:00Z"),
    updatedAt: new Date("2026-09-25T16:00:00Z"),
    ...overrides,
  };
}

const generated = { ...scenario, origin: "generated" } as ScenarioRow;

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
      custom: false,
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

describe("opensOnPrep: a session with no question yet opens on Màn 3 (PRD §7)", () => {
  const open = sessionOf({});
  it.each([
    ["no question, button not pressed in this browser", open, 0, false, true],
    ["no question, 'Bắt đầu' or 'Tiếp tục buổi luyện' pressed", open, 0, true, false],
    ["one question asked", open, 1, false, false],
    ["many questions asked", open, 12, false, false],
    ["ended with no question", sessionOf({ endedAt: new Date() }), 0, false, false],
    ["ended and frozen with no question", sessionOf(ended), 0, false, false],
    ...SESSION_STATUSES.filter((status) => status !== "interviewing").map((status) => [`${status}, whatever else`, sessionOf({ status }), 0, false, false] as const),
  ] as const)("%s", (_name, session, learnerTurns, entered, expected) => {
    expect(opensOnPrep(session, learnerTurns, entered)).toBe(expected);
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
      custom: false,
      screen: "guess",
      sessionId: "11111111-1111-4111-8111-111111111111",
      personaName: "chị Thu",
      itemCount: 11,
    });
  });

  it("computing screen: the guess and the header, no number of the result", () => {
    const computing = view(sessionOf({ ...ended, status: "revealed", guess: 4, revealedAt: new Date(), revealParts: fullParts(basis) }));
    expect(computing).toEqual({
      custom: false,
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

describe("a session on a generated scenario (FR-56)", () => {
  const customView = (session: SessionRow) => buildSessionView({ session, scenario: generated, topicTitle: "app hẹn hò trong khu dân cư đang sống", turns, waitlisted: false });

  it("marks every screen as custom, so each one carries the labels", () => {
    const states: Partial<SessionRow>[] = [
      {},
      ended,
      { ...ended, status: "revealed", guess: 4, revealedAt: new Date() },
      { ...ready, status: "revealed" },
      { ...ready, status: "done" },
      { status: "withdrawn" },
    ];
    for (const state of states) expect(customView(sessionOf(state)).custom).toBe(true);
    for (const state of states) expect(view(sessionOf(state)).custom).toBe(false);
  });

  it("tells the reveal whether the learner already reported the scenario, and nothing else new", () => {
    const fresh = customView(sessionOf({ ...ready, status: "done" }));
    const reported = customView(sessionOf({ ...ready, status: "done", problemReportedAt: new Date() }));
    expect(fresh).toMatchObject({ screen: "reveal", custom: true, problemReported: false });
    expect(reported).toMatchObject({ screen: "reveal", custom: true, problemReported: true });
    // While the replay is on offer the custom view holds back exactly what the authored one does.
    const offer = JSON.stringify(customView(sessionOf({ ...ready, status: "revealed" })));
    expect(offer).not.toContain(target.content);
    expect(offer).not.toContain(target.sample_question);
  });
});

describe("the next step of a result (FR-31)", () => {
  const next = {
    kind: "next",
    persona: { personaId: "anh-dung", displayName: "anh Dũng", name: "Anh Dũng, 29 tuổi", avatarKey: null, itemCount: 10, topicId: "ux-chi-tieu", topicTitle: "Chi tiêu hằng ngày", sameTopic: true },
  } as const;
  const withNext = (session: SessionRow) => buildSessionView({ session, scenario, topicTitle: "Chi tiêu hằng ngày", turns, waitlisted: false, next });

  it.each(["revealed", "replaying", "done"] as const)("%s: the result carries the suggestion it was given, unchanged", (status) => {
    expect(withNext(sessionOf({ ...ready, status }))).toMatchObject({ screen: "reveal", next });
  });

  it("a result built without one says every persona was practised, as before there was a library", () => {
    expect(view(sessionOf({ ...ready, status: "done" }))).toMatchObject({ screen: "reveal", next: { kind: "all_practised" } });
  });

  it("no other screen carries a suggestion", () => {
    for (const session of [sessionOf({}), sessionOf(ended), sessionOf({ ...ended, status: "revealed", guess: 4, revealedAt: new Date() }), sessionOf({ ...ready, status: "withdrawn" })]) {
      expect(JSON.stringify(withNext(session))).not.toContain("anh-dung");
    }
  });
});
