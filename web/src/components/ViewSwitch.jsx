import { Link } from "react-router-dom";

export const MENU_VIEWS = [
  { key: "pages", label: "Số trang" },
  { key: "more", label: "Tải thêm" },
  { key: "scroll", label: "Cuộn vô hạn" },
];

export function parseView(raw) {
  return MENU_VIEWS.some((v) => v.key === raw) ? raw : "pages";
}

// Nút chuyển kiểu phân trang của thực đơn; hrefFor(view) giữ nguyên tìm kiếm, bắt đầu từ đầu
export default function ViewSwitch({ view, hrefFor }) {
  return (
    <nav className="inline-flex rounded-xl border border-[#EADBD2] bg-white p-1" aria-label="Kiểu phân trang">
      {MENU_VIEWS.map((v) => {
        const active = v.key === view;
        return (
          <Link
            key={v.key}
            to={hrefFor(v.key)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
              active ? "bg-ink text-white" : "text-stone-600 hover:bg-brand-50 hover:text-brand-700"
            }`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
