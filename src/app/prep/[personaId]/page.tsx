import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon, CrossIcon, GoogleIcon, LockIcon, WarningIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getDb } from "@/db/client";
import { findSessionForPersona, getScenarioByPersona } from "@/db/repo/sessions";
import { personaCard } from "@/scenario/persona-card";
import { startSession } from "@/server/actions";
import { getUser } from "@/server/auth";

export const metadata = { title: "Chuẩn bị · InterviewLab" };

/** Màn 3 · Chuẩn bị. Guests can read it; "Bắt đầu" asks for sign-in and the data notice first. */
export default async function PrepPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params;
  const db = getDb();
  const found = await getScenarioByPersona(db, personaId);
  if (!found) notFound();

  const persona = personaCard(found.scenario.content);
  const user = await getUser();
  const session = user && !user.isDemo ? await findSessionForPersona(db, user.id, personaId) : null;

  return (
    <main className="container prep">
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href="/" className="c-variant">
          Trang chủ
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
            </div>
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

          {session ? (
            <Link className="btn btn-primary btn-lg prep-start" href={`/sessions/${session.id}`}>
              Tiếp tục buổi luyện
              <ArrowRightIcon />
            </Link>
          ) : (
            <form action={startSession}>
              <input type="hidden" name="personaId" value={personaId} />
              <button type="submit" className="btn btn-primary btn-lg prep-start">
                Bắt đầu
                <ArrowRightIcon />
              </button>
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
