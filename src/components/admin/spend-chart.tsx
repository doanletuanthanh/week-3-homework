import { LLM_SCOPES } from "@/db/schema";
import type { DayTotals, ScopeToday } from "@/server/admin/overview";
import { SCOPE_LABEL, formatUsd } from "./format";

const BAR = 12;
const GAP = 4;
const HEIGHT = 120;

/**
 * Spend per day, one bar per day stacked by scope, oldest on the left. Plain SVG, hidden from
 * assistive technology: a screen reader reads the same figures from the table that follows it.
 * A pointer gets each bar's day and amount on hover.
 */
export function SpendByDayChart({ days }: { days: DayTotals[] }) {
  const max = Math.max(...days.map((day) => day.usd), 0);
  const width = days.length * (BAR + GAP) - GAP;
  return (
    <figure className="adm-chart">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        {days.map((day, index) => {
          let top = HEIGHT;
          return (
            <g key={day.day}>
              <title>{`${day.day}: ${formatUsd(day.usd)}`}</title>
              {/* A day with no spend still takes its place, as a hairline. */}
              <rect className="adm-bar-empty" x={index * (BAR + GAP)} y={HEIGHT - 1} width={BAR} height={1} />
              {max > 0 &&
                LLM_SCOPES.map((scope) => {
                  const height = (day.byScope[scope] / max) * HEIGHT;
                  if (height <= 0) return null;
                  top -= height;
                  return <rect key={scope} className={`adm-scope-${scope}`} x={index * (BAR + GAP)} y={top} width={BAR} height={height} />;
                })}
            </g>
          );
        })}
      </svg>
      {/* A table cannot be narrower than its content: the hidden box is the div around it. */}
      <div className="vh">
      <table>
        <caption>Chi phí mỗi ngày trong {days.length} ngày gần nhất</caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            {LLM_SCOPES.map((scope) => (
              <th key={scope} scope="col">
                {SCOPE_LABEL[scope]}
              </th>
            ))}
            <th scope="col">Tổng</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.day}</th>
              {LLM_SCOPES.map((scope) => (
                <td key={scope}>{formatUsd(day.byScope[scope])}</td>
              ))}
              <td>{formatUsd(day.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <figcaption className="adm-legend body-sm" aria-hidden="true">
        {LLM_SCOPES.map((scope) => (
          <span key={scope}>
            <i className={`adm-swatch adm-scope-${scope}`} aria-hidden="true" />
            {SCOPE_LABEL[scope]}
          </span>
        ))}
        <span className="c-outline">
          {days[0]?.day} → {days.at(-1)?.day} · cao nhất {formatUsd(max)}
        </span>
      </figcaption>
    </figure>
  );
}

/** Today's spend of each scope against its daily cap; a scope with no cap shows its spend only. */
export function CapMeters({ today }: { today: ScopeToday[] }) {
  return (
    <ul className="adm-meters">
      {today.map(({ scope, usd, capUsd }) => {
        // A cap of 0 with any spend is already over it.
        const share = capUsd === null ? 0 : capUsd > 0 ? Math.min(1, usd / capUsd) : usd > 0 ? 1 : 0;
        return (
          <li key={scope}>
            <div className="adm-meter-head">
              <span>{SCOPE_LABEL[scope]}</span>
              <span className="adm-num">
                {formatUsd(usd)}
                {capUsd !== null && <span className="c-outline"> / {formatUsd(capUsd)}</span>}
              </span>
            </div>
            {capUsd !== null && (
              <div
                className="adm-meter"
                role="meter"
                aria-label={`${SCOPE_LABEL[scope]}: đã dùng so với cap`}
                aria-valuemin={0}
                aria-valuemax={capUsd}
                aria-valuenow={Math.min(usd, capUsd)}
                aria-valuetext={`${formatUsd(usd)} trên cap ${formatUsd(capUsd)}`}
              >
                <div className={`adm-meter-fill adm-scope-${scope}${share >= 0.9 ? " adm-meter-hot" : ""}`} style={{ width: `${share * 100}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
