import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { InterviewScreen } from "@/components/interview/interview-screen";
import { TranscriptList, type Turn } from "@/components/interview/transcript-list";
import { getDb } from "@/db/client";
import { getSession, listTurns } from "@/db/repo/sessions";
import { personaCard } from "@/scenario/persona-card";
import { requireAckedUser } from "@/server/auth";
import { freezeAbandonedCanvas } from "@/server/canvas";
import { isUuid } from "@/server/uuid";

/**
 * The learner's own session. A session that does not exist and one that belongs to someone else
 * get the same "not found" page.
 */
const loadSession = cache(async (id: string) => {
  const user = await requireAckedUser(`/sessions/${id}`);
  if (!isUuid(id)) notFound();
  const found = await getSession(getDb(), user.id, id);
  if (!found) notFound();
  return { user, ...found };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { scenario } = await loadSession((await params).id);
  return { title: `Buổi phỏng vấn người dùng với ${personaCard(scenario.content).displayName} · InterviewLab` };
}

/** Shown for a session that has ended, until the guess and reveal screens exist. */
function SessionEnded() {
  return (
    <main className="center-page">
      <section className="card-lg auth-card">
        <h1 className="headline-md">Buổi luyện đã kết thúc.</h1>
        <p className="body-md c-variant">Ghi chú của bạn đã được đóng băng.</p>
      </section>
    </main>
  );
}

/** The persona was pulled with its sessions: what was said stays readable, nothing more can be sent. */
function SessionWithdrawn({ turns, personaName }: { turns: Turn[]; personaName: string }) {
  return (
    <main className="container stopped">
      <section className="card stopped-head">
        <h1 className="headline-md">Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây.</h1>
      </section>
      <section className="card stopped-log" aria-label="Hội thoại">
        <TranscriptList turns={turns} pending={null} personaName={personaName} />
      </section>
    </main>
  );
}

/**
 * One URL per session. It renders the screen of the session's current state, never the screen
 * that was open before: an interview that is still running is Màn 4, a withdrawn session is its
 * read-only transcript, anything else has ended.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, session, scenario } = await loadSession(id);

  const db = getDb();
  const persona = personaCard(scenario.content);
  const transcript = async () =>
    (await listTurns(db, user.id, id)).map((turn) => ({ index: turn.index, learnerText: turn.learnerText, personaText: turn.personaText }));

  if (session.status === "withdrawn") return <SessionWithdrawn turns={await transcript()} personaName={persona.displayNameCapitalized} />;
  if (session.status !== "interviewing") return <SessionEnded />;
  if (session.canvasFrozenAt !== null) return <SessionEnded />;
  // Turn 30 ended it and the final notes never arrived. Long after, the notes are frozen as last
  // autosaved. Within the grace period the browser may still hold unsaved text (a reload after a
  // failed end request), so the screen below sends the end request itself.
  if (session.endedAt !== null && (await freezeAbandonedCanvas(db, id))) return <SessionEnded />;

  return (
    <InterviewScreen
      sessionId={id}
      persona={{
        displayName: persona.displayName,
        displayNameCapitalized: persona.displayNameCapitalized,
        researchGoal: persona.researchGoal,
        itemCount: persona.itemCount,
      }}
      initialTurns={await transcript()}
      initialNotes={session.canvasText}
      endedOnServer={session.endedAt !== null}
    />
  );
}
