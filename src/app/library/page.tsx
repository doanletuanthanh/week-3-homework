import Link from "next/link";
import { Suspense } from "react";
import { GridIcon } from "@/components/icons";
import { CreateTopicCard } from "@/components/library/create-topic-card";
import { CustomTopicCard } from "@/components/library/custom-topic-card";
import { RoleChips } from "@/components/library/role-chips";
import { TopicCard } from "@/components/library/topic-card";
import { RefreshOnShow } from "@/components/sessions/refresh-on-show";
import { LibrarySkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { sweepStaleAttempts } from "@/db/repo/custom-topics";
import { listOwnCustomTopics } from "@/db/repo/library";
import { selectRoleFilter } from "@/server/actions";
import { getUser, type AppUser } from "@/server/auth";
import { filterTopics, listLibraryTopics, toOwnTopicCard } from "@/server/library";
import { rememberedRoleFilter } from "@/server/role-filter";
import { failIfAsked } from "@/server/test-faults";
import { LIBRARY } from "@/strings/product-strings";

export const metadata = { title: "Thư viện · InterviewLab" };

/**
 * The grid and the learner's own topics. What is sent about a persona is that it exists: a topic
 * carries its persona count, never an item, a tag or a hook.
 */
async function Library({ user }: { user: AppUser | null }) {
  const db = getDb();
  // The account's choice wins over the one this browser remembers.
  const filter = user?.roleFilter ?? (await rememberedRoleFilter());
  // As in "Buổi của tôi": an attempt whose runner died is closed first, so its card does not say "Đang chuẩn bị" for nothing.
  if (user) await sweepStaleAttempts(db, user.id);
  const [topics, ownTopics] = await Promise.all([
    listLibraryTopics(db, { requirePublished: await getConfig(db, "require_published"), userId: user?.id ?? null }),
    user ? listOwnCustomTopics(db, user.id) : [],
  ]);
  const shown = filterTopics(topics, filter);
  // Only a role can come up empty: "Khác" and no chip show every topic, with the way to a topic of one's own.
  const empty = shown.length === 0 && filter !== null && filter !== "other";

  return (
    <>
      {/* A learner's cards change while they are away (a scenario gets ready, a session ends); a guest's do not. */}
      {user && <RefreshOnShow />}
      <span className="eyebrow">Thư viện</span>
      <h1 className="headline-lg">{LIBRARY.title}</h1>

      <div className="lib-bar">
        <RoleChips chosen={filter} />
        <span className="body-sm c-outline">{shown.length} chủ đề</span>
      </div>
      {filter === "other" && <p className="body-md c-variant lib-note">{LIBRARY.other_note}</p>}

      {empty ? (
        <section className="card lib-empty">
          <GridIcon size={40} className="c-outline" />
          <h2 className="headline-md">{LIBRARY.empty}</h2>
          <div className="lib-empty-actions">
            <form action={selectRoleFilter}>
              <button type="submit" name="role" value="" className="btn btn-surface btn-md">
                {LIBRARY.show_all}
              </button>
            </form>
            <Link className="btn btn-primary btn-md" href="/custom-topic">
              {LIBRARY.create_action}
            </Link>
          </div>
        </section>
      ) : (
        <div className="lib-grid">
          <CreateTopicCard />
          {shown.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}

      {ownTopics.length > 0 && (
        <section aria-labelledby="own-topics">
          <div className="lib-own-head">
            <h2 id="own-topics" className="headline-md">
              {LIBRARY.own_title}
            </h2>
            <span className="body-sm c-outline">{ownTopics.length} chủ đề</span>
          </div>
          <div className="lib-grid">
            {ownTopics.map((row) => (
              <CustomTopicCard key={row.topicId} topic={toOwnTopicCard(row)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Màn 2 · Thư viện: the curated topics under the role filter, the way to a topic of one's own,
 * and for a learner the topics they made. A guest reads it: nothing here asks for sign-in.
 */
export default async function LibraryPage() {
  const user = await getUser();
  await failIfAsked("page");
  return (
    <main className="container lib">
      <Suspense fallback={<LibrarySkeleton />}>
        <Library user={user} />
      </Suspense>
    </main>
  );
}
