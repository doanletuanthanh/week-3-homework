import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { ArrowRightIcon, HistoryIcon, UserIcon } from "@/components/icons";
import { DeleteAccountDialog } from "@/components/sessions/delete-account-dialog";
import { RefreshOnShow } from "@/components/sessions/refresh-on-show";
import { SessionList } from "@/components/sessions/session-list";
import { SessionListSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getFirstPersonaId, hasGeneratingSession } from "@/db/repo/sessions";
import { requireAckedUser, type AppUser } from "@/server/auth";
import { dueAttemptOf, runGeneration } from "@/server/generation";
import { listSessions } from "@/server/session-list";
import { failIfAsked } from "@/server/test-faults";

export const metadata = { title: "Buổi của tôi · InterviewLab" };

// The preparation of a custom scenario may be continued from here, after the page is sent.
export const maxDuration = 300;

/**
 * Màn 9 · Buổi của tôi: every session of the learner, newest first, each opening on the screen
 * of its state, and the account with its deletion. This slice has no library, so the empty state
 * leads to the one persona instead.
 */
async function MySessions({ user }: { user: AppUser }) {
  const db = getDb();
  // In this order: the list closes an attempt whose runner died, and such an attempt must not lock the delete button.
  const page = await listSessions(db, user);
  const generating = await hasGeneratingSession(db, user.id);
  // "Kịch bản sẽ ở trong Buổi của tôi": a custom scenario whose runner was cut off goes on from here.
  const dueAttempt = generating ? await dueAttemptOf(db, user) : null;
  if (dueAttempt) after(() => runGeneration(getDb(), dueAttempt).catch((error: unknown) => console.error(error)));
  const personaId = page.total === 0 ? await getFirstPersonaId(db) : null;

  return (
    <>
      <RefreshOnShow />
      <div className="mine-head">
        <div>
          <span className="eyebrow">Lịch sử luyện tập</span>
          <h1 className="headline-lg">Buổi của tôi</h1>
        </div>
        <div className="mine-side">
          {page.total > 0 && <span className="body-sm c-outline">{page.total} buổi</span>}
          <Link className="btn btn-surface btn-md" href="/custom-topic">
            Tạo chủ đề của bạn
          </Link>
        </div>
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
        // Keyed by what the server sent: when a refresh brings other rows or states, the list starts from them.
        <SessionList key={page.items.map((item) => `${item.id}:${item.state}`).join()} initialItems={page.items} initialNextOffset={page.nextOffset} />
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
  await failIfAsked("page");
  return (
    <main className="container mine">
      <Suspense fallback={<SessionListSkeleton />}>
        <MySessions user={user} />
      </Suspense>
    </main>
  );
}
