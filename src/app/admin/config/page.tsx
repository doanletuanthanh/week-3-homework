import { ActionForm } from "@/components/admin/action-form";
import { formatTime } from "@/components/admin/format";
import { getDb } from "@/db/client";
import { listConfigFor } from "@/server/admin/config";
import { requireAdmin } from "@/server/auth";
import { updateConfigAction } from "./actions";

/**
 * Every operator setting with its value, default and meaning, editable in place. A value is
 * checked as `il config set` checks it, applies from the next request, and is logged with what it replaced.
 */
export default async function AdminConfigPage() {
  const user = await requireAdmin();
  const entries = await listConfigFor(getDb(), user);

  return (
    <>
      <h1 className="headline-lg">Cấu hình</h1>
      {entries.map((entry) => (
        <section key={entry.key} className="card adm-panel" aria-label={entry.key}>
          <div className="adm-stack">
            <h2 className="adm-h3 adm-mono">{entry.key}</h2>
            <p className="body-sm c-variant">{entry.summary}</p>
            <p className="body-sm c-outline">
              Mặc định {JSON.stringify(entry.defaultValue)} ·{" "}
              {entry.isDefault ? "đang dùng mặc định" : `đặt bởi ${entry.updatedBy}, ${formatTime(entry.updatedAt)}`}
            </p>
          </div>
          <ActionForm action={updateConfigAction}>
            <input type="hidden" name="key" value={entry.key} />
            <div className="field">
              <label htmlFor={`config-${entry.key}`}>Giá trị</label>
              {entry.kind === "boolean" ? (
                <select id={`config-${entry.key}`} name="value" className="select" defaultValue={JSON.stringify(entry.value)}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input id={`config-${entry.key}`} name="value" className="input" type="number" step="any" required defaultValue={String(entry.value)} />
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-md">
              Lưu
            </button>
          </ActionForm>
        </section>
      ))}
    </>
  );
}
