import type { FieldChange } from "@/scenario/diff";

/** What changed since the previous version, one row per field; a missing side reads "(không có)". */
export function VersionDiff({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) return <p className="body-sm c-outline">Không khác phiên bản trước.</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">Trường</th>
            <th scope="col">Trước</th>
            <th scope="col">Sau</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.path}>
              <td className="adm-mono">{change.path}</td>
              <td>{change.before ?? <span className="c-outline">(không có)</span>}</td>
              <td>{change.after ?? <span className="c-outline">(không có)</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
