import Link from "next/link";
import { after } from "next/server";
import { ActionForm } from "@/components/admin/action-form";
import { EvalProgress } from "@/components/admin/eval-progress";
import { formatUsd } from "@/components/admin/format";
import { CUSTOM_TOPIC_CHARS } from "@/config/limits";
import { getDb } from "@/db/client";
import type { Focus } from "@/db/schema";
import { getAdminDraft, listDraftTopics } from "@/server/admin/scenarios";
import { requireAdmin } from "@/server/auth";
import { runGeneration } from "@/server/generation";
import { startDraftAction } from "../actions";

/** The page restarts a draft's generation runner, which may run for minutes. */
export const maxDuration = 300;

const FOCUS_LABEL: Record<Focus, string> = {
  general: "Chung",
  follow_up: "Hỏi tiếp chi tiết",
  past_story: "Kể chuyện đã qua",
  trust: "Tạo lòng tin",
  no_leading: "Không dẫn dắt",
};

const STEP_LABEL: Record<string, string> = { generating: "Đang soạn kịch bản", validating: "Đang kiểm an toàn" };
const FAILURE_LABEL: Record<string, string> = {
  invalid: "kịch bản sinh ra không qua validate sau các lần sửa",
  unsafe_output: "kiểm an toàn đầu ra phát hiện vấn đề",
  system_error: "lỗi hệ thống (model lỗi, quá giờ hoặc chạm mức chi giữ trước)",
};

/**
 * Draft a new persona for a curated topic with the scenario generator. It costs one generator
 * call (two or three when `validate` sends it back) and one safety check, charged to the daily
 * generation budget; there is no moderation call. A pass becomes a draft version for review,
 * never a published one. With `?attempt=`, the page follows that draft.
 */
export default async function AdminNewScenarioPage({ searchParams }: { searchParams: Promise<{ attempt?: string }> }) {
  const user = await requireAdmin();
  const { attempt: attemptId } = await searchParams;
  const db = getDb();

  if (attemptId) {
    const draft = await getAdminDraft(db, user, attemptId);
    if (draft?.due) after(() => runGeneration(getDb(), draft.id).catch((error: unknown) => console.error(error)));
    return (
      <>
        <h1 className="headline-lg">Soạn persona mới</h1>
        <section className="card adm-panel">
          {!draft ? (
            <p className="body-sm c-outline">Không tìm thấy bản nháp này.</p>
          ) : draft.outcome === "running" ? (
            <EvalProgress label={`${STEP_LABEL[draft.step ?? "generating"] ?? "Đang soạn"} cho ${draft.personaId}… trang tự cập nhật.`} />
          ) : draft.outcome === "passed" ? (
            <p>
              Đã lưu {draft.personaId} thành bản nháp ({formatUsd(draft.costActualUsd)}).{" "}
              <Link href={`/admin/scenarios/${encodeURIComponent(draft.personaId!)}`}>Mở để duyệt</Link>
            </p>
          ) : (
            <p className="c-error">
              Không soạn được: {FAILURE_LABEL[draft.failureCode ?? "system_error"] ?? draft.failureCode} ({formatUsd(draft.costActualUsd)}).
            </p>
          )}
          <Link href="/admin/scenarios/new" className="btn-link">
            Soạn persona khác
          </Link>
        </section>
      </>
    );
  }

  const topics = await listDraftTopics(db, user);
  return (
    <>
      <div className="adm-stack">
        <Link href="/admin/scenarios" className="btn-link">
          ← Kịch bản
        </Link>
        <h1 className="headline-lg">Soạn persona mới</h1>
        <p className="body-sm c-variant">
          Sinh bằng trình soạn kịch bản rồi kiểm validate và an toàn. Tốn một vài lần gọi model, tính vào ngân sách sinh kịch bản trong ngày. Kết quả là bản
          nháp: cần eval lean, duyệt và publish như mọi persona.
        </p>
      </div>
      <section className="card adm-panel">
        <ActionForm action={startDraftAction} className="adm-stack">
          <div className="field">
            <label htmlFor="draft-topic">Chủ đề</label>
            <select id="draft-topic" name="topicId" className="select" required>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="draft-persona">Mã persona mới</label>
            <input id="draft-persona" name="personaId" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} placeholder="vd: anh-minh" />
          </div>
          <div className="field">
            <label htmlFor="draft-text">Mô tả cho trình soạn</label>
            <textarea
              id="draft-text"
              name="topicText"
              className="textarea"
              rows={3}
              required
              minLength={CUSTOM_TOPIC_CHARS.min}
              maxLength={CUSTOM_TOPIC_CHARS.max}
              placeholder="Người dùng nào, trong bối cảnh nào, app định làm gì"
            />
          </div>
          <div className="field">
            <label htmlFor="draft-focus">Kỹ năng muốn luyện</label>
            <select id="draft-focus" name="focus" className="select" defaultValue="general">
              {(Object.keys(FOCUS_LABEL) as Focus[]).map((focus) => (
                <option key={focus} value={focus}>
                  {FOCUS_LABEL[focus]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-md">
            Soạn bản nháp
          </button>
        </ActionForm>
      </section>
    </>
  );
}
