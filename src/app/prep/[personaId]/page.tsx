import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, CrossIcon, GoogleIcon, LockIcon, NoteIcon, WarningIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { StartSessionButton } from "@/components/start-session-button";
import { PrepSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { countLearnerTurns, findSessionForPersona, getPlayableScenario, getVisibleScenario } from "@/db/repo/sessions";
import { personaCard } from "@/scenario/persona-card";
import { continueSession, startSession } from "@/server/actions";
import { getUser } from "@/server/auth";
import { playedBeforeDeletion } from "@/server/quota";
import { CUSTOM_LABEL, focusLabel as focusLabelOf, PERSONA_BEING_UPDATED, PLAYED_BEFORE_DELETION, SESSION_CAP_REACHED } from "@/strings/product-strings";

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
  // A demo account has no one-session limit: this is its newest session with the persona.
  const session = user ? await findSessionForPersona(db, user.id, personaId) : null;
  const playedBefore = user !== null && !user.isDemo && !session && (await playedBeforeDeletion(db, user.id, personaId));
  const canStartAnother = user?.isDemo === true && session !== null && playable;
  // No question asked yet: "Tiếp tục buổi luyện" is the press that leads into the interview (PRD §7).
  const notAskedYet = session !== null && session.status === "interviewing" && session.endedAt === null && (await countLearnerTurns(db, session.id)) === 0;
  const custom = found.scenario.origin === "generated";
  const focusLabel = custom && session?.focus ? focusLabelOf(session.focus) : null;

  return (
    <main className="container prep">
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href={custom ? "/my-sessions" : "/"} className="c-variant">
          {custom ? "Buổi của tôi" : "Trang chủ"}
        </Link>
        <ChevronRightIcon size={14} className="c-outline" />
        <span className="c-variant">{found.topic.title}</span>
        <ChevronRightIcon size={14} className="c-outline" />
        <span aria-current="page">{persona.displayNameCapitalized}</span>
      </nav>

      <div className="prep-grid">
        <article className="card prep-card">
          <div className="prep-body">
            <div className="prep-who">
              <PersonaAvatar size={72} />
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

          {playedBefore && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {PLAYED_BEFORE_DELETION}
            </p>
          )}
          {blocked === "cap" && (!session || canStartAnother) && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {SESSION_CAP_REACHED}
            </p>
          )}
          {blocked === "error" && (!session || canStartAnother) && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {SESSION_START_FAILED}
            </p>
          )}
          {!playable && !session && !playedBefore && (
            <p className="ferr" role="alert">
              <AlertIcon size={16} />
              {PERSONA_BEING_UPDATED}
            </p>
          )}
          {session && notAskedYet ? (
            <form action={continueSession}>
              <input type="hidden" name="sessionId" value={session.id} />
              <StartSessionButton label="Tiếp tục buổi luyện" />
            </form>
          ) : session ? (
            // One session per persona: the button follows its state, and its URL shows the right screen.
            <Link className="btn btn-primary btn-lg prep-start" href={`/sessions/${session.id}`}>
              {session.status === "done" ? "Xem lại kết quả" : "Tiếp tục buổi luyện"}
              <ArrowRightIcon />
            </Link>
          ) : !playable || playedBefore ? (
            <Link className="btn btn-tonal btn-lg prep-start" href="/">
              Về trang chủ
            </Link>
          ) : (
            <form action={startSession}>
              <input type="hidden" name="personaId" value={personaId} />
              <StartSessionButton />
            </form>
          )}
          {canStartAnother && (
            // FR-45: the main button above opens the newest session; this starts one more.
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
