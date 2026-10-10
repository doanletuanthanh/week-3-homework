import type { AttemptStep, FailureCode, Focus, RoleFilter } from "@/db/schema";
import type { QuotaBlock } from "@/server/custom-quota";

/**
 * Product-level fixed strings. Changing `DATA_NOTICE` requires bumping `DATA_NOTICE_VERSION`:
 * every learner then sees the notice again before any page that needs sign-in or writes data.
 */
export const DATA_NOTICE_VERSION = 1;

/** FR-63 notice, one entry per displayed line, plus the tracing and usage-counter sentences. */
export const DATA_NOTICE = {
  saved:
    "Buổi luyện của bạn (hội thoại, ghi chú, kết quả, chủ đề bạn tự tạo và câu trả lời 'luyện điều gì') được lưu để bạn xem lại.",
  admins:
    "Quản trị viên InterviewLab đọc được các nội dung này để kiểm tra và cải thiện chất lượng; bạn có thể xóa tài khoản và toàn bộ dữ liệu bất cứ lúc nào trong Buổi của tôi.",
  aiProviders:
    "Nội dung được gửi tới nhà cung cấp AI để tạo câu trả lời, chấm và kiểm tra; nhà cung cấp có thể lưu tạm theo chính sách của họ.",
  tracing:
    "Dịch vụ ghi vết LangSmith cũng nhận nội dung hội thoại để chúng tôi tìm và sửa lỗi chất lượng; bản ghi ở đó tự hết hạn theo thời hạn lưu của dịch vụ và không bị xóa khi bạn xóa tài khoản.",
  usage:
    "Chúng tôi ghi lại cách bạn dùng sản phẩm (ví dụ thời gian trả lời, loại thiết bị) để đo chất lượng.",
  usageCounter:
    "Sau khi bạn xóa tài khoản, chúng tôi giữ lại một bộ đếm lượt dùng ẩn danh (không kèm nội dung) để áp dụng giới hạn sử dụng.",
  notSold: "Chúng tôi không công khai hay bán dữ liệu của bạn.",
  noRealPeople: "Đừng nhập tên hay thông tin cá nhân của người thật.",
} as const;

/** Màn 3, shown when the daily cost cap blocks a new session (FR-37). */
export const SESSION_CAP_REACHED = "Hôm nay InterviewLab đã hết chỗ cho buổi luyện mới. Quay lại sau 0 giờ đêm nay.";

/** Màn 3, shown when no version of the persona can be played right now. */
export const PERSONA_BEING_UPDATED = "Nhân vật này đang được cập nhật.";

/** Màn 3, shown to an account that had its session with the persona, was deleted, and signed in again (FR-5). */
export const PLAYED_BEFORE_DELETION = "Bạn đã luyện với nhân vật này trước khi xóa tài khoản. Mỗi nhân vật chỉ có một buổi.";

/** What the learner types to enable "Xóa vĩnh viễn". */
export const DELETE_CONFIRM_WORD = "XÓA";

/** Màn 9, the confirmation of FR-66. `kept` names what deleting the account does not remove. */
export const DELETE_ACCOUNT = {
  title: "Xóa tài khoản và toàn bộ dữ liệu?",
  body: "Mọi buổi, ghi chú, kết quả và chủ đề tự tạo của bạn sẽ bị xóa vĩnh viễn. Không khôi phục được.",
  kept: "Còn lại: một bộ đếm lượt dùng ẩn danh, và bản ghi vết ở LangSmith cho tới khi tự hết hạn.",
} as const;

export const FOOTER_DATA_NOTE =
  "quản trị viên InterviewLab xem được buổi luyện để kiểm tra chất lượng. Bạn xóa được tài khoản và toàn bộ dữ liệu trong Buổi của tôi.";

/**
 * The strings below are templates: `{persona}` is the persona's form of address ("chị Thu"),
 * `{Persona}` the same at the start of a sentence, `{turn}` a turn number and `{turns}` one or more
 * turns written out ("Lượt 2, 9"). `fillTemplate` puts the values in; where a turn is a link, the
 * screen puts the link in its place.
 */

