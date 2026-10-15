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
