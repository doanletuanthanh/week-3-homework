import { LIBRARY } from "@/strings/product-strings";
import { Skeleton, SkeletonStatus } from "./skeleton";

/**
 * The standard loading state of each page (PRD §6.0). Each is the fallback of a boundary inside
 * its page, placed after the checks that can end in "not found" or a sign-in: those still answer
 * with their own status before anything is sent.
 */

/** Màn 9: the heading, then rows in the shape of the list. */
export function SessionListSkeleton() {
  return (
    <div>
      <SkeletonStatus label="Đang tải Buổi của tôi" />
      <div className="mine-head">
        <div>
          <span className="eyebrow">Lịch sử luyện tập</span>
          <h1 className="headline-lg">Buổi của tôi</h1>
        </div>
      </div>
      <section className="card slist">
        {[62, 48, 55].map((width) => (
          <div className="srow srow-skel" key={width}>
            <Skeleton width={44} height={44} radius={12} />
            <div className="srow-who">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={`${width + 20}%`} height={12} />
            </div>
            <Skeleton width={44} height={14} className="srow-date" />
            <span className="srow-res" />
            <span className="act">
              <Skeleton width={96} height={24} radius={999} />
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Màn 2: the heading, the chips, then cards in the shape of the grid. */
export function LibrarySkeleton() {
  return (
    <div>
      <SkeletonStatus label="Đang tải Thư viện" />
      <span className="eyebrow">Thư viện</span>
      <h1 className="headline-lg">{LIBRARY.title}</h1>
      <div className="lib-bar">
        <div className="chips">
          {[58, 56, 57, 70].map((width) => (
            <Skeleton key={width} width={width} height={36} radius={999} />
          ))}
        </div>
      </div>
      <div className="lib-grid">
        <Skeleton width="100%" height={92} radius={12} className="lib-create" />
        {[70, 55, 62].map((width) => (
          <div className="card tcard" key={width}>
            <div className="tbody">
              <Skeleton width={48} height={48} radius={12} />
              <Skeleton width={`${width}%`} height={24} />
              <Skeleton width="100%" height={14} />
              <Skeleton width={`${width + 10}%`} height={14} />
            </div>
            <div className="tfoot">
              <Skeleton width={72} height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Màn 2b: the breadcrumb, the topic's head, the warning, then cards in the shape of the persona cards. */
export function TopicSkeleton() {
  return (
    <div>
      <SkeletonStatus label="Đang tải chủ đề" />
      <Skeleton width={260} height={14} />
      <div className="topic-head">
        <div className="topic-what">
          <Skeleton width={64} height={64} radius={12} />
          <div className="skel-stack">
            <Skeleton width={120} height={20} radius={999} />
            <Skeleton width={300} height={36} />
            <Skeleton width={240} height={16} />
          </div>
        </div>
      </div>
      <Skeleton width="100%" height={72} radius={10} className="topic-warning" />
      <div className="lib-grid">
        {[60, 72, 54].map((width) => (
          <div className="card pcard" key={width}>
            <div className="pcard-body">
              <div className="pcard-who">
                <Skeleton width={64} height={64} radius="50%" />
                <div className="skel-stack">
                  <Skeleton width={150} height={24} />
                  <Skeleton width={`${width}%`} height={14} />
                </div>
              </div>
              <Skeleton width="100%" height={84} radius={12} />
              <Skeleton width="100%" height={58} radius={8} />
            </div>
            <div className="actionbar">
              <Skeleton width={96} height={36} radius={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Màn 3: the persona card and the rules beside it. */
export function PrepSkeleton() {
  return (
    <main className="container prep">
      <SkeletonStatus label="Đang tải màn chuẩn bị" />
      <Skeleton width={260} height={14} />
      <div className="prep-grid">
        <div className="card prep-card">
          <div className="prep-body">
            <div className="prep-who">
              <Skeleton width={72} height={72} radius="50%" />
              <div className="skel-stack">
                <Skeleton width={180} height={28} />
                <Skeleton width={260} height={14} />
              </div>
            </div>
            <Skeleton width="100%" height={96} radius={12} />
            <Skeleton width="70%" height={18} />
          </div>
        </div>
        <div className="card prep-rules skel-stack">
          <Skeleton width={120} height={12} />
          <Skeleton width={200} height={24} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="80%" height={16} />
          <Skeleton width="60%" height={16} />
          <Skeleton width="100%" height={52} radius={8} />
        </div>
      </div>
    </main>
  );
}

/**
 * A session. Its screen depends on its state, which is being read, so the blocks have the shape
 * every one of them shares: a head line over a column of content.
 */
export function SessionSkeleton() {
  return (
    <main className="reveal">
      <SkeletonStatus label="Đang tải buổi luyện" />
      <div className="reveal-col">
        <section className="card-lg reveal-skel">
          <Skeleton width={180} height={12} />
          <Skeleton width="72%" height={36} />
          <Skeleton width="48%" height={16} />
        </section>
        <section className="card reveal-skel">
          <Skeleton width="90%" height={16} />
          <Skeleton width="82%" height={16} />
          <Skeleton width="64%" height={16} />
        </section>
      </div>
    </main>
  );
}