/** FR-48a: the one sentence under a marked stretch of the notes. The end judge's own reason is never shown. */
export const CANVAS_EXPLANATION = {
  told: "{Persona} đã kể điều này ở lượt {turn}.",
  unconfirmed: "Bạn đoán đúng, nhưng {persona} chưa xác nhận — trong buổi thật, bạn sẽ không biết mình đúng.",
  unrevealed: "{Persona} chưa nói gì gợi tới điều này. Đây là phỏng đoán, chưa được xác nhận.",
  never_said: "{Persona} chưa từng nói điều này. Ghi chú này là giả định của bạn, không phải điều bạn nghe được.",
} as const;

/** Màn 6 item 2: the line a replay offer opens with, chosen by `engine/diagnosis.ts`. */
export const DIAGNOSIS = {
  heard_not_followed: "Bạn nghe được, nhưng chưa hỏi tiếp.",
  changed_topic: "Lượt {turn}: {persona} vừa nhắc tới một điều. Bạn đã chuyển chủ đề.",
  try_from_here: "Lượt {turn}: {persona} vừa nhắc tới một điều. Thử hỏi lại từ đây.",
  added_own_idea: "Lượt {turn}: bạn đã thêm ý của mình vào câu hỏi. Thử hỏi lại mà không dẫn dắt.",
  try_differently: "Lượt {turn}: thử hỏi lại câu này theo cách khác.",
} as const;

/** Màn 6 item 4: how a missed item could have been opened. */
export const PATH_LABEL = {
  follow_up: "Hỏi tiếp chi tiết",
  past_story: "Kéo về một lần cụ thể",
  trust: "Tạo tin tưởng",
  surface: "Hỏi thẳng",
} as const;

/** Màn 6 item 4, a missed trust item: code fills the turns from the ledger. */
export const TRUST_MISSED = {
  not_enough: "{Persona} chưa đủ tin để kể.",
  turns: "{turns} làm {persona} dè dặt hơn.",
} as const;

/** FR-19: follows the words the learner added, only when the verifier agreed they were new. */
export const LEADING_NEVER_SAID = "{persona} chưa từng nói điều này.";

/** FR-48a, added under the note about the replay target once the replay opened that item. */
export const CANVAS_REPLAY_OPENED = "Trong buổi chính {persona} chưa xác nhận; ở lần luyện lại bạn đã mở được nó.";

/**
 * Màn 7, and the result card of Màn 6: what a finished replay says. `{item}` is an item's own
 * text, which ends its sentence; `{count}` a number of questions; `{words}` the learner's own words.
 */
export const REPLAY_RESULT = {
  unlocked: "Đã mở khóa: {item}",
  unlocked_note: "Đây chính là điều bạn bỏ lỡ.",
  other_item: "Bạn mở được một điều khác: {item}",
  held_back: "Điều {persona} đã giữ lại",
  opening_question: "Một câu đã mở được nó",
  no_leading: "Ba câu không dẫn dắt, có {count} câu bám vào lời {persona}.",
  still_leading: "Lượt {turn} vẫn thêm ý của bạn: “{words}”.",
  stopped_grounded: "Có {count} câu bám vào lời {persona} trước khi bạn dừng.",
  none_grounded: "Lần này chưa có câu nào bám vào lời {persona}.",
  unchecked: "Chưa kiểm được lượt này.",
} as const;

/** FR-56: the three labels every screen of a custom topic carries. */
export const CUSTOM_LABEL = {
  light_check: "Kiểm tra nhẹ",
  fictional: "chi tiết hư cấu",
  not_insight: "Đây không phải insight thật",
} as const;

/** Màn 10, the information block, word for word from the PRD. The last line is the emphasised one. */
export const CUSTOM_TOPIC_INFO = [
  "AI sẽ sinh một nhân vật hư cấu cho chủ đề này.",
  "Bạn không thấy và không chọn được điều nhân vật giấu.",
  "Kịch bản chỉ qua kiểm tra nhẹ: chưa ai đọc nó, và nó chưa được chạy thử lần nào.",
  "Đây không phải insight về người dùng thật.",
  "Quản trị viên InterviewLab xem được chủ đề và buổi luyện của bạn.",
  "Đừng nhập tên hay thông tin của người thật hay tổ chức thật.",
] as const;

