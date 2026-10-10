import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAnalysisContext, buildJudgeContext, buildPersonaContext } from "@/engine/contexts";
import { initialState } from "@/engine/types";
import { isolationViolations } from "@/eval/isolation";
import { preCheck, personaStrings } from "@/eval/string-check";
import { UNLOCK_PATHS, topicSchema } from "@/scenario/schema";
import { containsTerm } from "@/scenario/text-normalize";
import { validateScenario } from "@/scenario/validate";
import { curatedPersonas, curatedTopics } from "../helpers/curated-scenarios";

const topics = curatedTopics();
const personas = curatedPersonas();
const named = personas.map((persona) => [persona.file, persona] as const);

/** The app and web app topics, which hold two personas each. */
const APP_TOPICS = ["ux-cong-viec-nhom", "ux-dat-san-the-thao", "ux-ban-hang-online"];

describe("the curated library under scenarios/", () => {
  it("holds the four topics in library order, each filed under UX", () => {
    expect(topics.map((entry) => entry.folder)).toEqual(["ux-chi-tieu", ...APP_TOPICS]);
    expect(topics.map((entry) => entry.topic.display_order)).toEqual([10, 20, 30, 40]);
    expect(topics.map((entry) => entry.topic.role)).toEqual(["ux", "ux", "ux", "ux"]);
  });

  it.each(topics.map((entry) => [entry.topicFile, entry] as const))("%s is a complete topic file named after its folder", (_file, entry) => {
    expect(topicSchema.safeParse(entry.topic).success).toBe(true);
    expect(entry.topic.id).toBe(entry.folder);
    expect(entry.topic.title.endsWith(".")).toBe(false);
  });

  it("gives every app topic two personas and keeps persona ids unique across the library", () => {
    for (const entry of topics.filter((topic) => APP_TOPICS.includes(topic.folder))) {
      expect(entry.personas, entry.folder).toHaveLength(2);
    }
    const ids = personas.map((persona) => persona.scenario.persona_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(named)("%s", (file, { scenario, topic }) => {
  const siblings = personas
    .filter((other) => other.topic.id === topic.id && other.file !== file)
    .map((other) => ({ personaId: other.scenario.persona_id, topicTags: other.scenario.items.map((item) => item.topic_tag) }));

  it("passes every validate rule with the other personas of its topic as context", () => {
    expect(validateScenario(scenario, { otherPersonas: siblings }).violations).toEqual([]);
  });

  it("is named after its persona and sits in its topic's folder", () => {
    expect(basename(file, ".json")).toBe(scenario.persona_id);
    expect(scenario.topic_id).toBe(topic.id);
  });

  it("has at least two items on the past-story or trust paths, and every path in use", () => {
    const paths = scenario.items.map((item) => item.path);
    expect(new Set(paths)).toEqual(new Set(UNLOCK_PATHS));
    expect(paths.filter((path) => path === "past_story" || path === "trust").length).toBeGreaterThanOrEqual(2);
  });

  it("asks no sample question that already holds its item's secret", () => {
    const leaks = scenario.items.flatMap((item) =>
      item.secret_terms.filter((term) => containsTerm(item.sample_question, term)).map((term) => `${item.id}: ${term}`),
    );
    expect(leaks).toEqual([]);
  });

  it("puts no other item's secret term in a sample question", () => {
    const leaks = scenario.items.flatMap((item) =>
      scenario.items
        .filter((other) => other.id !== item.id)
        .flatMap((other) => other.secret_terms.filter((term) => containsTerm(item.sample_question, term)).map((term) => `${item.id} ← ${other.id}: ${term}`)),
    );
    expect(leaks).toEqual([]);
  });

  it("makes no claim about real users in a fixed string", () => {
    const problems = personaStrings(scenario).flatMap((entry) => preCheck(entry.text).map((problem) => `${entry.key}: ${problem}`));
    expect(problems).toEqual([]);
  });

  it("keeps a prerequisite chain one step deep, so an item is within reach of a short interview", () => {
    const byId = new Map(scenario.items.map((item) => [item.id, item]));
    const deep = scenario.items.filter((item) => item.prerequisite_id && byId.get(item.prerequisite_id)?.prerequisite_id);
    expect(deep.map((item) => item.id)).toEqual([]);
  });

  it("has no secret term that the fixed wording of an in-session prompt already contains", () => {
    // A term is matched without diacritics, so one such as "bảng chung" is found in a prompt that
    // says "bằng chứng": the engine would then refuse the first call of every session.
    const state = initialState(scenario.openness_start);
    const asked = [{ index: 0, learnerText: null, personaText: scenario.opening_line }, { index: 1, learnerText: "Câu hỏi?", personaText: "Trả lời." }];
    const found = [
      ...isolationViolations(scenario, state, { call: "ANALYSIS", context: buildAnalysisContext(scenario, state, asked.slice(0, 1), "Câu hỏi?") }),
      ...isolationViolations(scenario, state, { call: "REPLAY_JUDGE", context: buildJudgeContext(scenario, { ...state, turnIndex: 1 }, asked, { labelQuestion: true }) }),
      ...scenario.items.flatMap((item) => {
        const stateAfter = { ...state, turnIndex: 1, selectedHook: item.id };
        const context = buildPersonaContext(scenario, { stateAfter, justUnlockedItemId: null, tagItemId: item.id }, asked.slice(0, 1), "Câu hỏi?");
        return isolationViolations(scenario, stateAfter, { call: "PERSONA", context });
      }),
    ];
    expect([...new Set(found)]).toEqual([]);
  });
});
