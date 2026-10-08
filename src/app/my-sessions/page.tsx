import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, HistoryIcon, UserIcon } from "@/components/icons";
import { DeleteAccountDialog } from "@/components/sessions/delete-account-dialog";
import { SessionList } from "@/components/sessions/session-list";
import { SessionListSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getFirstPersonaId, hasGeneratingSession } from "@/db/repo/sessions";
import { requireAckedUser, type AppUser } from "@/server/auth";
import { listSessions } from "@/server/session-list";

export const metadata = { title: "Buổi của tôi · InterviewLab" };

/**
 * Màn 9 · Buổi của tôi: every session of the learner, newest first, each opening on the screen
 * of its state, and the account with its deletion. This slice has no library, so the empty state
 * leads to the one persona instead.
 */
async function MySessions({ user }: { user: AppUser }) {
  const db = getDb();
  const [page, generating] = await Promise.all([listSessions(db, user), hasGeneratingSession(db, user.id)]);
  const personaId = page.total === 0 ? await getFirstPersonaId(db) : null;

  return (
    <>
      <div className="mine-head">
        <div>
          <span className="eyebrow">Lịch sử luyện tập</span>
          <h1 className="headline-lg">Buổi của tôi</h1>
        </div>
        {page.total > 0 && <span className="body-sm c-outline">{page.total} buổi</span>}
      </div>

      {page.total === 0 ? (
        <section className="card-lg mine-empty">
          <HistoryIcon size={40} className="c-outline" />
          <h2 className="headline-md">Bạn chưa luyện buổi nào</h2>
          <Link className="btn btn-primary btn-lg" href={personaId ? `/prep/${personaId}` : "/"}>
            Bắt đầu luyện
            <ArrowRightIcon />
          </Link>
        </section>
      ) : (
        <SessionList initialItems={page.items} initialNextOffset={page.nextOffset} />
      )}

      <section className="card acct" aria-labelledby="acct-title">
        <div className="acct-who">
          <span className="user-av acct-av">
            <UserIcon size={20} />
          </span>
          <div>
            <h2 id="acct-title" className="label-lg">
              Tài khoản
            </h2>
            <p className="body-sm c-variant">{user.email}</p>
          </div>
        </div>
        <DeleteAccountDialog blocked={generating} />
      </section>
    </>
  );
}

/** The sign-in and the data notice are checked before anything is sent; the list then loads behind its skeleton. */
export default async function MySessionsPage() {
  const user = await requireAckedUser("/my-sessions");
  return (
    <main className="container mine">
      <Suspense fallback={<SessionListSkeleton />}>
        <MySessions user={user} />
      </Suspense>
    </main>
  );
}
