import { GuideCheckForm } from "@/components/guide-check/guide-check-form";
import { getDb } from "@/db/client";
import { requireAckedUser } from "@/server/auth";
import { guideChecksLeft } from "@/server/guide-check";

export const metadata = { title: "Kiểm tra bộ câu hỏi · InterviewLab" };

/**
 * Kiểm tra bộ câu hỏi: the learner pastes the questions they plan to ask real users of their app
 * idea, and gets each one labelled with a hint. The app database keeps counts only.
 */
export default async function GuideCheckPage() {
  const user = await requireAckedUser("/guide-check");
  const left = await guideChecksLeft(getDb(), user);
  return (
    <main className="container guide">
      <div>
        <span className="eyebrow">Trước buổi phỏng vấn thật</span>
        <h1 className="headline-lg">Kiểm tra bộ câu hỏi</h1>
        <p className="body-md c-variant">
          Dán những câu bạn định hỏi người dùng cho ý tưởng app của mình. Mỗi câu được đánh dấu: dẫn dắt, gộp nhiều câu, hỏi về tương lai giả định, câu đóng
          hay câu mở, kèm gợi ý sửa.
        </p>
      </div>
      <GuideCheckForm initialLeft={left} />
    </main>
  );
}
