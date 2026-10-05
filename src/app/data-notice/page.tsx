import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  LockIcon,
  NoPersonIcon,
  PulseIcon,
  SaveIcon,
  ShieldIcon,
  SparkIcon,
} from "@/components/icons";
import { acceptDataNotice } from "@/server/actions";
import { requireUser } from "@/server/auth";
import { safeNextPath } from "@/server/safe-next";
import { DATA_NOTICE } from "@/strings/product-strings";

export const metadata = { title: "Dữ liệu của bạn · InterviewLab" };

const ITEMS = [
  { text: DATA_NOTICE.saved, icon: <SaveIcon /> },
  { text: DATA_NOTICE.admins, icon: <EyeIcon /> },
  { text: DATA_NOTICE.aiProviders, icon: <SparkIcon /> },
  { text: DATA_NOTICE.tracing, icon: <SparkIcon /> },
  { text: DATA_NOTICE.usage, icon: <PulseIcon /> },
  { text: DATA_NOTICE.usageCounter, icon: <LockIcon /> },
  { text: DATA_NOTICE.notSold, icon: <ShieldIcon /> },
];

/** Màn 0 · Thông báo dữ liệu. Shown before any page that needs sign-in or writes data. */
export default async function DataNoticePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  const user = await requireUser(`/data-notice?next=${encodeURIComponent(next)}`);
  if (user.noticeAcked) redirect(next);

  return (
    <main className="center-page band">
      <section className="card-lg notice-card" aria-labelledby="dn-title">
        <div className="notice-head">
          <span className="notice-mark">
            <ShieldIcon size={24} />
          </span>
          <div>
            <span className="eyebrow">Trước khi tiếp tục</span>
            <h1 id="dn-title" className="headline-lg notice-title">
              Ai xem được buổi luyện của bạn
            </h1>
          </div>
        </div>

        <div className="notice-list">
          {ITEMS.map((item) => (
            <div className="ni" key={item.text}>
              <span className="ic">{item.icon}</span>
              <p className="body-md">{item.text}</p>
            </div>
          ))}
          <div className="ni">
            <span className="ic ic-amber">
              <NoPersonIcon />
            </span>
            <p className="body-md">
              <strong>{DATA_NOTICE.noRealPeople}</strong>
            </p>
          </div>
        </div>

        <form action={acceptDataNotice} className="notice-actions">
          <input type="hidden" name="next" value={next} />
          {/* Going back stores nothing and creates nothing. */}
          <Link href="/" className="btn-link notice-back">
            <ArrowLeftIcon size={16} />
            Quay lại
          </Link>
          <button type="submit" className="btn btn-primary btn-lg">
            Tôi hiểu
            <ArrowRightIcon />
          </button>
        </form>
      </section>
    </main>
  );
}
