type Props = {
  /** Shares from 0 to 1, oldest first; null where a session gives nothing to measure. */
  values: (number | null)[];
  label: string;
};

const WIDTH = 120;
const HEIGHT = 32;

/** A small trend line on a fixed 0–100% scale. A gap in the line is a session with nothing to measure. */
export function Sparkline({ values, label }: Props) {
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;
  const point = (value: number, index: number) => `${(index * step).toFixed(1)},${(HEIGHT - value * HEIGHT).toFixed(1)}`;
  // Each run of measured sessions is its own line.
  const runs: string[][] = [];
  values.forEach((value, index) => {
    if (value === null) return runs.push([]);
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1].push(point(value, index));
  });
  const last = values.at(-1);
  return (
    <svg className="prog-spark" viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 4}`} role="img" aria-label={label}>
      {runs
        .filter((run) => run.length > 0)
        .map((run, index) =>
          run.length === 1 ? (
            <circle key={index} cx={run[0].split(",")[0]} cy={run[0].split(",")[1]} r="2" />
          ) : (
            <polyline key={index} points={run.join(" ")} />
          ),
        )}
      {last !== null && last !== undefined && <circle className="prog-spark-last" cx={(values.length - 1) * step} cy={HEIGHT - last * HEIGHT} r="3" />}
    </svg>
  );
}
