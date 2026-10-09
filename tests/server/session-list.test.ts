import { describe, expect, it } from "vitest";
import type { SessionListRow } from "@/db/repo/sessions";
import { SESSION_STATUSES } from "@/db/schema";
import type { RevealJson } from "@/engine/reveal-types";
import { toListItem } from "@/server/session-list";
import { chiThu } from "../helpers/engine-fixtures";
import { NOTES, assemble, basisOf, fullParts, playedSession } from "../helpers/reveal-fixtures";

/**
 * The mapper is the only path from a stored session to a row of "Buổi của tôi". These tests read
 * its output serialised, as the browser receives it, for every status a session can have.
 */

const basis = basisOf(playedSession(), NOTES);
const reveal = assemble(basis, fullParts(basis));

function rowOf(overrides: Partial<SessionListRow>): SessionListRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "interviewing",
    startedAt: new Date("2026-09-25T15:30:00Z"),
    revealJson: null,
    displayName: "chị Thu",
    topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm",
    customTopicText: null,
    ...overrides,
  };
}

describe("a custom session that has no scenario (PRD Màn 9)", () => {
  it("shows the topic the learner typed in place of the persona's name, and no number", () => {
    for (const status of ["generating", "failed_eval"] as const) {
      const item = toListItem(rowOf({ status, displayName: null, topicTitle: null, customTopicText: "app hẹn hò trong khu dân cư đang sống", revealJson: reveal }));
      expect(item).toMatchObject({
        personaName: "app hẹn hò trong khu dân cư đang sống",
        topicTitle: "Chủ đề tự tạo",
        state: status === "generating" ? "preparing" : "failed_eval",
        result: null,
      });
    }
  });

  it("shows the persona and the typed topic as its topic once the scenario exists", () => {
    const item = toListItem(rowOf({ displayName: "anh Nam", topicTitle: "app hẹn hò trong khu dân cư đang sống", customTopicText: "app hẹn hò trong khu dân cư đang sống" }));
    expect(item).toMatchObject({ personaName: "Anh Nam", topicTitle: "app hẹn hò trong khu dân cư đang sống", state: "in_progress" });
  });
});

const sealedStrings = chiThu.items.flatMap((item) => [item.content, item.sample_question, item.topic_tag, item.hook_line, `"${item.id}"`]);

describe("toListItem: the label of each status (PRD §7)", () => {
  it.each([
    ["generating", "preparing"],
    ["failed_eval", "failed_eval"],
    ["interviewing", "in_progress"],
    ["revealed", "in_progress"],
    ["replaying", "in_progress"],
    ["done", "done"],
    ["withdrawn", "withdrawn"],
  ] as const)("%s → %s", (status, state) => {
    expect(toListItem(rowOf({ status })).state).toBe(state);
  });

  it("has a label for every status the schema allows", () => {
    for (const status of SESSION_STATUSES) expect(toListItem(rowOf({ status })).state).toEqual(expect.any(String));
  });
});

describe("toListItem: the numbers (FR-39)", () => {
  it.each(SESSION_STATUSES.filter((status) => status !== "done"))(
    "%s: no number is sent, even when the row was handed a stored result",
    (status) => {
      const item = toListItem(rowOf({ status, revealJson: reveal }));

      expect(item.result).toBeNull();
      const sent = JSON.stringify(item);
      expect(sent).not.toMatch(/told|total|recognized/u);
      for (const sealed of sealedStrings) expect(sent).not.toContain(sealed);
    },
  );

  it("done: KHAI THÁC over the total and NHẬN BIẾT of the main interview, and nothing else of the result", () => {
    const item = toListItem(rowOf({ status: "done", revealJson: reveal }));

    expect(item.result).toEqual({
      told: reveal.counts.told,
      total: 11,
      // Nothing is held back once the session is done, so this is the full number of the main interview.
      recognized: { state: "count", value: reveal.counts.recognizedFull },
    });
    expect(Object.keys(item).sort()).toEqual(["date", "id", "personaName", "result", "state", "topicTitle"]);
    const sent = JSON.stringify(item);
    for (const sealed of sealedStrings) expect(sent).not.toContain(sealed);
  });

  it("done with empty notes: says so instead of a number", () => {
    const empty: RevealJson = { ...reveal, canvasEmpty: true, canvasMatches: [] };
    expect(toListItem(rowOf({ status: "done", revealJson: empty })).result?.recognized).toEqual({ state: "empty" });
  });

  it("done with notes the end judge could not read: KHAI THÁC alone", () => {
    const ungraded: RevealJson = { ...reveal, failed: { ...reveal.failed, judge: true } };
    const item = toListItem(rowOf({ status: "done", revealJson: ungraded }));
    expect(item.result).toMatchObject({ told: reveal.counts.told, recognized: { state: "ungraded" } });
  });

  it("done with no stored result: no number", () => {
    expect(toListItem(rowOf({ status: "done", revealJson: null })).result).toBeNull();
  });
});

describe("toListItem: who and when", () => {
  it("capitalises the persona's form of address and dates the session by the day in Vietnam", () => {
    expect(toListItem(rowOf({}))).toMatchObject({ personaName: "Chị Thu", topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm", date: "25/09" });
    // 18:30 UTC is already the next day in Vietnam.
    expect(toListItem(rowOf({ startedAt: new Date("2026-09-25T18:30:00Z") })).date).toBe("26/09");
  });
});
