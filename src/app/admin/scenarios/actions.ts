"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ActionState } from "@/components/admin/action-form";
import { getDb } from "@/db/client";
import {
  approveStringsFor,
  approveVersionFor,
  checkStringsFor,
  publishFor,
  requestLeanEval,
  ruleOnFlag,
  startAdminDraft,
  unpublishFor,
} from "@/server/admin/scenarios";
import { requireAdmin } from "@/server/auth";
import { runEvalJob } from "@/server/eval-job";
import { runGeneration } from "@/server/generation";

/**
 * The admin's scenario review actions. Each is a POST endpoint anyone can reach, so each checks
 * the admin itself; the service it calls checks again and writes the access log.
 */

const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const pathOf = (personaId: string) => `/admin/scenarios/${encodeURIComponent(personaId)}`;

function done(personaId: string, message: string): ActionState {
  revalidatePath(pathOf(personaId));
  return { ok: true, message };
}
const refused = (message: string): ActionState => ({ ok: false, message });

const LEAN_REFUSAL = {
  not_found: "Không tìm thấy persona.",
  running: "Persona đang có một lần eval lean chạy: chờ nó xong.",
  over_budget: "Ngân sách eval hôm nay không đủ cho thêm một lần eval lean (eval_daily_budget_usd).",
} as const;

export async function runLeanEvalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await requestLeanEval(getDb(), user, personaId);
  if (!result.ok) return refused(LEAN_REFUSAL[result.reason]);
  after(() => runEvalJob(getDb(), result.runId).catch((error: unknown) => console.error(error)));
  return done(personaId, result.resumed ? "Đang chạy tiếp lần eval bị dừng giữa chừng." : "Đã bắt đầu eval lean.");
}

const RULING_REFUSAL = {
  invalid_input: "Cần chọn phán quyết và ghi lý do.",
  not_found: "Không tìm thấy cờ này.",
  stale: "Cờ này thuộc một lần eval cũ: tải lại trang.",
} as const;

export async function ruleFlagAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await ruleOnFlag(getDb(), user, { personaId, flagId: field(form, "flagId"), verdict: field(form, "verdict"), reason: field(form, "reason") });
  return result.ok ? done(personaId, "Đã ghi phán quyết.") : refused(RULING_REFUSAL[result.error]);
}

export async function checkStringsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await checkStringsFor(getDb(), user, field(form, "target"));
  if (!result.ok) return refused("Không tìm thấy persona.");
  return done(personaId, `Vừa kiểm ${result.checked} chuỗi; ${result.failing} chuỗi không qua.`);
}

export async function approveStringsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await approveStringsFor(getDb(), user, field(form, "target"));
  if (!result.ok) return refused("unchecked" in result ? `Chưa qua kiểm FR-36: ${result.unchecked.join(", ")}.` : "Không tìm thấy persona.");
  return done(personaId, `Đã duyệt ${result.approved} chuỗi.${result.waiting > 0 ? ` Còn ${result.waiting} chuỗi chưa qua kiểm nên chưa duyệt được.` : ""}`);
}

export async function approveVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await approveVersionFor(getDb(), user, personaId, field(form, "note"));
  if (result.outcome === "invalid_input") return refused("Cần ghi chú khi duyệt.");
  if (result.outcome === "not_found") return refused("Không tìm thấy persona.");
  if (result.outcome === "no_run") return refused(`Phiên bản ${result.version} chưa có lần eval lean nào hoàn tất.`);
  return done(personaId, `Đã duyệt phiên bản ${result.version} trên lần eval này.`);
}

export async function publishAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const result = await publishFor(getDb(), user, personaId);
  if (result.outcome === "not_found") return refused("Không tìm thấy persona.");
  if (result.outcome === "refused") return refused(`Không publish ${result.name}: ${result.reasons.length} lý do (xem cổng publish).`);
  return done(personaId, result.outcome === "published" ? `Đã publish ${result.name}.` : `${result.name} đã được publish.`);
}

export async function unpublishAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const personaId = field(form, "personaId");
  const stopSessions = form.get("stopSessions") === "on";
  const result = await unpublishFor(getDb(), user, personaId, stopSessions);
  if (!result.ok) return refused(result.error === "not_found" ? "Không tìm thấy persona." : "Persona không còn phiên bản nào chơi được để gỡ.");
  return done(
    personaId,
    `Đã gỡ ${result.versions} phiên bản. ${stopSessions ? `Đã rút ${result.sessions} buổi chưa xong.` : "Các buổi đang diễn ra tiếp tục trên phiên bản cũ."}`,
  );
}

const DRAFT_REFUSAL = {
  invalid_input: "Kiểm lại: mã persona chỉ gồm chữ thường, số và dấu gạch; mô tả chủ đề dài 10–300 ký tự.",
  topic_not_found: "Không tìm thấy chủ đề.",
  persona_exists: "Mã persona này đã có: chọn mã khác.",
  running: "Bạn đang có một bản nháp (hoặc chủ đề tự tạo) đang soạn: chờ nó xong.",
  over_budget: "Ngân sách sinh kịch bản hôm nay không đủ (generation_daily_budget_usd).",
} as const;

export async function startDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const result = await startAdminDraft(getDb(), user, {
    topicId: field(form, "topicId"),
    personaId: field(form, "personaId"),
    topicText: field(form, "topicText"),
    focus: field(form, "focus"),
  });
  if (!result.ok) return refused(DRAFT_REFUSAL[result.error]);
  after(() => runGeneration(getDb(), result.attemptId).catch((error: unknown) => console.error(error)));
  redirect(`/admin/scenarios/new?attempt=${result.attemptId}`);
}
