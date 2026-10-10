import Link from "next/link";
import { SampleResult } from "@/components/home/sample-result";
import { ArrowRightIcon, ChatIcon, GoogleIcon, GridIcon, LayersIcon, LockIcon, ReplayIcon } from "@/components/icons";
import { TopicCard } from "@/components/library/topic-card";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getDb } from "@/db/client";
import { getConfig } from "@/db/repo/config";
import { listLibraryTopics } from "@/server/library";
import { HOME, LIBRARY } from "@/strings/product-strings";

/** How many topics the home page shows of the library. */
const PREVIEW_TOPICS = 3;

const STEPS = [
  {
    title: "Chọn chủ đề và persona",
    body: "Mỗi persona giữ 8–12 điều chưa nói, chỉ kể khi bạn hỏi đúng cách.",
    icon: <GridIcon />,
  },
  {
    title: "Phỏng vấn người dùng, kèm ghi chú",
    body: "Chat như gặp người thật. Ghi lại điều bạn thấy quan trọng.",
    icon: <ChatIcon />,
  },
  {
    title: "Đoán, rồi xem tảng băng",
    body: "Mỗi điều kèm đúng lượt trong transcript và trong ghi chú của bạn.",
    icon: <LayersIcon />,
  },
  {
    title: "Luyện lại khoảnh khắc bị lỡ",
    body: "Quay về đúng lượt bạn bỏ qua một chi tiết. Bạn có 3 lượt để hỏi lại.",
    icon: <ReplayIcon />,
  },
];

/**
 * Màn 1 · Trang chủ. The same page for everyone: it leads to the library and to a topic of one's
 * own, and shows the first topics of the library without anyone's progress.
 */
export default async function HomePage() {
  const db = getDb();
  const topics = (await listLibraryTopics(db, { requirePublished: await getConfig(db, "require_published"), userId: null })).slice(0, PREVIEW_TOPICS);

  return (
    <main>
      <section className="hero">
        <div className="hero-glow" />
        <div className="container hero-inner">
          <span className="badge">
            <span className="dot" />
            <span className="t">Phòng tập phỏng vấn người dùng và stakeholder</span>
          </span>
          <h1 className="hero-title">
            Luyện phỏng vấn người dùng.
            <br />
            <span className="italic c-primary">Xem chính xác bạn đã bỏ lỡ điều gì.</span>
          </h1>
          <p className="body-lg c-variant">Mắc lỗi ở đây, đừng mắc trước người thật.</p>
          <Link className="btn btn-primary btn-lg" href="/library">
            {LIBRARY.enter}
            <ArrowRightIcon />
          </Link>
          <Link className="btn btn-tonal btn-lg hero-second" href="/custom-topic">
            {LIBRARY.create_action}
          </Link>
          <p className="body-sm c-outline hint">
            <GoogleIcon size={14} />
            Đăng nhập Google khi bắt đầu
          </p>

          <SampleResult />
        </div>
      </section>

      {topics.length > 0 && (
        <section className="home-lib" aria-labelledby="home-lib-title">
          <div className="container">
            <div className="home-lib-head">
              <div>
                <span className="eyebrow">{LIBRARY.name}</span>
                <h2 id="home-lib-title" className="headline-lg">
                  {HOME.library_title}
                </h2>
              </div>
              <Link className="btn btn-surface btn-md" href="/library">
                {HOME.library_all}
                <ArrowRightIcon size={16} />
              </Link>
            </div>
            <div className="lib-grid">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} level={3} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="steps">
        <div className="container">
          <div className="steps-head">
            <span className="eyebrow">Một buổi luyện</span>
            <h2 className="headline-lg">Hỏi, nghe, rồi thấy mình lỡ ở đâu</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map((step, index) => (
              <div className="card step" key={step.title}>
                <div className="step-top">
                  <span className="step-num">{String(index + 1).padStart(2, "0")}</span>
                  <span className="icon-circle">{step.icon}</span>
                </div>
                <h3 className="label-lg">{step.title}</h3>
                <p className="body-sm c-variant">{step.body}</p>
                {index === 0 && (
                  <div className="widget">
                    <div className="widget-row">
                      <PersonaAvatar size={26} avatarKey="thu" name="chị Thu" />
                      <span className="pill pill-tertiary">
                        <LockIcon size={11} strokeWidth={2.4} />
                        Đang giữ từ lượt đầu
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-close" aria-labelledby="home-close-title">
        <div className="container">
          <div className="card-lg home-close-card">
            <div className="home-close-text">
              <span className="eyebrow">{LIBRARY.create_action}</span>
              <h2 id="home-close-title" className="headline-lg">
                {LIBRARY.create_title}
              </h2>
              <p className="body-lg c-variant">{HOME.create_body}</p>
            </div>
            <div className="home-close-actions">
              <Link className="btn btn-primary btn-lg" href="/custom-topic">
                {LIBRARY.create_action}
              </Link>
              <Link className="btn btn-surface btn-lg" href="/library">
                {LIBRARY.enter}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
