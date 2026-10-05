import type { z } from "zod";
import { vi } from "zod/locales";
import {
  ITEM_COUNT,
  MIN_SURFACE_FACTS,
  UNLOCK_PATHS,
  scenarioSchema,
  scenarioShapeSchema,
  type Scenario,
} from "./schema";
import { containsTerm, tokenize } from "./text-normalize";

export type ViolationCode =
  | "schema"
  | "item_count"
  | "surface_fact_count"
  | "path_missing"
  | "research_goal_not_question"
  | "secret_terms_missing"
  | "secret_term_not_in_content"
  | "secret_term_leak"
  | "item_id_duplicate"
  | "do_not_assert_id_duplicate"
  | "topic_tag_duplicate"
  | "topic_tag_taken"
  | "prerequisite_unknown"
  | "prerequisite_cycle"
  | "trust_threshold_misplaced"
  | "trust_threshold_unreachable"
  | "model_directed_text";

export type Violation = { path: string; code: ViolationCode; message: string };

/** What `validate` knows beyond the file: the tags other personas of the same topic already use. */
export type ValidateContext = { otherPersonas?: { personaId: string; topicTags: string[] }[] };

export type ValidationResult = { scenario: Scenario; violations: [] } | { scenario: null; violations: Violation[] };

type Shape = z.infer<typeof scenarioShapeSchema>;
type Rule = (scenario: Shape, context: ValidateContext) => Violation[];

const PATH_NAMES: Record<(typeof UNLOCK_PATHS)[number], string> = {
  surface: "bề mặt",
  follow_up: "follow-up",
  past_story: "chuyện quá khứ",
  trust: "tin tưởng",
};

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (out, key) => (typeof key === "number" ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key)),
    "",
  );
}

const counts: Rule = (scenario) => {
  const violations: Violation[] = [];
  const itemCount = scenario.items.length;
  if (itemCount < ITEM_COUNT.min || itemCount > ITEM_COUNT.max) {
    violations.push({
      path: "items",
      code: "item_count",
      message: `Cần ${ITEM_COUNT.min}–${ITEM_COUNT.max} item, đang có ${itemCount}.`,
    });
  }
  if (scenario.surface_facts.length < MIN_SURFACE_FACTS) {
    violations.push({
      path: "surface_facts",
      code: "surface_fact_count",
      message: `Cần ít nhất ${MIN_SURFACE_FACTS} fact bề mặt, đang có ${scenario.surface_facts.length}.`,
    });
  }
  return violations;
};

/**
 * All four paths must be used. That also gives the two items on the past-story or trust paths
 * that FR-33 asks for, so there is no separate count for them.
 */
const paths: Rule = (scenario) => {
  const used = new Set(scenario.items.map((item) => item.path));
  return UNLOCK_PATHS.filter((path) => !used.has(path)).map((path) => ({
    path: "items",
    code: "path_missing",
    message: `Thiếu item thuộc đường mở "${PATH_NAMES[path]}" (${path}).`,
  }));
};

const researchGoal: Rule = (scenario) =>
  scenario.research_goal.trimEnd().endsWith("?")
    ? []
    : [
        {
          path: "research_goal",
          code: "research_goal_not_question",
          message: "Câu hỏi nghiên cứu phải là một câu hỏi, kết thúc bằng dấu chấm hỏi.",
        },
      ];

/** Each item names the phrases that carry its secret, and each phrase really is in its content. */
const secretTerms: Rule = (scenario) =>
  scenario.items.flatMap((item, index): Violation[] => {
    if (item.secret_terms.length === 0) {
      return [
        {
          path: `items[${index}].secret_terms`,
          code: "secret_terms_missing",
          message: `Item ${item.id} cần ít nhất một cụm từ mang nội dung bí mật.`,
        },
      ];
    }
    return item.secret_terms.flatMap((term, termIndex): Violation[] =>
      containsTerm(item.content, term)
        ? []
        : [
            {
              path: `items[${index}].secret_terms[${termIndex}]`,
              code: "secret_term_not_in_content",
              message: `Cụm "${term}" không có trong nội dung của item ${item.id}.`,
            },
          ],
    );
  });

/**
 * Every string a learner or an in-session call can see while the items are still locked: what
 * the screens show, what the persona call is told about the persona, and the per-item strings
 * that are released before the item itself.
 */
