import { CUSTOM_LABEL } from "@/strings/product-strings";

/**
 * The line above every screen of a custom session (FR-56, NFR-13): the scenario was generated,
 * only lightly checked, and says nothing about real users.
 */
export function CustomStrip() {
  return (
    <p className="custom-strip body-sm" role="note">
      <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>
      <span>
        Nhân vật do AI sinh, mọi chi tiết là hư cấu. <b>{CUSTOM_LABEL.not_insight}.</b>
      </span>
    </p>
  );
}
