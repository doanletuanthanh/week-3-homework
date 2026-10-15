/** One figure of the admin overview, with what it counts. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card adm-tile">
      <span className="eyebrow">{label}</span>
      <span className="adm-tile-value">{value}</span>
      {hint && <span className="body-sm c-outline">{hint}</span>}
    </div>
  );
}