function publicStrings(scenario: Shape): { path: string; text: string }[] {
  return [
    { path: "research_goal", text: scenario.research_goal },
    { path: "opening_line", text: scenario.opening_line },
    { path: "habit_card_label", text: scenario.habit_card_label },
    { path: "persona.display_name", text: scenario.persona.display_name },
    { path: "persona.name", text: scenario.persona.name },
    { path: "persona.tagline", text: scenario.persona.tagline },
    { path: "persona.identity", text: scenario.persona.identity },
    { path: "persona.voice_notes", text: scenario.persona.voice_notes },
    ...scenario.surface_facts.map((text, index) => ({ path: `surface_facts[${index}]`, text })),
    ...scenario.items.flatMap((item, index) => [
      { path: `items[${index}].topic_tag`, text: item.topic_tag },
      { path: `items[${index}].hook_line`, text: item.hook_line },
      { path: `items[${index}].do_not_assert.text`, text: item.do_not_assert.text },
    ]),
  ];
}

const secretTermLeaks: Rule = (scenario) => {
  const targets = publicStrings(scenario);
  return scenario.items.flatMap((item) =>
    item.secret_terms.flatMap((term) =>
      targets
        .filter((target) => containsTerm(target.text, term))
        .map((target): Violation => ({
          path: target.path,
          code: "secret_term_leak",
          message: `Chứa cụm "${term}" mang nội dung của item ${item.id}.`,
        })),
    ),
  );
};

/** Two tags are the same when their words are, whatever the case, diacritics, spacing and punctuation. */
const tagKey = (tag: string) => tokenize(tag).join(" ");

const uniqueIdsAndTags: Rule = (scenario, context) => {
  const violations: Violation[] = [];
  const ids = new Set<string>();
  const doNotAssertIds = new Set<string>();
  const tags = new Map<string, string>();
  scenario.items.forEach((item, index) => {
    if (ids.has(item.id)) {
      violations.push({ path: `items[${index}].id`, code: "item_id_duplicate", message: `Id "${item.id}" bị trùng.` });
    }
    ids.add(item.id);
    if (doNotAssertIds.has(item.do_not_assert.id)) {
      violations.push({
        path: `items[${index}].do_not_assert.id`,
        code: "do_not_assert_id_duplicate",
        message: `Id "${item.do_not_assert.id}" bị trùng.`,
      });
    }
    doNotAssertIds.add(item.do_not_assert.id);

    const tag = tagKey(item.topic_tag);
    const firstOwner = tags.get(tag);
    if (firstOwner !== undefined) {
      violations.push({
        path: `items[${index}].topic_tag`,
        code: "topic_tag_duplicate",
        message: `Topic tag "${item.topic_tag}" trùng với item ${firstOwner}.`,
      });
    } else {
      tags.set(tag, item.id);
    }
    for (const other of context.otherPersonas ?? []) {
      if (other.personaId === scenario.persona_id) continue;
      if (other.topicTags.some((otherTag) => tagKey(otherTag) === tag)) {
        violations.push({
          path: `items[${index}].topic_tag`,
          code: "topic_tag_taken",
          message: `Topic tag "${item.topic_tag}" đã được persona "${other.personaId}" cùng chủ đề dùng.`,
        });
      }
    }
  });
  return violations;
};

const prerequisites: Rule = (scenario) => {
  const prerequisiteOf = new Map(scenario.items.map((item) => [item.id, item.prerequisite_id]));
  return scenario.items.flatMap((item, index): Violation[] => {
    if (item.prerequisite_id === undefined) return [];
    const path = `items[${index}].prerequisite_id`;
    if (!prerequisiteOf.has(item.prerequisite_id)) {
      return [{ path, code: "prerequisite_unknown", message: `Item tiên quyết "${item.prerequisite_id}" không tồn tại.` }];
    }
    // Each item has at most one prerequisite, so its chain is a single walk.
    const seen = new Set([item.id]);
    for (let next = prerequisiteOf.get(item.id); next !== undefined; next = prerequisiteOf.get(next)) {
      if (next === item.id) {
        return [{ path, code: "prerequisite_cycle", message: `Item ${item.id} nằm trong một vòng tiên quyết nên không bao giờ mở được.` }];
      }
      if (seen.has(next)) break;
      seen.add(next);
    }
    return [];
  });
};

const trustThresholds: Rule = (scenario) =>
  scenario.items.flatMap((item, index): Violation[] => {
    const path = `items[${index}].trust_threshold`;
    const threshold = item.trust_threshold;
    if (item.path !== "trust") {
      return threshold === undefined
        ? []
        : [{ path, code: "trust_threshold_misplaced", message: "Chỉ item đường tin tưởng mới có ngưỡng openness." }];
    }
    if (threshold === undefined) {
      return [{ path, code: "trust_threshold_misplaced", message: `Item đường tin tưởng ${item.id} cần ngưỡng openness.` }];
    }
    // The schema caps a threshold at 10 and a good turn adds at least 1, so any threshold above
    // the starting openness is reached within the 20 good turns FR-33 allows.
    const start = scenario.openness_start;
    if (threshold <= start) {
      return [
        {
          path,
          code: "trust_threshold_unreachable",
          message: `Ngưỡng ${threshold} phải lớn hơn openness ban đầu (${start}), nếu không item mở ngay từ lượt đầu.`,
        },
      ];
    }
    return [];
  });

