/** `--primary-container` of `globals.css`, the header tile's colour: `ImageResponse` cannot read CSS variables. */
export const BRAND_TILE = "#0d593f";

/**
 * The InterviewLab glyph. The header draws it in its tile, and the tab and home-screen icons are
 * drawn from it, so the three cannot drift apart. `color` is the text colour around it by default.
 */
export function BrandGlyph({ size, color = "currentColor" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 9.5 12 4l3 5.5z" fill={color} />
      <path d="M2.5 11.5h19" />
      <path d="M5.5 14h13l-3.5 6.5h-6z" />
    </svg>
  );
}