/** Màn 10: why a new custom topic cannot be started, one sentence per reason. */
export const CUSTOM_BLOCK: Record<QuotaBlock, string> = {
  paused: "Tạm dừng tạo chủ đề mới để kiểm tra chất lượng.",
  running: "Bạn đang có một kịch bản đang chuẩn bị",
  free_used: "Bạn đã dùng kịch bản tự tạo miễn phí.",
  failures_exhausted: "Tài khoản này đã dùng hết lần thử tạo chủ đề.",
  budget_exhausted: "Hôm nay đã hết lần tạo kịch bản. Quay lại sau 0 giờ đêm nay.",
  daily_attempts: "Bạn đã dùng 3 lần thử hôm nay. Quay lại sau 0 giờ đêm nay.",
  refusal_locked: "Hôm nay bạn đã gửi quá nhiều chủ đề không tạo được. Quay lại sau 0 giờ đêm nay.",
};

/** Màn 10: the one message for every topic moderation turned down. The reason is never shown. */
export const CUSTOM_REFUSED = "Chủ đề này không tạo được. Thử một chủ đề khác, không nhắc tới người thật hay tổ chức thật.";

export const CUSTOM_TOPIC_LENGTH = "Chủ đề cần từ 10 đến 300 ký tự.";

/** Màn 10: the four quick answers to "Bạn muốn luyện điều gì trong buổi này?". */
export const FOCUS_CHIPS = ["Hỏi tiếp chi tiết vừa nghe", "Kéo về một lần cụ thể", "Người dè dặt", "Tránh câu dẫn dắt"] as const;

/** Màn 3 of a custom topic: what the session concentrates on, in the words of the quick answers. `general` shows no line. */
export function focusLabel(focus: Focus): string | null {
  const position = (["follow_up", "past_story", "trust", "no_leading"] as const).indexOf(focus as Exclude<Focus, "general">);
  return position < 0 ? null : FOCUS_CHIPS[position];
}

/** Màn 11 while the scenario is prepared: one line per step of the attempt. */
export const GENERATING_STEP: Record<AttemptStep, string> = {
  generating: "Đang tạo nhân vật",
  validating: "Kiểm tra nội dung",
};

export const GENERATING = {
  note: "Thường mất khoảng 1 phút. Bạn có thể đóng trang; kịch bản sẽ ở trong Buổi của tôi.",
  ready_title: "✓ Kịch bản sẵn sàng",
} as const;

/** Màn 11 when the scenario did not pass: the fixed sentence of each reason code. */
export const FAILED_EVAL = {
  title: "Kịch bản này chưa qua kiểm tra nên chúng tôi không cho bạn luyện với nó.",
  free_left: "Kịch bản miễn phí của bạn vẫn còn.",
} as const;

export const FAILURE_REASON: Record<FailureCode, string> = {
  invalid: "Nhân vật chưa đủ chặt chẽ",
  unsafe_output: "Nội dung sinh ra không qua kiểm tra an toàn",
  system_error: "Lỗi hệ thống (lần thử này không bị tính)",
};

/** Màn 6 of a custom topic: the report button and what it says once pressed. */
export const CUSTOM_REPORT = { button: "Kịch bản này có vấn đề", done: "Đã ghi nhận báo cáo của bạn." } as const;

/** Màn 2: the chips of the role filter. A role's colour never stands without its label. */
export const ROLE_LABEL: Record<RoleFilter, string> = { ux: "UX", ba: "BA", pm: "PM", other: "Khác" };

/** Màn 2 · Thư viện: its heading, the lines of the filter, the card that leads to Màn 10, and the learner's own topics. */
export const LIBRARY = {
  title: "Chọn một chủ đề để luyện",
  other_note: "Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề.",
  empty: "Chưa có chủ đề cho vai trò này.",
  show_all: "Xem mọi chủ đề",
  create_title: "Không thấy chủ đề bạn cần?",
  create_body: "Gõ một chủ đề, InterviewLab tạo một nhân vật hư cấu để bạn luyện.",
  create_action: "Tạo chủ đề của bạn",
  own_title: "Chủ đề bạn tự tạo",
  practised: "Đã luyện",
  enter: "Vào thư viện",
  name: "Thư viện",
} as const;

/** Màn 1 · Trang chủ: the library section and the band that closes the page. */
export const HOME = {
  library_title: "Chọn một chủ đề, rồi chọn một persona",
  library_all: "Xem cả thư viện",
  create_body: "Gõ một chủ đề. InterviewLab tạo một nhân vật hư cấu để bạn luyện. Kịch bản tự tạo chỉ qua kiểm tra nhẹ.",
} as const;

/**
 * Màn 6 item 7: what to practise next (FR-31). `{persona}` is the form of address of the persona
 * offered. `all_practised` is said only when the learner's role has personas and each was practised.
 */
