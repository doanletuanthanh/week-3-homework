import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { FOCUSES, MODERATION_CONSTRAINTS, MODERATION_DECISIONS, REFUSAL_CODES, type Focus, type ModerationConstraint } from "@/db/schema";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/**
 * What the moderation call returns (addendum §2.7). Only `decision` is held to its set by the
 * schema; the other fields are free text that `clampModeration` holds to theirs, so a reply with
 * an unknown code is corrected in code instead of failing the call.
 */
export const moderationSchema = z.object({
  decision: z.enum(MODERATION_DECISIONS),
  reason_code: z.string().nullable(),
  constraints: z.array(z.string()),
  focus: z.string(),
});
export type RawModeration = z.infer<typeof moderationSchema>;

export type Moderation =
  | { decision: "refuse"; reasonCode: (typeof REFUSAL_CODES)[number]; focus: Focus }
  | { decision: "allow"; constraints: ModerationConstraint[]; focus: Focus };

const within = <T extends string>(set: readonly T[], value: unknown): value is T => typeof value === "string" && (set as readonly string[]).includes(value);

/**
 * The model's reply held to the closed sets (FR-53, FR-55): a focus outside the set is `general`,
 * a refusal with an unknown code is `other`. A reply that asks for constraints but names one
 * outside the list, or none at all, gets every constraint: what it meant cannot be told, and a
 * topic about minors or health must not be generated without its bounds.
 */
export function clampModeration(raw: RawModeration): Moderation {
  const focus: Focus = within(FOCUSES, raw.focus) ? raw.focus : "general";
  if (raw.decision === "refuse") return { decision: "refuse", reasonCode: within(REFUSAL_CODES, raw.reason_code) ? raw.reason_code : "other", focus };
  const constraints = [...new Set(raw.constraints.filter((entry): entry is ModerationConstraint => within(MODERATION_CONSTRAINTS, entry)))];
  const unreadable = raw.decision === "allow_with_constraints" && (constraints.length === 0 || raw.constraints.some((entry) => !within(MODERATION_CONSTRAINTS, entry)));
  return { decision: "allow", constraints: unreadable ? [...MODERATION_CONSTRAINTS] : constraints, focus };
}

const RULES = [
  "Bạn là người kiểm duyệt chủ đề của một sản phẩm luyện phỏng vấn người dùng. Người học gõ một chủ đề; hệ thống sẽ sinh một nhân vật hư cấu để họ tập phỏng vấn. Bạn trả về đúng một đối tượng JSON theo schema được yêu cầu.",
  "Trường decision, chọn đúng một:",
  '- "refuse" khi chủ đề thuộc một trong các nhóm sau, kèm reason_code tương ứng: nhắm vào một người thật có tên hoặc nhận ra được (real_person); nêu tên một tổ chức, công ty, cửa hàng, sản phẩm hay thương hiệu có thật (real_org_or_brand; sàng lọc chặt: có tên riêng của tổ chức hay thương hiệu là từ chối); nội dung tình dục (sexual); hoạt động phạm pháp (illegal); quấy rối hay hạ thấp một nhóm người (harassment); lý do khác khiến không nên sinh nhân vật (other).',
  '- "allow_with_constraints" khi chủ đề được phép nhưng cần ràng buộc (trường constraints): người dùng trong chủ đề là trẻ vị thành niên → adult_persona_only (nhân vật luôn là người lớn như phụ huynh, giáo viên); chủ đề về sức khỏe hay sức khỏe tâm thần → no_crisis_content (không có nội dung khủng hoảng hay tự hại) và service_use_only (chỉ nói về việc dùng dịch vụ).',
  '- "allow" cho mọi chủ đề còn lại. Loại hình chung chung như "quán cà phê", "ngân hàng số", "app giao đồ ăn" không phải tên riêng và được phép.',
  "Với refuse thì constraints là mảng rỗng; với hai lựa chọn còn lại thì reason_code là null.",
  "Trường focus phân loại điều người học muốn luyện, theo <muon_luyen>, chọn đúng một: follow_up (hỏi tiếp chi tiết vừa nghe), past_story (kéo về một lần cụ thể trong quá khứ), trust (phỏng vấn người dè dặt, tạo tin tưởng), no_leading (tránh câu hỏi dẫn dắt), general (để trống, không rõ, hoặc không thuộc bốn loại trên).",
].join("\n");

/** The one prompt that carries the learner's own words about what they want to practise. */
export function buildModerationMessages(input: { topic: string; focusRaw: string }): BaseMessage[] {
  return [
    new SystemMessage([RULES, DATA_BLOCK_RULE].join("\n\n")),
    new HumanMessage(["Chủ đề người học gõ:", dataBlock("chu_de", input.topic), "Điều người học muốn luyện:", dataBlock("muon_luyen", input.focusRaw || "(để trống)")].join("\n")),
  ];
}
