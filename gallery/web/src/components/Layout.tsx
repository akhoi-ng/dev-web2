import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Aperture, LogIn, LogOut, Settings } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Bỏ qua tới nội dung
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-[color:var(--bg)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color:color-mix(in_srgb,var(--bg)_85%,transparent)]">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Aperture aria-hidden className="size-5 text-accent" />
            Photo Gallery
          </Link>
          <nav aria-label="Chính" className="ml-auto flex items-center gap-1 text-sm">
            <NavLink to="/" end className={({ isActive }) => `btn-ghost ${isActive ? "text-accent" : ""}`}>
              Thư viện
            </NavLink>
            {user ? (
              <>
                <NavLink to="/admin" className={({ isActive }) => `btn-ghost ${isActive ? "text-accent" : ""}`}>
                  <Settings aria-hidden className="size-4" />
                  Quản trị
                </NavLink>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  <LogOut aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                  <span className="sr-only sm:hidden">Đăng xuất</span>
                </button>
              </>
            ) : (
              <NavLink to="/login" className="btn-ghost">
                <LogIn aria-hidden className="size-4" />
                Đăng nhập
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Ảnh được chuẩn hóa hướng, bỏ EXIF/GPS và phân phối dạng WebP 320 · 960 · 1600 px.
      </footer>
    </div>
  );
}
