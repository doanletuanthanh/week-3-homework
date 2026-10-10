import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRightIcon, GridIcon, LayersIcon, SparkIcon } from "@/components/icons";
import { PersonaCard } from "@/components/library/persona-card";
import { TopicOpened } from "@/components/library/topic-opened";
import { ROLE_STYLE } from "@/components/library/topic-card";
import { RefreshOnShow } from "@/components/sessions/refresh-on-show";
import { TopicWarning } from "@/components/topic-warning";
import { TopicSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { getTopicWithPersonas, listDonePersonaIds, listSessionsForPersonas } from "@/db/repo/library";
import { getUser, type AppUser } from "@/server/auth";
import { toPersonaCardView } from "@/server/library";
import { failIfAsked } from "@/server/test-faults";
import { CUSTOM_LABEL, ROLE_LABEL, TOPIC } from "@/strings/product-strings";

export const metadata = { title: "Chủ đề · InterviewLab" };

type Found = NonNullable<Awaited<ReturnType<typeof getTopicWithPersonas>>>;

/**
 * The topic and its persona cards. What is sent about a persona is what Màn 3 shows anyway, and
 * of its items only how many there are.
 */
async function Topic({ found, user }: { found: Found; user: AppUser | null }) {
  const db = getDb();
  const { topic, personas } = found;
  const sessions = user ? await listSessionsForPersonas(db, user.id, personas.map((persona) => persona.personaId)) : [];
  const cards = personas.map((persona) => toPersonaCardView(persona, sessions.find((session) => session.personaId === persona.personaId) ?? null));
  const custom = topic.kind === "custom";
  const style = topic.role ? ROLE_STYLE[topic.role] : null;
  // As the library counts it: a persona with any finished session, whatever a demo account started after it.
  const done = user ? new Set(await listDonePersonaIds(db, user.id)) : null;
  const practised = cards.filter((card) => done?.has(card.personaId)).length;

  return (
    <>
      {/* A learner's cards change while they are away (a session ends); a guest's do not. */}
      {user && <RefreshOnShow />}
      {/* Reported once the page is on screen, so a prefetch or a refresh of it reports nothing. A guest's visit writes nothing. */}
      {user?.noticeAcked && <TopicOpened topicId={topic.id} />}
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href="/library" className="c-variant">
          Thư viện
        </Link>
        <ChevronRightIcon size={14} className="c-outline" />
        <span aria-current="page">{topic.title}</span>
      </nav>

      <div className="topic-head">
        <div className="topic-what">
          <span className={`tt topic-ic ${style?.tile ?? "tt-cu"}`}>{custom ? <SparkIcon size={32} strokeWidth={1.8} /> : <LayersIcon size={32} strokeWidth={1.8} />}</span>
          <div>
            <div className="topic-pills">
              {topic.role && style && <span className={`pill ${style.pill}`}>{ROLE_LABEL[topic.role]}</span>}
              {custom && <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>}
              <span className="pill pill-neutral">{cards.length} persona</span>
            </div>
            <h1 className="headline-lg topic-title">{topic.title}</h1>
            {!custom && <p className="body-lg c-variant">{topic.summary}</p>}
            {custom && <p className="body-lg c-variant">{TOPIC.generated}</p>}
          </div>
        </div>
        {user && cards.length > 0 && (
          <div className="topic-done">
            <div className="label-sm topic-done-row">
              <span className="c-variant">{TOPIC.practised}</span>{" "}
              <span className="c-secondary">
                {practised}/{cards.length}
              </span>
            </div>
            <div className="bar h8" aria-hidden="true">
              <i className="f-secondary" style={{ width: `${(practised / cards.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <section className="card lib-empty">
          <GridIcon size={40} className="c-outline" />
          <h2 className="headline-md">{TOPIC.empty}</h2>
          <Link className="btn btn-primary btn-md" href="/library">
            {TOPIC.to_library}
          </Link>
        </section>
      ) : (
        <>
          <TopicWarning />
          <div className="lib-grid">
            {cards.map((card) => (
              <PersonaCard key={card.personaId} persona={card} demo={user?.isDemo === true} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Màn 2b · Chủ đề: a topic, the warning about taking its personas for real users, and one card
 * per persona a session can start on. A guest reads it. A topic that does not exist and another
 * learner's own topic are the same "not found".
 */
export default async function TopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const db = getDb();
  const user = await getUser();
  await failIfAsked("page");
  const found = await getTopicWithPersonas(db, topicId, { requirePublished: await getConfig(db, "require_published"), viewerId: user?.id ?? null });
  if (!found) notFound();

  return (
    <main className="container topic">
      <Suspense fallback={<TopicSkeleton />}>
        <Topic found={found} user={user} />
      </Suspense>
    </main>
  );
}