export const NEXT_STEP = {
  same_topic: "Cùng chủ đề",
  other_topic: "Một chủ đề khác",
  continue_with: "Luyện tiếp với {persona}",
  all_practised: "Bạn đã luyện mọi persona của vai trò này.",
} as const;

/**
 * Màn 2b · Chủ đề. `warning` is the overlap warning of FR-51, word for word from the PRD;
 * `generated` is the line a topic the learner made carries.
 */
export const TOPIC = {
  warning:
    "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn.",
  generated: "Kịch bản do AI sinh, chỉ qua kiểm tra nhẹ. Mọi chi tiết là hư cấu.",
  practised: "Bạn đã luyện",
  empty: "Chủ đề này đang được cập nhật.",
  not_found: "Không tìm thấy chủ đề này.",
  to_library: "Về thư viện",
  to_topic: "Về chủ đề",
} as const;

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/**
 * Every product-level fixed string by key, for the fixed-string check and its approval
 * (`il check-strings product`, `il approve-strings product`). A string added above must be added
 * here, or it ships unchecked.
 */
export function productStrings(): { key: string; text: string }[] {
  return [
    ...Object.entries(DATA_NOTICE).map(([name, text]) => ({ key: `data_notice.${name}`, text })),
    { key: "session_cap_reached", text: SESSION_CAP_REACHED },
    { key: "persona_being_updated", text: PERSONA_BEING_UPDATED },
    { key: "played_before_deletion", text: PLAYED_BEFORE_DELETION },
    ...Object.entries(DELETE_ACCOUNT).map(([name, text]) => ({ key: `delete_account.${name}`, text })),
    { key: "delete_confirm_word", text: DELETE_CONFIRM_WORD },
    { key: "footer_data_note", text: FOOTER_DATA_NOTE },
    ...Object.entries(CANVAS_EXPLANATION).map(([name, text]) => ({ key: `canvas_explanation.${name}`, text })),
    ...Object.entries(DIAGNOSIS).map(([name, text]) => ({ key: `diagnosis.${name}`, text })),
    ...Object.entries(PATH_LABEL).map(([name, text]) => ({ key: `path_label.${name}`, text })),
    ...Object.entries(TRUST_MISSED).map(([name, text]) => ({ key: `trust_missed.${name}`, text })),
    { key: "leading_never_said", text: LEADING_NEVER_SAID },
    { key: "canvas_replay_opened", text: CANVAS_REPLAY_OPENED },
    ...Object.entries(REPLAY_RESULT).map(([name, text]) => ({ key: `replay_result.${name}`, text })),
    ...Object.entries(CUSTOM_LABEL).map(([name, text]) => ({ key: `custom_label.${name}`, text })),
    ...CUSTOM_TOPIC_INFO.map((text, index) => ({ key: `custom_topic_info.${index + 1}`, text })),
    ...Object.entries(CUSTOM_BLOCK).map(([name, text]) => ({ key: `custom_block.${name}`, text })),
    { key: "custom_refused", text: CUSTOM_REFUSED },
    { key: "custom_topic_length", text: CUSTOM_TOPIC_LENGTH },
    ...FOCUS_CHIPS.map((text, index) => ({ key: `focus_chip.${index + 1}`, text })),
    ...Object.entries(GENERATING_STEP).map(([name, text]) => ({ key: `generating_step.${name}`, text })),
    ...Object.entries(GENERATING).map(([name, text]) => ({ key: `generating.${name}`, text })),
    ...Object.entries(FAILED_EVAL).map(([name, text]) => ({ key: `failed_eval.${name}`, text })),
    ...Object.entries(FAILURE_REASON).map(([name, text]) => ({ key: `failure_reason.${name}`, text })),
    ...Object.entries(CUSTOM_REPORT).map(([name, text]) => ({ key: `custom_report.${name}`, text })),
    ...Object.entries(ROLE_LABEL).map(([name, text]) => ({ key: `role_label.${name}`, text })),
    ...Object.entries(LIBRARY).map(([name, text]) => ({ key: `library.${name}`, text })),
    ...Object.entries(TOPIC).map(([name, text]) => ({ key: `topic.${name}`, text })),
    ...Object.entries(HOME).map(([name, text]) => ({ key: `home.${name}`, text })),
    ...Object.entries(NEXT_STEP).map(([name, text]) => ({ key: `next_step.${name}`, text })),
  ];
}
