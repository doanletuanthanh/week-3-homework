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
    { key: "footer_data_note", text: FOOTER_DATA_NOTE },
    ...Object.entries(CANVAS_EXPLANATION).map(([name, text]) => ({ key: `canvas_explanation.${name}`, text })),
    ...Object.entries(DIAGNOSIS).map(([name, text]) => ({ key: `diagnosis.${name}`, text })),
    ...Object.entries(PATH_LABEL).map(([name, text]) => ({ key: `path_label.${name}`, text })),
    ...Object.entries(TRUST_MISSED).map(([name, text]) => ({ key: `trust_missed.${name}`, text })),
    { key: "leading_never_said", text: LEADING_NEVER_SAID },
    { key: "canvas_replay_opened", text: CANVAS_REPLAY_OPENED },
    ...Object.entries(REPLAY_RESULT).map(([name, text]) => ({ key: `replay_result.${name}`, text })),
  ];
}
