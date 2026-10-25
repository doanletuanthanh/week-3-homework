import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { MEMORY_LIMITS, ROUTE_BROAD_MAX } from "@/config/limits";
import type { AnalysisContext, TranscriptLine, VerdictMaterial } from "@/engine/contexts";
import { tokenize } from "@/engine/tokens";
import { LABELS, type Label } from "@/engine/types";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

/** Learner or model text on one line: tokens re-joined by single spaces, so no text can start a line of its own. */
export const oneLine = (text: string) => tokenize(text).join(" ");

/** One line per speaker and turn. */
export function renderTranscript(transcript: TranscriptLine[]): string {
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

/** One line per older exchange, `[lượt N] gist`: model-written, so rendered like the transcript. */
export const renderGists = (earlier: VerdictMaterial["memory"]["earlier"]) => earlier.map((entry) => `[lượt ${entry.turn}] ${oneLine(entry.gist)}`).join("\n");

/** The per-turn blocks a verdict is judged against. Older exchanges come first, as their gists. */
export function renderVerdictMaterial(material: VerdictMaterial): string {
  return [
    ...(material.memory.earlier.length > 0
      ? ["Tóm tắt các lượt cũ hơn, mỗi lượt một dòng:", dataBlock("bo_nho", renderGists(material.memory.earlier))]
      : []),
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
/** What each label means: shared by Call 1, by the replay judge when it labels a question, and by the guide check. */
export const LABEL_DEFINITION: Record<Label, string> = {
  confirm_grounded: "- confirm_grounded: câu hỏi xác nhận hoặc hỏi sâu thêm về điều chính nhân vật đã nói ở một lượt trước, không thêm ý mới. Ví dụ: nhân vật nói \"có dạo anh định đi xe buýt nhưng rồi thôi\", người hỏi: \"Dạo anh định đi xe buýt đó, chuyện thế nào ạ?\".",
  boundary_probe: "- boundary_probe: câu hỏi dò ranh giới của điều nhân vật đã nói (bao lâu, những lúc nào, ngoại lệ, tách nghĩa một cụm nhân vật vừa dùng). Ví dụ: nhân vật nói \"đi vậy cũng hơi oải\", người hỏi: \"'Oải' là sao ạ anh?\".",
  open: "- open: câu hỏi mở hoặc trung tính, không dựa vào lời nào của nhân vật và không cài sẵn câu trả lời. Ví dụ: \"Buổi sáng anh thường đi làm thế nào ạ?\".",
  leading: "- leading: người hỏi tự thêm một nguyên nhân, một phán xét, một giải pháp hay một nội dung mà nhân vật chưa nói, rồi mời nhân vật đồng ý. Ví dụ: \"Anh có muốn một ứng dụng báo giờ xe buýt không?\" (người hỏi tự thêm \"ứng dụng báo giờ xe buýt\"); \"Chắc tại anh ngại dậy sớm nên mới thôi đúng không?\".",
};

export const LABEL_DEFINITIONS = LABELS.map((label) => LABEL_DEFINITION[label]).join("\n");

/**
 * How a question is routed to the topics in <chu_de>: one direct topic, only with the words of
 * <cau_hoi_moi> that show it, or none. Shared by Call 1 and the generator's routing check, so a
 * prompt that uses it must also give `DATA_BLOCK_RULE`, the topics in a <chu_de> block as
 * `T<n>: <tag>` lines, the question in a <cau_hoi_moi> block as `index:token` pairs cut by
 * `tokenize` (the tokens `checkAnalysis` checks the span against), and a response schema with
 * the `topic` object of `analysisSchema`.
 */
export const ROUTING_RULES = [
  "topic: câu hỏi mới hỏi vào chủ đề nào trong <chu_de>.",
  "- direct: mã T của MỘT chủ đề mà câu hỏi hỏi đúng vào phần riêng của nó, phân biệt được với các chủ đề gần nó; kèm direct_span là [chỉ số token đầu, chỉ số token cuối] (tính cả hai đầu) của cụm trong <cau_hoi_moi> chỉ ra phần riêng đó. Câu hỏi hợp với hai chủ đề trở lên, hoặc chỉ hỏi chung chung, thì direct là null và direct_span là null.",
  `- broad: mã T của các chủ đề (tối đa ${ROUTE_BROAD_MAX}, không tính chủ đề direct) mà câu hỏi chạm tới nhưng không hỏi đúng vào phần riêng; không có thì mảng rỗng.`,
  'Ví dụ, với các chủ đề T1 "cách đi làm buổi sáng", T2 "giờ giấc đi làm", T3 "chi phí đi lại":',
  '"Sáng anh đi làm bằng gì ạ?" → direct T1, direct_span [2, 5] (cụm "đi làm bằng gì"); broad rỗng.',
  '"Chuyện đi làm của anh thế nào ạ?" → direct null; broad [T1, T2, T3].',
  '"Cuối tuần anh hay làm gì?" → direct null; broad rỗng.',
].join("\n");

/** Call 1 remembers the exchange about to leave the window, while it is still in it. */
export const MEMORY_RULES = [
  "Ghi nhớ (trường memory) lượt trong <luot_can_ghi_nho>; nếu là (không có) thì gist là chuỗi rỗng và claims là mảng rỗng.",
  `- gist: một câu, tối đa 30 từ (${MEMORY_LIMITS.gistChars} ký tự): người hỏi hỏi gì, nhân vật trả lời ý gì; giữ nguyên các cụm đặc biệt nhân vật đã dùng.`,
  `- claims: tối đa ${MEMORY_LIMITS.claimsPerTurn} chi tiết cụ thể nhân vật tự nói về mình ở lượt đó (con số, nơi chốn, người, thói quen, sự việc) mà không có trong <su_that_be_mat>, <dieu_da_mo> hay <dieu_can_tranh>; mỗi chi tiết tối đa ${MEMORY_LIMITS.claimChars} ký tự; không có thì mảng rỗng.`,
].join("\n");

const LABEL_RULES = [
  "Gán nhãn cho câu hỏi mới của người hỏi (trường label), chọn đúng một:",
  LABEL_DEFINITIONS,
  "Bằng chứng bắt buộc đi kèm nhãn:",
  "- Với confirm_grounded hoặc boundary_probe: grounded_turn_id là số lượt của câu nhân vật mà câu hỏi dựa vào (số trong [lượt N] nhân vật, hoặc [lượt N] của một dòng tóm tắt trong <bo_nho>). Không chỉ ra được lượt nào thì dùng nhãn open.",
  "- Với leading: introduced_span là [chỉ số token đầu, chỉ số token cuối] (tính cả hai đầu) của cụm người hỏi tự thêm, theo cách đánh số trong <cau_hoi_moi>. Không chỉ ra được cụm nào thì dùng nhãn open.",
  "- Các trường bằng chứng không dùng tới thì để null.",
  "Loại câu hỏi (trường question_type): open (câu hỏi mở), closed (chỉ trả lời có/không hoặc chọn một), hypothetical_future (hỏi về điều sẽ làm hoặc nếu... thì...), past_specific (hỏi về một lần cụ thể đã xảy ra), other.",
  "hook_id: mã (H...) của câu trong <cau_goi_mo_da_tha> hoặc <cau_goi_mo_duoc_chon> mà câu hỏi mới đang hỏi tiếp; không có thì null.",
  ROUTING_RULES,
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
    MEMORY_RULES,
    LABEL_RULES,
    "Nhân vật được phỏng vấn và những điều nhân vật sẵn sàng kể:",
    renderPersonaFacts(context),
    "Các chủ đề có thể được hỏi tới:",
    dataBlock("chu_de", list(context.topicTags.map((tag) => `${tag.alias}: ${tag.tag}`))),
  ].join("\n\n");

  const turn = [
    renderVerdictMaterial(context),
    `<luot_can_ghi_nho>${context.memoryTurn ?? "(không có)"}</luot_can_ghi_nho>`,
    `Câu hỏi mới của người hỏi (lượt ${context.turnIndex}), mỗi token kèm chỉ số:`,
    dataBlock("cau_hoi_moi", context.question.tokens.map((token, index) => `${index}:${token}`).join(" ")),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(turn)];
}
