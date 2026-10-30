import { ImageResponse } from "next/og";
import { BRAND_TILE, BrandGlyph } from "@/components/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: the header's mark on a square tile, which iOS rounds itself. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: BRAND_TILE,
      }}
    >
      <BrandGlyph size={112} color="#fff" />
    </div>,
    size,
  );
}
