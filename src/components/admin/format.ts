import type { LlmScope } from "@/db/schema";

/** USD as `pnpm il cost-report` prints it, so the two can be read side by side. */
export const formatUsd = (usd: number) => `${usd.toFixed(4)} USD`;

export const formatShare = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

export const SCOPE_LABEL: Record<LlmScope, string> = {
  session: "Buổi phỏng vấn",
  generation: "Sinh kịch bản",
  eval: "Eval",
  moderation: "Kiểm duyệt",
};

export const SCENARIO_STATUS_LABEL: Record<string, string> = {
  draft: "Bản nháp",
  evaluating: "Đang eval",
  eval_failed: "Eval lỗi",
  ready_for_review: "Chờ duyệt",
  published: "Đã publish",
  unpublished: "Đã gỡ",
  archived: "Lưu trữ",
  taken_down: "Đã gỡ bỏ",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang chạy",
  failed: "Dừng lỗi",
  done: "Xong",
};

export const FLAG_STATUS_LABEL = { open: "Chưa phân xử", dismissed: "Không phải rò rỉ", confirmed: "Rò rỉ" } as const;

/** A moment in UTC+7, the zone the caps and the team use. */
export const formatTime = (date: Date | null) =>
  date === null ? "—" : date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });

/** How long something ran, from its start to its end; "—" while it has not ended. */
export function formatDuration(start: Date, end: Date | null): string {
  if (end === null) return "—";
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  return seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
}

export const SESSION_STATUS_LABEL: Record<string, string> = {
  generating: "Đang tạo kịch bản",
  interviewing: "Đang phỏng vấn",
  revealed: "Đã xem kết quả",
  replaying: "Đang chơi lại",
  done: "Xong",
  failed_eval: "Kịch bản không đạt",
  withdrawn: "Đã dừng",
};

export const ATTEMPT_OUTCOME_LABEL: Record<string, string> = {
  refused: "Từ chối",
  running: "Đang chạy",
  passed: "Qua",
  failed: "Trượt",
  system_error: "Lỗi hệ thống",
};
