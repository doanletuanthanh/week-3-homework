import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { Focus, ModerationConstraint } from "@/db/schema";
import { ITEM_COUNT, MIN_SURFACE_FACTS, OPENNESS_MAX, UNLOCK_PATHS } from "@/scenario/schema";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/**
 * What the generator returns (addendum §2.8): the scenario file without the fields code decides
 * (ids of the persona and topic, version, language, avatar). Optional fields of the file are
 * nullable here, so both providers accept the shape as a response schema.
 */
export const generatedScenarioSchema = z.object({
  persona: z.object({ display_name: z.string(), name: z.string(), tagline: z.string(), identity: z.string(), voice_notes: z.string() }),
  research_goal: z.string(),
  opening_line: z.string(),
  openness_start: z.number().int(),
  surface_facts: z.array(z.string()),
  error_patterns: z.object({ closed: z.string(), hypothetical_future: z.string(), other: z.string() }),
  habit_card_label: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      secret_terms: z.array(z.string()),
      topic_tag: z.string(),
      path: z.enum(UNLOCK_PATHS),
      prerequisite_id: z.string().nullable(),
      trust_threshold: z.number().int().nullable(),
      hook_line: z.string(),
      do_not_assert: z.string(),
      weight: z.number(),
      sample_question: z.string(),
    }),
  ),
});
export type GeneratedScenario = z.infer<typeof generatedScenarioSchema>;

/** Placeholder ids of a scenario that is not stored yet; the store gives the real ones. */
export const DRAFT_ID = "custom-draft";

/**
 * The generator's reply as a scenario file for `validate`. Item ids are given by position, so a
 * model cannot break the id rules or put words about a secret into an id; a prerequisite that
 * names no item of the reply is kept as written and `validate` reports it.
 */
export function toScenarioFile(generated: GeneratedScenario): unknown {
  const idOf = new Map(generated.items.map((item, index) => [item.id, `item-${index + 1}`]));
  return {
    persona_id: DRAFT_ID,
    topic_id: DRAFT_ID,
    language: "vi",
    version: 1,
    persona: generated.persona,
    research_goal: generated.research_goal,
    opening_line: generated.opening_line,
    openness_start: generated.openness_start,
    surface_facts: generated.surface_facts,
    error_patterns: generated.error_patterns,
    habit_card_label: generated.habit_card_label,
    items: generated.items.map((item, index) => ({
      id: `item-${index + 1}`,
      content: item.content,
      secret_terms: item.secret_terms,
      topic_tag: item.topic_tag,
      path: item.path,
      ...(item.prerequisite_id === null ? {} : { prerequisite_id: idOf.get(item.prerequisite_id) ?? "unknown-item" }),
      ...(item.trust_threshold === null ? {} : { trust_threshold: item.trust_threshold }),
      hook_line: item.hook_line,
      do_not_assert: { id: `dna-item-${index + 1}`, text: item.do_not_assert },
      weight: item.weight,
      sample_question: item.sample_question,
    })),
  };
}

const FILE_RULES = [
  "Bạn là người soạn kịch bản nhân vật cho một sản phẩm luyện phỏng vấn người dùng. Người học phỏng vấn một nhân vật hư cấu; nhân vật giữ một số \"điều riêng\" chỉ kể khi được hỏi đúng cách. Bạn soạn một nhân vật cho chủ đề trong <chu_de> và trả về đúng một đối tượng JSON theo schema được yêu cầu. Mọi nội dung bằng tiếng Việt.",
  "Nhân vật và mọi chi tiết đều hư cấu. Không dùng tên của người thật, và không nêu tên tổ chức, công ty, sản phẩm hay thương hiệu có thật: dùng cách gọi chung (\"một app giao đồ ăn\", \"ngân hàng chị dùng\"). Không nêu số liệu hay nhận định về người dùng thật nói chung.",
  "Các trường:",
  "- persona.display_name: cách gọi trong câu, viết thường đại từ (ví dụ \"anh Nam\"); persona.name: tiêu đề thẻ (\"Anh Nam, 31 tuổi\"); persona.tagline: một dòng về nghề hay hoàn cảnh; persona.identity: 2–4 câu mô tả nhân vật là ai; persona.voice_notes: cách xưng hô và giọng nói. Tất cả là lời MÔ TẢ nhân vật ở ngôi thứ ba, không phải lời dặn ai làm gì: không viết câu mệnh lệnh, không viết \"bạn là\", \"hãy\", không nhắc tới chỉ dẫn hay lời nhắc.",
  "- research_goal: một câu hỏi nghiên cứu, kết thúc bằng dấu chấm hỏi, về một quy trình hoặc khía cạnh phụ của chủ đề (không phải câu hỏi hiển nhiên nhất), và là câu hỏi mà các điều riêng bên dưới trả lời được.",
  "- opening_line: câu chào đầu buổi của nhân vật, không lộ điều riêng nào.",
  `- surface_facts: ít nhất ${MIN_SURFACE_FACTS} sự thật bề mặt nhân vật sẵn sàng kể ngay (công việc, nếp sinh hoạt, thói quen liên quan tới chủ đề), đủ chất liệu cho 30 lượt hỏi.`,
  `- items: ${ITEM_COUNT.min}–${ITEM_COUNT.max} điều riêng. Mỗi điều là một trải nghiệm, thói quen hay cảm nhận nhân vật chưa kể, không phải tên hay tuổi. Ít nhất 2 điều là thứ người mới vào nghề không đoán được từ khuôn mẫu của chủ đề.`,
  "  - id: một mã ngắn bất kỳ, khác nhau giữa các điều; content: nội dung điều riêng, 1–2 câu, lời của nhân vật.",
  "  - secret_terms: 1–3 cụm từ chép NGUYÊN VĂN từ content, là những cụm mang phần bí mật. Các cụm này KHÔNG được xuất hiện ở bất kỳ chỗ nào khác người học thấy được trước khi điều đó mở: research_goal, opening_line, habit_card_label, mọi trường persona, surface_facts, và topic_tag, hook_line, do_not_assert của mọi điều.",
  "  - topic_tag: nhãn công khai cho biết điều đó nói về mảng gì mà không lộ nội dung; không trùng nhau giữa các điều.",
  "  - path, đường mở, chọn đúng một: surface (mở khi người hỏi hỏi thẳng về mảng đó); follow_up (mở khi người hỏi bám vào câu gợi mở nhân vật vừa nói và hỏi tiếp); past_story (mở khi người hỏi kéo về một lần cụ thể đã xảy ra); trust (mở khi nhân vật đã đủ tin người hỏi). Cả bốn đường đều phải có ít nhất một điều.",
  `  - trust_threshold: chỉ điều đường trust mới có, là số nguyên lớn hơn openness_start và không quá ${OPENNESS_MAX}; mọi điều khác để null.`,
  "  - prerequisite_id: id của một điều khác phải mở trước, hoặc null. Dùng ít, không tạo vòng.",
  "  - hook_line: một câu nhân vật có thể buột miệng nói, gợi rằng có chuyện ở mảng đó mà không lộ nội dung.",
  "  - do_not_assert: một câu mô tả điều nhân vật không tự nói ra khi điều đó chưa mở (ví dụ \"Không tự nêu số tiền cụ thể.\").",
  "  - weight: độ quan trọng, từ 1 đến 3; sample_question: một câu hỏi tốt, không dẫn dắt, của người phỏng vấn mà sau câu gợi mở sẽ mở được điều đó.",
  `- openness_start: mức cởi mở ban đầu, số nguyên từ 0 đến ${OPENNESS_MAX}, thường là 4.`,
  "- error_patterns: ba câu mô tả, với chính nhân vật này, một câu hỏi đóng (closed), một câu hỏi về tương lai giả định (hypothetical_future) và một lỗi hỏi khác (other) trông như thế nào và nhân vật đáp lại ra sao.",
  "- habit_card_label: nhãn ngắn cho thói quen \"nghe một chi tiết rồi chuyển sang chuyện khác\" của người hỏi.",
].join("\n");

