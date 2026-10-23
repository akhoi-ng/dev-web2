import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";
import { RESTAURANT } from "../lib/restaurant.js";
import { formatPhone } from "../lib/format.js";

const ADMIN_LINKS = [
  { href: "/admin/dishes", label: "Món ăn" },
  { href: "/admin/chefs", label: "Đầu bếp" },
  { href: "/admin/ingredients", label: "Nguyên liệu" },
  { href: "/admin/bookings", label: "Đặt bàn" },
];

const FOOTER_CATEGORIES = ["Khai vị", "Món chính", "Món phụ", "Tráng miệng", "Đồ uống"];

const mobileLink = "flex min-h-11 items-center rounded-xl px-3 hover:bg-brand-50 hover:text-brand-700";
const footLink = "flex min-h-10 items-center hover:text-white";
const footHeading = "mb-2 text-sm font-bold uppercase tracking-wider text-white";

function Header({ isAdmin }) {
  const menuRef = useRef(null);
  const { pathname } = useLocation();

  // Menu thả xuống trên điện thoại tự đóng sau khi chuyển trang
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-[#EADBD2] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/dishes" className="flex items-center gap-3" aria-label={`${RESTAURANT.name} – về thực đơn`}>
          <Logo size={42} />
          <span className="flex flex-col leading-tight">
            <span className="text-xl font-extrabold tracking-tight">{RESTAURANT.name}</span>
            <span className="text-xs font-medium text-stone-500">{RESTAURANT.tagline}</span>
          </span>
        </Link>

        {/* Điện thoại: nút Đặt bàn + menu thả xuống (details/summary) */}
        <div className="flex items-center gap-2 md:hidden">
          {!isAdmin && (
            <Link to="/bookings/new" className="flex min-h-11 items-center rounded-full bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700">Đặt bàn</Link>
          )}
          <details className="relative" ref={menuRef}>
            <summary className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#EADBD2] bg-white" aria-label="Mở menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
            </summary>
            <nav aria-label="Menu" className="absolute right-0 top-full z-30 mt-2 flex w-64 flex-col rounded-2xl border border-[#EADBD2] bg-white p-2 text-[15px] font-semibold shadow-lg">
              <Link to="/dishes#thuc-don" className={mobileLink}>Thực đơn</Link>
              <Link to="/about" className={mobileLink}>Về chúng tôi</Link>
              <Link to="/bookings/new" className={mobileLink}>Đặt bàn</Link>
              <div className="my-2 border-t border-stone-100"></div>
              <Link to="/dishes" className={`flex min-h-11 items-center rounded-xl px-3 ${isAdmin ? "text-stone-500 hover:bg-stone-50" : "bg-stone-100"}`}>Trang khách hàng</Link>
              <Link to="/admin/dishes" className={`flex min-h-11 items-center rounded-xl px-3 ${isAdmin ? "bg-stone-100" : "text-stone-500 hover:bg-stone-50"}`}>Trang quản trị</Link>
            </nav>
          </details>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {!isAdmin && (
            <>
              <nav aria-label="Điều hướng chính" className="flex items-center gap-1 text-[15px] font-semibold">
                <Link to="/dishes#thuc-don" className="rounded-lg px-3 py-2.5 hover:text-brand-700">Thực đơn</Link>
                <NavLink
                  to="/about"
                  className={({ isActive }) => `rounded-lg px-3 py-2.5 hover:text-brand-700 ${isActive ? "text-brand-700" : ""}`}
                >
                  Về chúng tôi
                </NavLink>
              </nav>
              <Link to="/bookings/new" className="rounded-full bg-brand-600 px-5 py-2.5 text-[15px] font-bold text-white hover:bg-brand-700">Đặt bàn</Link>
            </>
          )}

          {/* Chuyển nhanh giữa trang khách và trang quản trị */}
          <div className="flex rounded-full bg-stone-100 p-1 text-sm font-medium">
            <Link
              to="/dishes"
              className={`rounded-full px-4 py-1.5 ${isAdmin ? "text-stone-500 hover:text-ink" : "bg-white text-ink shadow"}`}
            >
              Khách hàng
            </Link>
            <Link
              to="/admin/dishes"
              className={`rounded-full px-4 py-1.5 ${isAdmin ? "bg-ink text-white shadow" : "text-stone-500 hover:text-ink"}`}
            >
              Quản trị
            </Link>
          </div>
        </div>
      </div>

      {isAdmin && (
        <nav className="border-t border-stone-100 bg-ink" aria-label="Quản trị">
          {/* Điện thoại: 4 tab chia đều chiều ngang; màn hình rộng: xếp liền nhau */}
          <div className="mx-auto grid max-w-6xl grid-cols-4 px-2 sm:flex sm:gap-1 sm:px-4">
            {ADMIN_LINKS.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                className={({ isActive }) =>
                  `flex min-h-11 items-center justify-center border-b-2 px-1 text-center text-[13px] font-medium leading-tight sm:px-4 sm:text-sm ${
                    isActive ? "border-saffron text-white" : "border-transparent text-stone-400 hover:text-white"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4B13E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4B13E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path></svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4B13E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
  );
}

// Footer: điện thoại 2 cột (logo và Liên hệ chiếm cả hàng), desktop 4 cột với cột logo rộng hơn
function Footer() {
  return (
    <footer className="bg-ink text-[#E9DCD5]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 lg:grid-cols-[1.5fr_1fr_1fr_1.4fr] lg:gap-x-10">
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <Link to="/dishes" className="flex items-center gap-2.5 self-start" aria-label={`${RESTAURANT.name} – về thực đơn`}>
            <Logo size={40} />
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-extrabold text-white">{RESTAURANT.name}</span>
              <span className="text-xs">{RESTAURANT.tagline}</span>
            </span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed">Bếp Việt &amp; Âu cho bữa ăn gia đình và bạn bè.</p>
          <Link to="/bookings/new" className="flex min-h-11 items-center self-start rounded-full bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700">Đặt bàn</Link>
        </div>

        <nav aria-labelledby="footer-menu" className="flex flex-col text-sm">
          <h2 id="footer-menu" className={footHeading}>Thực đơn</h2>
          {FOOTER_CATEGORIES.map((c) => (
            <Link key={c} to={`/dishes?category=${encodeURIComponent(c)}#thuc-don`} className={footLink}>{c}</Link>
          ))}
        </nav>

        <nav aria-labelledby="footer-help" className="flex flex-col text-sm">
          <h2 id="footer-help" className={footHeading}>Hỗ trợ</h2>
          <Link to="/bookings/new" className={footLink}>Đặt bàn</Link>
          <Link to="/about" className={footLink}>Về chúng tôi</Link>
          <Link to="/admin/dishes" className={footLink}>Trang quản trị</Link>
        </nav>

        <div className="col-span-2 flex flex-col gap-3 text-sm lg:col-span-1">
          <h2 className={footHeading}>Liên hệ</h2>
          <span className="flex items-start gap-3">
            <PinIcon />
            <span>{RESTAURANT.address}</span>
          </span>
          <a href={`tel:${RESTAURANT.phone}`} className="flex items-center gap-3 self-start hover:text-white">
            <PhoneIcon />
            <span className="text-base font-bold text-white">{formatPhone(RESTAURANT.phone)}</span>
          </a>
          <span className="flex items-center gap-3">
            <ClockIcon />
            <span>Mở cửa {RESTAURANT.hours} mỗi ngày</span>
          </span>
        </div>
      </div>

      <div className="border-t border-[#4A3631]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {RESTAURANT.name}. Bảo lưu mọi quyền.</span>
          <span className="text-[#B8A69E]">React · Express · Prisma · PostgreSQL</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname, hash } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  // SPA không tự cuộn: về đầu trang khi đổi trang, tới #mục nếu đã có trên trang
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <>
      <Header isAdmin={isAdmin} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
