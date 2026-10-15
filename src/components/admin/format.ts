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
