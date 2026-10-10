import type { Executor } from "@/db/client";
import {
  listCuratedPersonas,
  listDonePersonaIds,
  listPractisedPersonaIds,
  type CuratedPersonaRow,
  type PersonaSessionRow,
} from "@/db/repo/library";
import { listPlayedPersonas } from "@/db/repo/quota-tombstone";
import { TOPIC_ROLES, type RoleFilter, type TopicRole } from "@/db/schema";
import { quotaKeyOf } from "./quota";
import { STATE_OF } from "./session-list";

/** One card of the library grid. */
export type LibraryTopic = {
  id: string;
  title: string;
  summary: string;
  role: TopicRole | null;
  personaCount: number;
  /** Personas the learner has finished a session with. Null for a guest. */
  doneCount: number | null;
};

/** Folds persona rows, already in library order, into one card per topic. `done` is null for a guest. */
export function groupByTopic(personas: Pick<CuratedPersonaRow, "personaId" | "topicId" | "topicTitle" | "topicSummary" | "topicRole">[], done: Set<string> | null): LibraryTopic[] {
  const topics = new Map<string, LibraryTopic>();
  for (const persona of personas) {
    const topic = topics.get(persona.topicId) ?? {
      id: persona.topicId,
      title: persona.topicTitle,
      summary: persona.topicSummary,
      role: persona.topicRole,
      personaCount: 0,
      doneCount: done ? 0 : null,
    };
    topic.personaCount += 1;
    if (done?.has(persona.personaId)) topic.doneCount = (topic.doneCount ?? 0) + 1;
    topics.set(persona.topicId, topic);
  }
  return [...topics.values()];
}

/**
 * The curated topics of the library, in library order (FR-4): a topic is listed when a session
 * can start on at least one of its personas.
 */
export async function listLibraryTopics(db: Executor, options: { requirePublished: boolean; userId: string | null }): Promise<LibraryTopic[]> {
  const personas = await listCuratedPersonas(db, options.requirePublished);
  const done = options.userId ? new Set(await listDonePersonaIds(db, options.userId)) : null;
  return groupByTopic(personas, done);
}

/** The topics a filter shows: a role shows its own, "Khác" and no chip show every topic. */
export function filterTopics(topics: LibraryTopic[], filter: RoleFilter | null): LibraryTopic[] {
  return filter === null || filter === "other" ? topics : topics.filter((topic) => topic.role === filter);
}

/** Reads a chip value from a form or a cookie; anything outside the closed set is no filter. */
export function parseRoleFilter(value: unknown): RoleFilter | null {
  return value === "other" || TOPIC_ROLES.some((role) => role === value) ? (value as RoleFilter) : null;
}

/** What the button of a persona card does (PRD §7). */
export type PersonaButton = "start" | "continue" | "review";

export function personaButton(session: Pick<PersonaSessionRow, "status"> | null): PersonaButton {
  if (!session) return "start";
  return STATE_OF[session.status] === "done" ? "review" : "continue";
}

export type NextPersona = { personaId: string; displayName: string; topicId: string; topicTitle: string; sameTopic: boolean };

/**
 * What to offer after a session. `all_practised` is only said when there was something to
 * practise: a role with no persona at all is `none_exist`, never "you have practised them all".
 */
export type NextStep = { kind: "next"; persona: NextPersona } | { kind: "all_practised" } | { kind: "none_exist" };

/**
 * The persona to offer after a session (FR-31): one the learner has not practised, of the same
 * topic first, then of another topic of the same role. A custom topic has no role, so the
 * learner's library filter stands in, and with no role chosen every topic counts.
 */
export async function pickNextPersona(
  db: Executor,
  input: { userId: string; topicId: string; topicRole: TopicRole | null; roleFilter: RoleFilter | null; requirePublished: boolean },
): Promise<NextStep> {
  const personas = await listCuratedPersonas(db, input.requirePublished);
  const key = await quotaKeyOf(db, input.userId);
  const practised = new Set([...(await listPractisedPersonaIds(db, input.userId)), ...(key ? await listPlayedPersonas(db, key) : [])]);
  const role = input.topicRole ?? (input.roleFilter === "other" ? null : input.roleFilter);
  // Same topic first, then the other topics of the role, each in library order.
  const candidates = [
    ...personas.filter((persona) => persona.topicId === input.topicId),
    ...personas.filter((persona) => persona.topicId !== input.topicId && (role === null || persona.topicRole === role)),
  ];
  if (candidates.length === 0) return { kind: "none_exist" };
  const next = candidates.find((persona) => !practised.has(persona.personaId));
  if (!next) return { kind: "all_practised" };
  return {
    kind: "next",
    persona: {
      personaId: next.personaId,
      displayName: next.displayName,
      topicId: next.topicId,
      topicTitle: next.topicTitle,
      sameTopic: next.topicId === input.topicId,
    },
  };
}
