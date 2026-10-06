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