/** A word not glued to other letters or digits; `\b` does not work next to Vietnamese letters. */
const word = (source: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "u");

/**
 * Cheap first filter for text written to a model instead of about the persona. It runs on
 * lower-cased text. Ordinary words such as "hãy" alone do not match.
 */
const MODEL_DIRECTED_PATTERNS: RegExp[] = [
  // Role markers and chat-template tokens.
  /(^|[\n.!?]\s*)(system|assistant|user|human|developer)\s*:/u,
  /<\|[^|>]*\|>|\[\/?inst\]|<\/?\s*(system|assistant|user)\s*>|#{2,}\s*(system|assistant|user|instruction)/u,
  // Vocabulary about the prompt itself.
  word("system|prompts?|instructions?|jailbreak"),
  word("(lời nhắc|câu lệnh|chỉ dẫn)\\s+hệ thống"),
  // Commands to an assistant.
  word("(ignore|disregard|forget)\\s+(all|any|the|your|previous|prior|above|everything)"),
  word("you\\s+(are|must)|act\\s+as|pretend\\s+to\\s+be"),
  word(
    "(bỏ qua|quên|phớt lờ)(\\s+(hết|đi))?(\\s+(mọi|các|tất cả|toàn bộ|những))*\\s+(luật|quy tắc|hướng dẫn|chỉ dẫn|yêu cầu|chỉ thị)",
  ),
  word("hãy\\s+đóng\\s+vai|từ\\s+(giờ|bây giờ)\\s+trở\\s+đi"),
  word("(bạn|mày)\\s+(phải|hãy|không được)"),
  word("(bạn|mày)\\s+là\\s+(một\\s+)?(trợ lý|ai|mô hình|chatbot|bot)"),
  // A whole field that opens by telling the reader who they are ("Bạn là Thu, …").
  /^\s*(bạn|mày)\s+là(?![\p{L}\p{N}])/u,
];

/** Ids and enum values are not prose and are constrained by the schema already. */
const NON_PROSE_KEYS = new Set(["id", "persona_id", "topic_id", "prerequisite_id", "avatar_key", "path", "language"]);

function proseFields(value: unknown, path: PropertyKey[] = []): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path: formatPath(path), text: value }];
  if (Array.isArray(value)) return value.flatMap((entry, index) => proseFields(entry, [...path, index]));
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !NON_PROSE_KEYS.has(key))
      .flatMap(([key, entry]) => proseFields(entry, [...path, key]));
  }
  return [];
}

const modelDirectedText: Rule = (scenario) =>
  proseFields(scenario).flatMap(({ path, text }): Violation[] => {
    const lower = text.normalize("NFC").toLowerCase();
    const found = MODEL_DIRECTED_PATTERNS.map((pattern) => pattern.exec(lower)?.[0].trim()).find(Boolean);
    if (!found) return [];
    return [
      {
        path,
        code: "model_directed_text",
        message: `Cụm "${found}" giống lời nói với model (dấu vai trò, từ về prompt, hoặc câu ra lệnh cho trợ lý). Viết lại như lời mô tả nhân vật.`,
      },
    ];
  });

const RULES: Rule[] = [
  counts,
  paths,
  researchGoal,
  secretTerms,
  secretTermLeaks,
  uniqueIdsAndTags,
  prerequisites,
  trustThresholds,
  modelDirectedText,
];

/**
 * Checks a parsed scenario file against the schema and the authoring rules (FR-33). Pure: the
 * caller supplies what it knows about other personas. Returns every violation, or the scenario
 * with defaults filled in when there is none.
 */
export function validateScenario(input: unknown, context: ValidateContext = {}): ValidationResult {
  const parsed = scenarioShapeSchema.safeParse(input, { error: vi().localeError });
  if (!parsed.success) {
    return {
      scenario: null,
      violations: parsed.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        code: "schema",
        message: issue.message,
      })),
    };
  }
  const violations = RULES.flatMap((rule) => rule(parsed.data, context));
  if (violations.length > 0) return { scenario: null, violations };
  return { scenario: scenarioSchema.parse(parsed.data), violations: [] };
}
