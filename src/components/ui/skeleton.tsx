import type { CSSProperties } from "react";

type Props = { width: number | string; height: number | string; radius?: number | string; className?: string };

/**
 * One grey block of the standard loading state (PRD §6.0): a page that is loading shows blocks in
 * the shape of what is about to appear, never a full-page spinner. Start a group of them with
 * a `SkeletonStatus`, so the wait is announced once.
 */
export function Skeleton({ width, height, radius, className }: Props) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={className ? `skel ${className}` : "skel"} style={style} aria-hidden="true" />;
}

/**
 * What is loading, in words, for a screen reader: the blocks themselves say nothing. Its parent
 * carries no `aria-busy`, which would tell a screen reader to hold the line back.
 */
export function SkeletonStatus({ label }: { label: string }) {
  return (
    <p className="sr" role="status">
      {label}
    </p>
  );
}
