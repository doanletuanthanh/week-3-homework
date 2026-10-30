import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, CrossIcon, GoogleIcon, LockIcon, NoteIcon, WarningIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { StartSessionButton } from "@/components/start-session-button";
import { PrepSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { countLearnerTurns, findLatestSessionForPersona, getPlayableScenario, getVisibleScenario } from "@/db/repo/sessions";
import { isOpenSessionStatus } from "@/db/schema";
import { personaCard } from "@/scenario/persona-card";
import { continueSession, startSession } from "@/server/actions";
import { getUser } from "@/server/auth";
import { CUSTOM_LABEL, focusLabel as focusLabelOf, PERSONA_BEING_UPDATED, RETRY, SESSION_CAP_REACHED, TOPIC, LIBRARY, MY_SESSIONS_NAME } from "@/strings/product-strings";

export const metadata = { title: "Chuẩn bị · InterviewLab" };

/** The standard error (PRD §6.0), shown when creating the session failed. Nothing was created. */
const SESSION_START_FAILED = "Không kết nối được. Thử lại.";

/**
 * Màn 3 · Chuẩn bị. Guests can read it; "Bắt đầu" asks for sign-in and the data notice first.
 * The persona of a custom topic exists for its owner alone: for anyone else it is "not found".
 */
export default async function PrepPage({
  params,
  searchParams,
}: {
  params: Promise<{ personaId: string }>;
  searchParams: Promise<{ blocked?: string }>;
}) {
  const { personaId } = await params;
  const { blocked } = await searchParams;
  const db = getDb();
  const viewerId = (await getUser())?.id ?? null;
  // The card shows the version a new session would start on; when none can be played, the newest one.
  const playable = await getPlayableScenario(db, personaId, await getConfig(db, "require_published"), viewerId);
  const found = playable ?? (await getVisibleScenario(db, personaId, viewerId));
  if (!found) notFound();

  return (
    <Suspense fallback={<PrepSkeleton />}>
      <PrepScreen personaId={personaId} blocked={blocked} found={found} playable={playable !== null} />
    </Suspense>
  );
}

type Found = NonNullable<Awaited<ReturnType<typeof getVisibleScenario>>>;

/** The screen itself: the persona, and the button that fits what the signed-in learner has with them. */
async function PrepScreen({ personaId, blocked, found, playable }: { personaId: string; blocked?: string; found: Found; playable: boolean }) {
  const db = getDb();
  const persona = personaCard(found.scenario.content);
  const user = await getUser();
  // The learner's newest session with the persona. A non-demo learner has at most one unfinished
  // session with it, and that one is always the newest.
  const latest = user ? await findLatestSessionForPersona(db, user.id, personaId) : null;
  const open = latest !== null && isOpenSessionStatus(latest.status) ? latest : null;
  // Finished: the press starts the persona again from its opening line, and the result stays one press away.
  const finished = latest?.status === "done" ? latest : null;
  // FR-45: a demo account can start one more beside its unfinished session.
  const canStartAnother = user?.isDemo === true && open !== null && playable;
  const canStart = (playable && open === null) || canStartAnother;
  // No question asked yet: "Tiếp tục buổi luyện" is the press that leads into the interview (PRD §7).
  const notAskedYet = open !== null && open.status === "interviewing" && open.endedAt === null && (await countLearnerTurns(db, open.id)) === 0;
  const custom = found.scenario.origin === "generated";
  const focusLabel = custom && latest?.focus ? focusLabelOf(latest.focus) : null;

  return (
    <main className="container prep">
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href={custom ? "/my-sessions" : "/library"} className="c-variant">
          {custom ? MY_SESSIONS_NAME : LIBRARY.name}
        </Link>
        <ChevronRightIcon size={14} className="c-outline" />
        {custom ? (
          <span className="c-variant">{found.topic.title}</span>
        ) : (
          <Link href={`/topics/${found.topic.id}`} className="c-variant">
            {found.topic.title}
          </Link>
        )}
        <ChevronRightIcon size={14} className="c-outline" />
        <span aria-current="page">{persona.displayNameCapitalized}</span>
      </nav>

      <div className="prep-grid">
        <article className="card prep-card">
          <div className="prep-body">
            <div className="prep-who">
              <PersonaAvatar size={72} avatarKey={found.scenario.avatarKey} name={persona.displayName} />
              <div>
                <h1 className="headline-lg">{persona.name}</h1>
                <p className="body-md c-variant">{persona.tagline}</p>
              </div>
              {custom && <span className="pill pill-outline prep-light">{CUSTOM_LABEL.light_check}</span>}
            </div>
            {custom && (
              <p className="note-box note-info body-sm" role="note">
                Nhân vật này do AI sinh cho chủ đề của bạn, mọi chi tiết là hư cấu. <b>{CUSTOM_LABEL.not_insight}.</b>
                {focusLabel && <> Buổi này tập trung vào: {focusLabel}.</>}
              </p>
            )}
            <div className="ctx prep-goal">
              <span className="ctx-k">Câu hỏi nghiên cứu</span>
              <p className="headline-md">{persona.researchGoal}</p>
            </div>
            <div className="prep-attrs">
              <div className="attr">
                <span className="attr-k">Niêm phong</span>
                <span className="attr-v c-tertiary">
                  <LockIcon size={16} />
                  Đang giữ {persona.itemCount} điều chưa nói
                </span>
              </div>
              <div className="attr">
                <span className="attr-k">Câu hỏi của bạn</span>
                <span className="attr-v">
                  <CrossIcon size={16} className="c-outline" />
                  {persona.displayNameCapitalized} sẽ không bàn về câu hỏi nghiên cứu của bạn.
                </span>
              </div>
            </div>
          </div>
          <div className="actionbar prep-warning">
            <WarningIcon className="c-variant" />
            <p className="body-sm c-variant">
              Nếu đồ án của bạn cũng về chủ đề này: {persona.displayName} là nhân vật hư cấu, điều {persona.displayName} kể không phải
              insight cho đề tài của bạn.
            </p>
          </div>
        </article>

        <aside className="card prep-rules">
          <span className="eyebrow">Trước khi bắt đầu</span>
          <h2 className="headline-md">Luật của buổi luyện</h2>
          <div>
            <div className="rule">
              <span className="check">
                <CheckIcon size={12} strokeWidth={3} />
              </span>
              <p className="label-lg">Tối đa 30 lượt, khoảng 15–20 phút.</p>
            </div>
            <div className="rule">
              <span className="check">
                <CheckIcon size={12} strokeWidth={3} />
              </span>
              <div>
                <p className="label-lg">
                  {persona.displayNameCapitalized} chỉ nói ra những điều đang giữ nếu bạn hỏi đúng cách.
                </p>
                <p className="body-sm c-variant">
                  Một điều là một trải nghiệm, thói quen hay cảm nhận chưa kể, không phải tên hay tuổi.
                </p>
              </div>
            </div>
            <div className="rule">
              <span className="check">
                <CheckIcon size={12} strokeWidth={3} />
              </span>
              <p className="label-lg">Cứ hỏi như đang gặp người thật.</p>
            </div>
          </div>

          <div className="cv-intro">
            <NoteIcon className="c-secondary" />
            <div>
              <p className="label-lg">Ghi chú trong buổi</p>
              <p className="body-sm c-variant">
                Ghi lại điều bạn thấy quan trọng trong lúc nghe. Cuối buổi, chúng tôi đối chiếu ghi chú với những gì {persona.displayName} đã
                nói. Ghi chú là tùy chọn.
              </p>
            </div>
          </div>

          {blocked === "cap" && canStart && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {SESSION_CAP_REACHED}
            </p>
          )}
          {blocked === "error" && canStart && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {SESSION_START_FAILED}
            </p>
          )}
          {!playable && !open && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {PERSONA_BEING_UPDATED}
            </p>
          )}
          {open && notAskedYet ? (
            <form action={continueSession}>
              <input type="hidden" name="sessionId" value={open.id} />
              <StartSessionButton label="Tiếp tục buổi luyện" />
            </form>
          ) : open ? (
            // The unfinished session's URL shows the screen of its state.
            <Link className="btn btn-primary btn-lg prep-start" href={`/sessions/${open.id}`}>
              Tiếp tục buổi luyện
              <ArrowRightIcon />
            </Link>
          ) : !playable ? (
            // Nothing to start: back to the topic, or for a topic of the learner's own, to their sessions.
            <Link className="btn btn-tonal btn-lg prep-start" href={custom ? "/my-sessions" : `/topics/${found.topic.id}`}>
              {custom ? MY_SESSIONS_NAME : TOPIC.to_topic}
            </Link>
          ) : (
            <form action={startSession}>
              <input type="hidden" name="personaId" value={personaId} />
              <StartSessionButton retry={finished !== null} />
            </form>
          )}
          {finished && (
            <Link className="btn btn-surface btn-lg prep-start prep-another" href={`/sessions/${finished.id}`}>
              {RETRY.previous_result}
            </Link>
          )}
          {canStartAnother && (
            // FR-45: the main button above opens the unfinished session; this starts one more.
            <form action={startSession}>
              <input type="hidden" name="personaId" value={personaId} />
              <StartSessionButton another />
            </form>
          )}
          {!user && (
            <p className="body-sm c-outline hint">
              <GoogleIcon size={14} />
              Đăng nhập Google khi bắt đầu
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
