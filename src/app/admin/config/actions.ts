"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/admin/action-form";
import { getDb } from "@/db/client";
import { updateConfigFor } from "@/server/admin/config";
import { requireAdmin } from "@/server/auth";

/** Changes one setting. A POST endpoint anyone can reach, so it checks the admin itself; the service checks again. */
export async function updateConfigAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const result = await updateConfigFor(getDb(), user, { key: String(form.get("key") ?? ""), value: String(form.get("value") ?? "") });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin/config");
  return { ok: true, message: `${result.key}: ${JSON.stringify(result.from)} → ${JSON.stringify(result.to)}` };
}
