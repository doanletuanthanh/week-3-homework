import type { Executor } from "./client";
import { scenarios, topics, type ScenarioContent } from "./schema";

export const SKELETON_TOPIC_ID = "ux-chi-tieu";
export const SKELETON_PERSONA_ID = "chi-thu";

/**
 * The walking-skeleton persona: identity, opening line and surface facts only. It holds no
 * sealed items; the full scenario imported by the `import` command replaces it as a new version.
 */
const content: ScenarioContent = {
  persona: {
    displayName: "Chị Thu, 26 tuổi",
    tagline: "Kế toán ở một công ty logistics",
    identity:
      "Bạn là Thu, 26 tuổi, làm kế toán ở một công ty logistics tại TP.HCM được ba năm. Bạn sống cùng một người bạn ở phòng trọ thuê chung, tự lo chi tiêu hằng tháng. Bạn nói chuyện thân thiện, hơi kiệm lời với người mới quen, xưng \"chị\" và gọi người hỏi là \"em\".",
  },
  researchGoal: "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?",
  openingLine: "Chào em, chị là Thu. Em cứ hỏi tự nhiên nha, chị trả lời được gì thì trả lời.",
  surfaceFacts: [
    "Lương về tài khoản vào ngày 5 hằng tháng.",
    "Khoản cố định mỗi tháng gồm tiền trọ chia đôi với bạn cùng phòng, tiền xăng và tiền gửi về cho ba mẹ.",
    "Bữa trưa thường ăn cơm văn phòng gần công ty, tối hay tự nấu.",
    "Thanh toán chủ yếu bằng chuyển khoản và ví điện tử, ít khi cầm tiền mặt.",
    "Cuối tháng thường thấy tiền hết nhanh hơn mình nghĩ.",
    "Đã vài lần thử ghi lại chi tiêu nhưng không lần nào kéo dài.",
  ],
};

/** Inserts the topic and persona if they are missing. Safe to run again. */
export async function seedSkeletonPersona(db: Executor): Promise<void> {
  await db
    .insert(topics)
    .values({
      id: SKELETON_TOPIC_ID,
      title: "Chi tiêu hằng ngày của người trẻ đi làm",
      summary: "Người mới đi làm tiêu, ghi và xoay xở tiền tới cuối tháng ra sao.",
    })
    .onConflictDoNothing();
  await db
    .insert(scenarios)
    .values({ personaId: SKELETON_PERSONA_ID, topicId: SKELETON_TOPIC_ID, version: 1, content })
    .onConflictDoNothing();
}
