import { FOOTER_DATA_NOTE } from "@/strings/product-strings";
import { ShieldIcon } from "./icons";

export function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="container">
        <div className="ftr-note">
          <ShieldIcon size={20} className="c-secondary" />
          <p className="body-sm">
            <strong className="label-md" style={{ color: "var(--on-surface)" }}>
              Dữ liệu của bạn:
            </strong>{" "}
            {FOOTER_DATA_NOTE}
          </p>
        </div>
        <span className="body-sm ftr-copy">© 2026 InterviewLab</span>
      </div>
    </footer>
  );
}