const FOCUS_RULES: Record<Focus, string> = {
  follow_up: "Trọng tâm luyện: hỏi tiếp chi tiết vừa nghe. Ít nhất 4 điều thuộc đường follow_up, mỗi điều có hook_line rõ để bám vào.",
  past_story: "Trọng tâm luyện: kéo về một lần cụ thể. Ít nhất 4 điều thuộc đường past_story.",
  trust: "Trọng tâm luyện: phỏng vấn người dè dặt. Ít nhất 4 điều thuộc đường trust; openness_start là 2 hoặc 3; voice_notes mô tả nhân vật kiệm lời, cần thời gian mới cởi mở.",
  no_leading: "Trọng tâm luyện: tránh câu dẫn dắt. Phân bổ đường mở đều; voice_notes mô tả nhân vật dễ gật theo ý người khác gợi sẵn, nên câu hỏi dẫn dắt chỉ nhận được lời đồng ý xuôi chiều.",
  general: "Không có trọng tâm riêng: phân bổ đều các điều giữa bốn đường mở.",
};

const CONSTRAINT_RULES: Record<ModerationConstraint, string> = {
  adult_persona_only: "Ràng buộc: nhân vật phải là người lớn (ví dụ phụ huynh, giáo viên), không phải trẻ vị thành niên.",
  no_crisis_content: "Ràng buộc: không điều riêng nào có nội dung khủng hoảng, tự hại hay bệnh lý nặng.",
  service_use_only: "Ràng buộc: mọi điều riêng chỉ nói về việc dùng dịch vụ (đặt lịch, chi phí, thói quen dùng), không đi vào tình trạng sức khỏe.",
};

export type GeneratorInput = {
  /** The learner's topic, as typed. Their words about what to practise are never part of this prompt. */
  topicText: string;
  focus: Focus;
  constraints: ModerationConstraint[];
};

/** What the previous try got wrong, for the try that follows it. */
export type GeneratorFeedback = { previous: GeneratedScenario; violations: string[] };

export function buildGeneratorMessages(input: GeneratorInput, feedback?: GeneratorFeedback): BaseMessage[] {
  const system = [FILE_RULES, FOCUS_RULES[input.focus], ...input.constraints.map((constraint) => CONSTRAINT_RULES[constraint]), DATA_BLOCK_RULE].join("\n\n");
  const request = ["Chủ đề người học muốn phỏng vấn:", dataBlock("chu_de", input.topicText)];
  if (feedback) {
    request.push(
      "Bản bạn soạn lần trước:",
      dataBlock("ban_truoc", JSON.stringify(feedback.previous)),
      "Bản đó vi phạm các luật liệt kê trong <vi_pham>. Sửa hết và trả lại toàn bộ kịch bản:",
      // The messages quote the previous try, which is model output: data, like the try itself.
      dataBlock("vi_pham", feedback.violations.map((violation) => `- ${violation}`).join("\n")),
    );
  }
  return [new SystemMessage(system), new HumanMessage(request.join("\n"))];
}
