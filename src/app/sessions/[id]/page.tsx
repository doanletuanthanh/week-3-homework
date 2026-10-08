import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { GuessScreen } from "@/components/guess/guess-screen";
import { InterviewScreen } from "@/components/interview/interview-screen";
import { TranscriptList } from "@/components/interview/transcript-list";
import { RevealComputing } from "@/components/reveal/reveal-computing";
import { RevealScreen } from "@/components/reveal/reveal-screen";
import { getDb } from "@/db/client";
import { getSession, listTurns } from "@/db/repo/sessions";
import { isOnWaitlist } from "@/db/repo/waitlist";
import { personaCard } from "@/scenario/persona-card";
import { requireAckedUser } from "@/server/auth";
import { freezeAbandonedCanvas } from "@/server/canvas";
import { revealRunIsDue, runReveal } from "@/server/reveal";
import { buildSessionView, type ViewTurn } from "@/server/session-view";
import { isUuid } from "@/server/uuid";

// A reveal that has no live runner is started from here, after the page is sent.
export const maxDuration = 300;

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

/** Shown for a state that has no screen yet. */
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
function SessionWithdrawn({ turns, personaName }: { turns: ViewTurn[]; personaName: string }) {
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
 * that was open before (PRD §7): the interview, the guess, the reveal being computed, the reveal,
 * or the read-only transcript of a withdrawn session.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadSession(id);
  const { user, scenario, topic } = loaded;
  let { session } = loaded;
  const db = getDb();

  // Turn 30 ended it and the final notes never arrived. Long after, the notes are frozen as last
  // autosaved. Within the grace period the browser may still hold unsaved text (a reload after a
  // failed end request), so the interview screen sends the end request itself.
  if (session.status === "interviewing" && session.endedAt !== null && session.canvasFrozenAt === null && (await freezeAbandonedCanvas(db, id))) {
    session = (await getSession(db, user.id, id))!.session;
  }
  // The runner that the end request started may have died with its function.
  if (revealRunIsDue(session)) after(() => runReveal(getDb(), id).catch((error: unknown) => console.error(error)));

  const view = buildSessionView({
    session,
    scenario,
    topicTitle: topic.title,
    turns: await listTurns(db, user.id, id),
    waitlisted: await isOnWaitlist(db, user.id, "no_more_personas"),
  });

  switch (view.screen) {
    case "withdrawn":
      return <SessionWithdrawn turns={view.turns} personaName={view.personaName} />;
    case "interview":
      return (
        <InterviewScreen
          sessionId={view.sessionId}
          persona={view.persona}
          initialTurns={view.initialTurns}
          initialNotes={view.initialNotes}
          endedOnServer={view.endedOnServer}
        />
      );
    case "guess":
      return <GuessScreen sessionId={view.sessionId} personaName={view.personaName} itemCount={view.itemCount} />;
    case "computing":
      return <RevealComputing sessionId={view.sessionId} guess={view.guess} header={view.header} />;
    case "reveal":
      return (
        <RevealScreen sessionId={view.sessionId} persona={view.persona} header={view.header} reveal={view.reveal} waitlisted={view.waitlisted} print={view.print} />
      );
    case "ended":
      return <SessionEnded />;
  }
}
