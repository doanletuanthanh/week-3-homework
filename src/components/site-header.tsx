import Link from "next/link";
import { signOut } from "@/server/actions";
import { getUser } from "@/server/auth";
import { failIfAsked } from "@/server/test-faults";
import { BrandGlyph } from "./brand-mark";
import { HeaderLink, HeaderMenu } from "./header-menu";
import { GridIcon, HistoryIcon, MenuIcon, NoteIcon, PulseIcon, ShieldIcon, SignOutIcon, UserIcon } from "./icons";

function Logo() {
  return (
    <>
      <span className="logo-mark">
        <BrandGlyph size={17} />
      </span>
      <span className="logo-word">InterviewLab</span>
    </>
  );
}

/**
 * Site header (PRD §6.0). Everyone: "Thư viện". Signed out: "Đăng nhập". Signed in: "Buổi của tôi"
 * and the account menu with "Đăng xuất"; an admin also gets "Quản trị"; below 768px a learner's links fold into one menu behind
 * a button, and a visitor's one link stays beside "Đăng nhập".
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
        <nav className="nav hdr-wide" aria-label="Chính">
          <HeaderLink to="library" />
          {user && <HeaderLink to="mySessions" />}
          {user && <HeaderLink to="progress" />}
          {user?.isAdmin && <HeaderLink to="admin" />}
        </nav>
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
                  <HeaderLink to="guideCheck">
                    <NoteIcon size={16} />
                  </HeaderLink>
                  <div className="hr" />
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
                  <HeaderLink to="library">
                    <GridIcon size={16} />
                  </HeaderLink>
                  <HeaderLink to="mySessions">
                    <HistoryIcon size={16} />
                  </HeaderLink>
                  <HeaderLink to="progress">
                    <PulseIcon size={16} />
                  </HeaderLink>
                  <HeaderLink to="guideCheck">
                    <NoteIcon size={16} />
                  </HeaderLink>
                  {user.isAdmin && (
                    <HeaderLink to="admin">
                      <ShieldIcon size={16} />
                    </HeaderLink>
                  )}
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
            <>
              {/* A visitor has one destination: it needs no menu on a narrow screen. */}
              <nav className="nav hdr-narrow" aria-label="Chính">
                <HeaderLink to="library" />
              </nav>
              <Link className="btn btn-surface btn-md" href="/sign-in">
                Đăng nhập
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
