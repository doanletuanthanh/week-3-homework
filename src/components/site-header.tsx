import Link from "next/link";
import { signOut } from "@/server/actions";
import { getUser } from "@/server/auth";
import { UserIcon } from "./icons";

function Logo() {
  return (
    <>
      <span className="logo-mark">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 9.5 12 4l3 5.5z" fill="currentColor" />
          <path d="M2.5 11.5h19" />
          <path d="M5.5 14h13l-3.5 6.5h-6z" />
        </svg>
      </span>
      <span className="logo-word">InterviewLab</span>
    </>
  );
}

/** Site header. Signed out: "Đăng nhập". Signed in: account menu with "Đăng xuất". */
export async function SiteHeader() {
  const user = await getUser();
  return (
    <header className="hdr">
      <div className="container">
        <div className="hdr-l">
          <Link className="logo" href="/" aria-label="InterviewLab, về trang chủ">
            <Logo />
          </Link>
          <span className="vsep hdr-wide" />
          <span className="hdr-badge hdr-wide">UX · BA · PM</span>
        </div>
        <div className="hdr-r">
          {user ? (
            <details className="user-menu">
              <summary className="user" aria-label="Tài khoản: mở menu">
                <span className="user-meta hdr-wide">
                  <span>{user.email}</span>
                </span>
                <span className="user-av">
                  <UserIcon />
                </span>
              </summary>
              <div className="menu">
                <form action={signOut}>
                  <button type="submit">Đăng xuất</button>
                </form>
              </div>
            </details>
          ) : (
            <Link className="btn btn-surface btn-md" href="/sign-in">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
