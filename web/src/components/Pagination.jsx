import { Link } from "react-router-dom";

const pageBtn = "flex h-11 min-w-11 items-center justify-center rounded-xl px-3 text-[15px] font-semibold";
const pageIdle = pageBtn + " border border-[#EADBD2] bg-white hover:bg-brand-50 hover:text-brand-700";
const pageOff = pageBtn + " border border-[#F3E8E1] bg-white text-stone-300";

// hrefFor(p) -> đường dẫn của trang p (giữ lại bộ lọc, sắp xếp...)
export default function Pagination({ page, totalPages, hrefFor }) {
  if (!(totalPages > 1)) return null;

  // Dãy số trang rút gọn: 1 … 4 5 [6] 7 8 … 20
  const items = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) items.push(p);
    else if (items[items.length - 1] !== "…") items.push("…");
  }

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang">
      {page > 1 ? (
        <Link to={hrefFor(page - 1)} className={pageIdle} rel="prev" aria-label="Trang trước">‹</Link>
      ) : (
        <span className={pageOff} aria-hidden="true">‹</span>
      )}

      {items.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-stone-400">…</span>
        ) : p === page ? (
          <span key={p} className={`${pageBtn} bg-ink text-white`} aria-current="page">{p}</span>
        ) : (
          <Link key={p} to={hrefFor(p)} className={pageIdle} aria-label={`Trang ${p}`}>{p}</Link>
        ),
      )}

      {page < totalPages ? (
        <Link to={hrefFor(page + 1)} className={pageIdle} rel="next" aria-label="Trang sau">›</Link>
      ) : (
        <span className={pageOff} aria-hidden="true">›</span>
      )}
    </nav>
  );
}
