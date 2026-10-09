import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, ShieldIcon } from "@/components/icons";
import { CustomTopicForm } from "@/components/custom/custom-topic-form";
import { PrepSkeleton } from "@/components/ui/page-skeletons";
import { getDb } from "@/db/client";
import { getPendingCustomSession } from "@/db/repo/custom-topics";
import { isOnWaitlist } from "@/db/repo/waitlist";
import { requireAckedUser, type AppUser } from "@/server/auth";
import { getCustomQuota } from "@/server/custom-topic";
import { isUuid } from "@/server/uuid";
import { CUSTOM_LABEL, CUSTOM_TOPIC_INFO } from "@/strings/product-strings";

export const metadata = { title: "Tạo chủ đề của bạn · InterviewLab" };

/** The form with today's limits, and for "Thử lại" the topic and answer of the learner's own failed try. */
async function CustomTopic({ user, retry }: { user: AppUser; retry?: string }) {
  const db = getDb();
  const quota = await getCustomQuota(db, user);
  const failed = retry && isUuid(retry) ? await getPendingCustomSession(db, user.id, retry) : null;
  const retried = failed?.session.status === "failed_eval" ? failed : null;

  return (
    <main className="container prep">
      <nav aria-label="Đường dẫn" className="label-md crumbs">
        <Link href="/my-sessions" className="c-variant">
          Buổi của tôi
        </Link>
        <ChevronRightIcon size={14} className="c-outline" />
        <span aria-current="page">Tạo chủ đề của bạn</span>
      </nav>
      <div className="prep-grid">
      <CustomTopicForm
        quota={{ block: quota.block, runningSessionId: quota.runningSessionId, freeLeft: quota.freeLeft, attemptsLeftToday: quota.attemptsLeftToday }}
        initial={{ topic: retried?.attempt.topicText ?? "", focus: retried?.attempt.focusRaw ?? "", retryOf: retried?.session.id ?? null }}
        waitlisted={await isOnWaitlist(db, user.id, "custom_topics")}
      />
      <aside className="card ct-info">
        <div className="ct-info-head">
          <span className="label-lg">
            <ShieldIcon size={18} />
            Trước khi tạo
          </span>
          <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>
        </div>
        <ul>
          {CUSTOM_TOPIC_INFO.map((line, index) => (
            <li key={line} className={index === CUSTOM_TOPIC_INFO.length - 1 ? "ct-info-strong" : undefined}>
              <p className="body-md">{line}</p>
            </li>
          ))}
        </ul>
      </aside>
      </div>
    </main>
  );
}

/**
 * Màn 10 · Tạo chủ đề của bạn. Sign-in and the data notice come first, as before every page that
 * writes data; the limits then load behind the standard skeleton.
 */
export default async function CustomTopicPage({ searchParams }: { searchParams: Promise<{ retry?: string }> }) {
  const { retry } = await searchParams;
  const user = await requireAckedUser(retry && isUuid(retry) ? `/custom-topic?retry=${retry}` : "/custom-topic");
  return (
    <Suspense fallback={<PrepSkeleton />}>
      <CustomTopic user={user} retry={retry} />
    </Suspense>
  );
}
