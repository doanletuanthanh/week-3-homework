import { ImageResponse } from "next/og";
import { BRAND_TILE, BrandGlyph } from "@/components/brand-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The browser-tab icon: the header's mark in its rounded tile, drawn once at build time. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: BRAND_TILE,
        borderRadius: 7,
      }}
    >
      <BrandGlyph size={20} color="#fff" />
    </div>,
    size,
  );
}
