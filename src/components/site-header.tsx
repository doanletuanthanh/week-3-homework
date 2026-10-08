import Link from "next/link";
import { signOut } from "@/server/actions";
import { getUser } from "@/server/auth";
import { failIfAsked } from "@/server/test-faults";
import { HeaderMenu, MySessionsLink } from "./header-menu";
import { HistoryIcon, MenuIcon, SignOutIcon, UserIcon } from "./icons";

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

/**
 * Site header (PRD §6.0). Signed out: "Đăng nhập". Signed in: "Buổi của tôi" and the account menu
 * with "Đăng xuất"; below 768px the two fold into one menu behind a button. This slice has no
 * library, so there is no "Thư viện" link.
 */
export async function SiteHeader() {
  await failIfAsked("layout");
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
        {user && (
          <nav className="nav hdr-wide" aria-label="Chính">
            <MySessionsLink />
          </nav>
        )}
        <div className="hdr-r">
          {user ? (
            <>
              <HeaderMenu
                className="user-menu hdr-wide"
                summaryClassName="user"
                summaryLabel="Tài khoản: mở menu"
                summary={
                  <>
                    <span className="user-meta">
                      <span>{user.email}</span>
                    </span>
                    <span className="user-av">
                      <UserIcon />
                    </span>
                  </>
                }
              >
                <div className="menu">
                  <form action={signOut}>
                    <button type="submit">
                      <SignOutIcon size={16} />
                      Đăng xuất
                    </button>
                  </form>
                </div>
              </HeaderMenu>
              <HeaderMenu className="user-menu hdr-narrow" summaryClassName="hdr-menu" summaryLabel="Menu" summary={<MenuIcon size={22} />}>
                <nav className="menu" aria-label="Chính">
                  <MySessionsLink>
                    <HistoryIcon size={16} />
                  </MySessionsLink>
                  <div className="hr" />
                  <form action={signOut}>
                    <button type="submit" className="menu-out">
                      <SignOutIcon size={16} />
                      <span>Đăng xuất · {user.email}</span>
                    </button>
                  </form>
                </nav>
              </HeaderMenu>
            </>
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
