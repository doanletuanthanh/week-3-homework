import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense, cache } from "react";
import { CustomStrip } from "@/components/custom/custom-strip";
import { FailedEvalScreen } from "@/components/custom/failed-eval-screen";
import { GeneratingScreen } from "@/components/custom/generating-screen";
import { GuessScreen } from "@/components/guess/guess-screen";
import { InterviewScreen } from "@/components/interview/interview-screen";
import { RevealComputing } from "@/components/reveal/reveal-computing";
import { ReplayScreen } from "@/components/replay/replay-screen";
import { RevealScreen } from "@/components/reveal/reveal-screen";
import { SessionSkeleton } from "@/components/ui/page-skeletons";
import { WithdrawnScreen } from "@/components/withdrawn-screen";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { attemptRunIsDue, getPendingCustomSession, sweepStaleAttempts } from "@/db/repo/custom-topics";
import { loadReplay } from "@/db/repo/replay";
import { countLearnerTurns, getSession, listTurns } from "@/db/repo/sessions";
import { isOnWaitlist } from "@/db/repo/waitlist";
import { personaCard } from "@/scenario/persona-card";
import { requireAckedUser } from "@/server/auth";
import { freezeAbandonedCanvas } from "@/server/canvas";
import { getCustomQuota } from "@/server/custom-topic";
import { runGeneration } from "@/server/generation";
import { revealRunIsDue, runReveal } from "@/server/reveal";
import { hasEnteredSession } from "@/server/session-entry";
import { pickNextPersona } from "@/server/library";
import { buildSessionView, opensOnPrep, type SessionView } from "@/server/session-view";
import { isUuid } from "@/server/uuid";

// A reveal, or the preparation of a custom scenario, that has no live runner is started from here, after the page is sent.
export const maxDuration = 300;

/**
 * The learner's own session. A session that does not exist and one that belongs to someone else
 * get the same "not found" page. A custom session has no scenario while it is prepared and when
 * its scenario never passed: it is then `pending`, with the attempt that says where it stands.
 */
const loadSession = cache(async (id: string) => {
  const user = await requireAckedUser(`/sessions/${id}`);
  if (!isUuid(id)) notFound();
  const db = getDb();
  const found = await getSession(db, user.id, id);
  if (found) return { user, pending: null, ...found };
  // An attempt whose runner died is closed here, so this page never waits for nobody.
  await sweepStaleAttempts(db, user.id);
  const pending = await getPendingCustomSession(db, user.id, id);
  if (!pending) {
    // The attempt may have passed between the two reads.
    const now = await getSession(db, user.id, id);
    if (!now) notFound();
    return { user, pending: null, ...now };
  }
  return { user, pending, session: pending.session, scenario: null, topic: null };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { scenario, pending } = await loadSession((await params).id);
  if (!scenario) return { title: `${pending.session.status === "generating" ? "Đang chuẩn bị kịch bản" : "Chưa qua kiểm tra"} · InterviewLab` };
  return { title: `Buổi phỏng vấn người dùng với ${personaCard(scenario.content).displayName} · InterviewLab` };
}

/** Màn 11: the custom session that has no scenario, being prepared or turned down. */
async function PendingScreen({ id }: { id: string }) {
  const { user, pending } = await loadSession(id);
  const { session, attempt } = pending!;
  if (session.status === "generating") {
    // The function that worked on it may have been cut off: the next run starts from here.
    if (attemptRunIsDue(attempt)) after(() => runGeneration(getDb(), attempt.id).catch((error: unknown) => console.error(error)));
    return <GeneratingScreen attemptId={attempt.id} topicText={attempt.topicText} initialStep={attempt.step} />;
  }
  const quota = await getCustomQuota(getDb(), user);
  return (
    <FailedEvalScreen
      sessionId={session.id}
      topicText={attempt.topicText}
      failureCode={attempt.failureCode ?? "system_error"}
      block={quota.block}
      freeLeft={quota.freeLeft}
      attemptsLeftToday={quota.attemptsLeftToday}
    />
  );
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

/**
 * One URL per session. It renders the screen of the session's current state, never the screen
 * that was open before (PRD §7): the interview, the guess, the reveal being computed, the reveal,
 * the replay at the turn it stopped at, or the read-only transcript of a withdrawn session.
 */
async function SessionScreen({ id }: { id: string }) {
  const loaded = await loadSession(id);
  const { user } = loaded;
  // Only called for a session that has its scenario.
  const scenario = loaded.scenario!;
  const topic = loaded.topic!;
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

  // Only a result offers a next persona; the other screens never ask.
  const hasResult = session.status === "revealed" || session.status === "replaying" || session.status === "done";
  const view = buildSessionView({
    session,
    scenario,
    topicTitle: topic.title,
    turns: await listTurns(db, user.id, id),
    waitlisted: await isOnWaitlist(db, user.id, "no_more_personas"),
    next: hasResult
      ? await pickNextPersona(db, {
          userId: user.id,
          topicId: topic.id,
          topicRole: topic.role,
          roleFilter: user.roleFilter,
          requirePublished: await getConfig(db, "require_published"),
        })
      : null,
    replay: session.status === "replaying" || session.status === "done" ? await loadReplay(db, id) : null,
  });

  return (
    <>
      {view.custom && <CustomStrip />}
      <StateScreen view={view} />
    </>
  );
}

function StateScreen({ view }: { view: SessionView }) {
  switch (view.screen) {
    case "withdrawn":
      return (
        <WithdrawnScreen personaName={view.personaName} topicTitle={view.topicTitle} date={view.date} turnCount={view.turnCount} turns={view.turns} />
      );
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
        <RevealScreen
          sessionId={view.sessionId}
          persona={view.persona}
          header={view.header}
          reveal={view.reveal}
          waitlisted={view.waitlisted}
          next={view.next}
          print={view.print}
          replay={view.replay}
          custom={view.custom ? { reported: view.problemReported } : null}
        />
      );
    case "replay":
      return (
        <ReplayScreen
          sessionId={view.sessionId}
          persona={view.persona}
          date={view.date}
          level={view.level}
          forkAfterTurn={view.forkAfterTurn}
          contextTurns={view.contextTurns}
          replayTurns={view.replayTurns}
        />
      );
    case "ended":
      return <SessionEnded />;
  }
}

/**
 * The sign-in, the data notice and whose session it is are checked before anything is sent, so
 * "not found" and the way to sign-in answer with their own status. The screen then loads behind
 * the standard skeleton.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, pending } = await loadSession(id);
  // No question yet: the session opens on Màn 3, whose button leads back here (PRD §7).
  if (session.status === "interviewing" && session.endedAt === null) {
    if (opensOnPrep(session, await countLearnerTurns(getDb(), id), await hasEnteredSession(id))) redirect(`/prep/${encodeURIComponent(session.personaId!)}`);
  }
  return <Suspense fallback={<SessionSkeleton />}>{pending ? <PendingScreen id={id} /> : <SessionScreen id={id} />}</Suspense>;
}
