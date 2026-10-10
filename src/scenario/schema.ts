import { z } from "zod";

export const ITEM_COUNT = { min: 8, max: 12 } as const;
export const MIN_SURFACE_FACTS = 12;
export const OPENNESS_MAX = 10;

export const UNLOCK_PATHS = ["surface", "follow_up", "past_story", "trust"] as const;
export type UnlockPath = (typeof UNLOCK_PATHS)[number];

const text = z.string().trim().min(1);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const itemSchema = z.strictObject({
  id: slug,
  /** The secret itself. Never sent to the browser or to an in-session model call while locked. */
  content: text,
  /** Key phrases of `content` that carry the secret; no public string of the scenario may contain them. */
  secret_terms: z.array(text),
  /** Public label of what the item is about. Must not reveal the content. */
  topic_tag: text,
  path: z.enum(UNLOCK_PATHS),
  prerequisite_id: slug.optional(),
  /** Openness the learner must reach. Only for the `trust` path. */
  trust_threshold: z.number().int().min(0).max(OPENNESS_MAX).optional(),
  hook_line: text,
  do_not_assert: z.strictObject({ id: slug, text }),
  weight: z.number().positive(),
  sample_question: text,
});

const scenarioFields = {
  persona_id: slug,
  topic_id: slug,
  language: z.literal("vi"),
  /** Set by `import` to the next version of the persona in the database. */
  version: z.number().int().positive().default(1),
  persona: z.strictObject({
    /** Form of address used in running text ("chị Thu"); capitalised by the UI at a sentence start. */
    display_name: text,
    /** Heading of the persona card ("Chị Thu, 26 tuổi"). */
    name: text,
    tagline: text,
    avatar_key: slug.optional(),
    /** Who the persona is, written as a description, not as words addressed to a model. */
    identity: text,
    voice_notes: text,
  }),
  research_goal: text,
  opening_line: text,
  openness_start: z.number().int().min(0).max(OPENNESS_MAX).default(4),
  /** Ignored hooks needed before the habit card appears. */
  habit_threshold: z.number().int().positive().default(2),
  /** Example wording per error type for the reveal generator; never shown as written. */
  error_patterns: z.strictObject({ closed: text, hypothetical_future: text, other: text }),
  habit_card_label: text,
};

/**
 * The one definition of a scenario file. The engine, the CLI, the scenario generator and the
 * database import all read scenarios through it.
 */
export const scenarioSchema = z.strictObject({
  ...scenarioFields,
  surface_facts: z.array(text).min(MIN_SURFACE_FACTS),
  items: z.array(itemSchema).min(ITEM_COUNT.min).max(ITEM_COUNT.max),
});

/**
 * The same fields without the list-length limits, so `validate` can report a wrong item or
 * fact count under its own code and still run every other rule on the file.
 */
export const scenarioShapeSchema = z.strictObject({
  ...scenarioFields,
  surface_facts: z.array(text),
  items: z.array(itemSchema),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioItem = z.infer<typeof itemSchema>;

/**
 * The file of a curated topic. An import writes every field over what is stored, so none is
 * optional: a file that left one out would wipe it.
 */
export const topicSchema = z.strictObject({
  id: slug,
  title: text,
  summary: text,
  /** The role the library files the topic under. */
  role: z.enum(["ux", "ba", "pm"]),
  /** Where the topic stands in the library; lower comes first. */
  display_order: z.number().int().min(0),
});
export type TopicFile = z.infer<typeof topicSchema>;
