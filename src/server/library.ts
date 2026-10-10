import type { Executor } from "@/db/client";
import {
  getVisibleTopic,
  listCuratedPersonas,
  openedTopicRecently,
  listDonePersonaIds,
  listPractisedPersonaIds,
  type CuratedPersonaRow,
  type OwnCustomTopicRow,
  type PersonaCardRow,
  type PersonaSessionRow,
} from "@/db/repo/library";
import { listPlayedPersonas } from "@/db/repo/quota-tombstone";
import { setRoleFilter } from "@/db/repo/users";
import { TOPIC_ROLES, type RoleFilter, type TopicRole } from "@/db/schema";
import type { AppUser } from "./auth";
import { recordEvent } from "./events";
import { quotaKeyOf } from "./quota";
import { STATE_OF } from "./session-list";
import { clockOf, dayOf } from "./session-view";

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

/**
 * A chip of the library filter was pressed (FR-50): returns the choice, read from the closed set.
 * A learner's account remembers it and one event reports it, together or not at all. For a guest,
 * and for a learner who has not accepted the data notice, nothing is written: the browser alone
 * remembers the choice.
 */
export async function chooseRoleFilter(db: Executor, user: AppUser | null, value: unknown): Promise<RoleFilter | null> {
  const role = parseRoleFilter(value);
  if (user?.noticeAcked) {
    await db.transaction(async (tx) => {
      await setRoleFilter(tx, user.id, role);
      await recordEvent(tx, { userId: user.id, sessionId: null, isDemo: user.isDemo }, { name: "role_filter_selected", props: { role } });
    });
  }
  return role;
}

/** How long one visit to a topic lasts for the "mở chủ đề" event: showing the page again within it is the same visit. */
export const TOPIC_VISIT_MINUTES = 30;

/**
 * A topic's page was shown to a learner (FR-38): one event per visit, not per time the page
 * loads. A reload, or a return to the page, within `TOPIC_VISIT_MINUTES` of the event is the
 * same visit and writes nothing, so a browser that repeats the request cannot fill the table.
 * Nothing is written for a guest, for a learner who has not accepted the data notice, or for a
 * topic the learner cannot see: the id a browser sends can only ever name a page it was given.
 */
export async function reportTopicOpened(db: Executor, user: AppUser | null, topicId: unknown): Promise<void> {
  if (!user?.noticeAcked || typeof topicId !== "string") return;
  const topic = await getVisibleTopic(db, topicId, user.id);
  if (!topic) return;
  if (await openedTopicRecently(db, user.id, topic.id, TOPIC_VISIT_MINUTES)) return;
  await recordEvent(db, { userId: user.id, sessionId: null, isDemo: user.isDemo }, { name: "topic_opened", props: { topic_id: topic.id, kind: topic.kind } });
}

/** One card of "Chủ đề bạn tự tạo" (Màn 2). */
export type OwnTopicCard = {
  topicId: string;
  /** The topic as the learner typed it. */
  title: string;
  /** When it was asked for, as "dd/mm · hh:mm". */
  created: string;
  /** What the card says (PRD §7): being prepared, not passed, or a topic that can be played. */
  state: "preparing" | "failed_eval" | "playable";
  /** For a playable topic: whether its one persona has a finished session. */
  done: boolean;
  /** Màn 11 while there is nothing to play, the topic's own page once there is. */
  href: string;
};

export function toOwnTopicCard(row: OwnCustomTopicRow): OwnTopicCard {
  const listed = STATE_OF[row.status];
  const state = listed === "preparing" || listed === "failed_eval" ? listed : "playable";
  const { day, month } = dayOf(row.createdAt);
  return {
    topicId: row.topicId,
    title: row.title,
    created: `${day}/${month} · ${clockOf(row.createdAt)}`,
    state,
    done: listed === "done",
    href: state === "playable" ? `/topics/${row.topicId}` : `/sessions/${row.sessionId}`,
  };
}

/** What the button of a persona card does (PRD §7). */
export type PersonaButton = "start" | "continue" | "review";

export function personaButton(session: Pick<PersonaSessionRow, "status"> | null): PersonaButton {
  if (!session) return "start";
  return STATE_OF[session.status] === "done" ? "review" : "continue";
}

/**
 * One persona card of Màn 2b, as the page renders it. Of the sealed items it holds how many
 * there are and nothing else.
 */
export type PersonaCardView = {
  personaId: string;
  /** "Chị Thu, 26 tuổi". */
  name: string;
  /** Form of address ("chị Thu"): what the portrait's initial is read from. */
  displayName: string;
  avatarKey: string | null;
  tagline: string;
  researchGoal: string;
  itemCount: number;
  button: PersonaButton;
  /** The session the button opens: the learner's newest counting one. Null for "Bắt đầu". */
  sessionId: string | null;
  /** The day that session started, as "dd/mm". Null without a session. */
  sessionDate: string | null;
};

/** The only path from a persona row and the learner's session with it to a card of Màn 2b. */
export function toPersonaCardView(persona: PersonaCardRow, session: PersonaSessionRow | null): PersonaCardView {
  const started = session ? dayOf(session.startedAt) : null;
  return {
    personaId: persona.personaId,
    name: persona.name,
    displayName: persona.displayName,
    avatarKey: persona.avatarKey,
    tagline: persona.tagline,
    researchGoal: persona.researchGoal,
    itemCount: persona.itemCount,
    button: personaButton(session),
    sessionId: session?.id ?? null,
    sessionDate: started ? `${started.day}/${started.month}` : null,
  };
}

/** The persona offered after a session. Of its items it holds how many there are, as every card does. */
export type NextPersona = {
  personaId: string;
  /** Form of address ("anh Dũng"). */
  displayName: string;
  /** "Anh Dũng, 29 tuổi". */
  name: string;
  avatarKey: string | null;
  itemCount: number;
  topicId: string;
  topicTitle: string;
  sameTopic: boolean;
};

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
      name: next.name,
      avatarKey: next.avatarKey,
      itemCount: next.itemCount,
      topicId: next.topicId,
      topicTitle: next.topicTitle,
      sameTopic: next.topicId === input.topicId,
    },
  };
}
