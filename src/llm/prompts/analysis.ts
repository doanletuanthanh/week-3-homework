import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { AnalysisContext, TranscriptLine, VerdictMaterial } from "@/engine/contexts";
import { tokenize } from "@/engine/tokens";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/** One line per speaker and turn. Tokens are re-joined by single spaces, so no text can start a line of its own. */
export function renderTranscript(transcript: TranscriptLine[]): string {
  const oneLine = (text: string) => tokenize(text).join(" ");
  return transcript
    .flatMap((turn) => [
      ...(turn.learnerText === null ? [] : [`[lượt ${turn.index}] người hỏi: ${oneLine(turn.learnerText)}`]),
      `[lượt ${turn.index}] nhân vật: ${oneLine(turn.personaText)}`,
    ])
    .join("\n");
}

const list = (lines: string[]) => (lines.length > 0 ? lines.join("\n") : "(không có)");

export const VERDICT_RULES = [
  "Phán đoán lượt trả lời của nhân vật ở lượt được nêu trong <luot_can_phan_doan> (trường prev_turn_verdict):",
  "- hook_dropped: true chỉ khi <cau_goi_mo_duoc_chon> có một câu, và lượt đó của nhân vật thật sự nói ra ý của câu đó (nguyên văn hoặc diễn đạt lại rõ ràng). Không có câu nào được chọn thì false.",
  "- disclosed_item_ids: mã (I...) của những điều trong <dieu_da_mo> đang ghi \"chưa kể\" mà lượt đó nhân vật đã kể ra phần chính. Chỉ nhắc lướt, nói chung chung thì không tính.",
  "- violations: mã (D...) của những điều trong <dieu_can_tranh> mà lượt đó nhân vật đã tự nói ra. Nói đúng câu gợi mở được chọn thì không phải vi phạm.",
].join("\n");

/** The static head shared by Call 1 and the turn judge: who the persona is and what is public. */
export function renderPersonaFacts(material: VerdictMaterial): string {
  return [
    dataBlock("nhan_vat", `${material.persona.displayName}. ${material.persona.identity}`),
    dataBlock("su_that_be_mat", list(material.surfaceFacts.map((fact) => `- ${fact}`))),
  ].join("\n");
}

/** The per-turn blocks a verdict is judged against. */
export function renderVerdictMaterial(material: VerdictMaterial): string {
  return [
    dataBlock("hoi_thoai", renderTranscript(material.transcript)),
    dataBlock(
      "dieu_da_mo",
      list(material.unlockedItems.map((item) => `${item.alias} (${item.told ? "đã kể" : "chưa kể"}): ${item.content}`)),
    ),
    dataBlock(
      "cau_goi_mo_da_tha",
      list(material.droppedHooks.map((hook) => `${hook.alias} (nhân vật nói ở lượt ${hook.droppedAt}): ${hook.line}`)),
    ),
    dataBlock("cau_goi_mo_duoc_chon", material.selectedHook ? `${material.selectedHook.alias}: ${material.selectedHook.line}` : "(không có)"),
    dataBlock("dieu_can_tranh", list(material.doNotAssert.map((rule) => `${rule.alias}: ${rule.text}`))),
    `<luot_can_phan_doan>${material.judgedTurn}</luot_can_phan_doan>`,
  ].join("\n");
}

// The examples are about commuting on purpose: they must not resemble any scenario.
/** What each label means: shared by Call 1 and by the replay judge when it labels a question. */
export const LABEL_DEFINITIONS = [
  "- confirm_grounded: câu hỏi xác nhận hoặc hỏi sâu thêm về điều chính nhân vật đã nói ở một lượt trước, không thêm ý mới. Ví dụ: nhân vật nói \"có dạo anh định đi xe buýt nhưng rồi thôi\", người hỏi: \"Dạo anh định đi xe buýt đó, chuyện thế nào ạ?\".",
  "- boundary_probe: câu hỏi dò ranh giới của điều nhân vật đã nói (bao lâu, những lúc nào, ngoại lệ, tách nghĩa một cụm nhân vật vừa dùng). Ví dụ: nhân vật nói \"đi vậy cũng hơi oải\", người hỏi: \"'Oải' là sao ạ anh?\".",
  "- open: câu hỏi mở hoặc trung tính, không dựa vào lời nào của nhân vật và không cài sẵn câu trả lời. Ví dụ: \"Buổi sáng anh thường đi làm thế nào ạ?\".",
  "- leading: người hỏi tự thêm một nguyên nhân, một phán xét, một giải pháp hay một nội dung mà nhân vật chưa nói, rồi mời nhân vật đồng ý. Ví dụ: \"Anh có muốn một ứng dụng báo giờ xe buýt không?\" (người hỏi tự thêm \"ứng dụng báo giờ xe buýt\"); \"Chắc tại anh ngại dậy sớm nên mới thôi đúng không?\".",
].join("\n");

const LABEL_RULES = [
  "Gán nhãn cho câu hỏi mới của người hỏi (trường label), chọn đúng một:",
  LABEL_DEFINITIONS,
  "Bằng chứng bắt buộc đi kèm nhãn:",
  "- Với confirm_grounded hoặc boundary_probe: grounded_turn_id là số lượt của câu nhân vật mà câu hỏi dựa vào (số trong [lượt N] nhân vật). Không chỉ ra được lượt nào thì dùng nhãn open.",
  "- Với leading: introduced_span là [chỉ số token đầu, chỉ số token cuối] (tính cả hai đầu) của cụm người hỏi tự thêm, theo cách đánh số trong <cau_hoi_moi>. Không chỉ ra được cụm nào thì dùng nhãn open.",
  "- Các trường bằng chứng không dùng tới thì để null.",
  "Loại câu hỏi (trường question_type): open (câu hỏi mở), closed (chỉ trả lời có/không hoặc chọn một), hypothetical_future (hỏi về điều sẽ làm hoặc nếu... thì...), past_specific (hỏi về một lần cụ thể đã xảy ra), other.",
  "hook_id: mã (H...) của câu trong <cau_goi_mo_da_tha> hoặc <cau_goi_mo_duoc_chon> mà câu hỏi mới đang hỏi tiếp; không có thì null.",
  "topic_tags: mã (T...) của chủ đề trong <chu_de> mà câu hỏi mới hỏi thẳng vào; không có thì mảng rỗng. Chọn nhiều nhất một, là chủ đề khớp rõ nhất.",
].join("\n");

/**
 * Call 1 (addendum §2.1). Fixed part first so the prefix can be cached, then the transcript,
 * then what changes every turn, and the new question last. The learner question and every
 * scenario field sit inside data blocks.
 */
export function buildAnalysisMessages(context: AnalysisContext): BaseMessage[] {
  const system = [
    "Bạn là bộ phân tích của một buổi luyện phỏng vấn người dùng. Bạn không trả lời người hỏi. Bạn làm hai việc và trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    VERDICT_RULES,
    LABEL_RULES,
    "Nhân vật được phỏng vấn và những điều nhân vật sẵn sàng kể:",
    renderPersonaFacts(context),
    "Các chủ đề có thể được hỏi tới:",
    dataBlock("chu_de", list(context.topicTags.map((tag) => `${tag.alias}: ${tag.tag}`))),
  ].join("\n\n");

  const turn = [
    renderVerdictMaterial(context),
    `Câu hỏi mới của người hỏi (lượt ${context.turnIndex}), mỗi token kèm chỉ số:`,
    dataBlock("cau_hoi_moi", context.question.tokens.map((token, index) => `${index}:${token}`).join(" ")),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(turn)];
}
