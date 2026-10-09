import Link from "next/link";
import { ArrowRightIcon, ChatIcon, GoogleIcon, GridIcon, LayersIcon, LockIcon, ReplayIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getDb } from "@/db/client";
import { getFirstPersonaId } from "@/db/repo/sessions";

const STEPS = [
  {
    title: "Gặp persona",
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

/** Màn 1 · Trang chủ. Guests can read it; the one persona of this slice is reached from the hero. */
export default async function HomePage() {
  const personaId = await getFirstPersonaId(getDb());

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
          {personaId && (
            <>
              <Link className="btn btn-primary btn-lg" href={`/prep/${personaId}`}>
                Bắt đầu luyện
                <ArrowRightIcon />
              </Link>
              <Link className="btn btn-tonal btn-lg hero-second" href="/custom-topic">
                Tạo chủ đề của bạn
              </Link>
              <p className="body-sm c-outline hint">
                <GoogleIcon size={14} />
                Đăng nhập Google khi bắt đầu
              </p>
            </>
          )}

          {/* Reveal preview: stays a placeholder until a demo session can be seeded. */}
          <div className="window hero-window" aria-hidden="true">
            <div className="window-bar">
              <span className="wdots">
                <i />
                <i />
                <i />
              </span>
              <span className="pill pill-primary">
                <LayersIcon size={14} />
                Tảng băng lộ diện
              </span>
            </div>
            <div className="hero-window-body">
              <span className="sk" style={{ width: "40%" }} />
              <span className="sk" style={{ width: "72%" }} />
              <span className="sk" style={{ width: "58%" }} />
            </div>
          </div>
        </div>
      </section>

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
                      <PersonaAvatar size={26} />
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
    </main>
  );
}
