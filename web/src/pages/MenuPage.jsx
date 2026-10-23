import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { dishesApi, getOptions, getStats } from "../api/index.js";
import DataStatus from "../components/DataStatus.jsx";
import Pagination from "../components/Pagination.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import BookingCta from "./menu/BookingCta.jsx";
import CategoryTiles from "./menu/CategoryTiles.jsx";
import DishCard from "./menu/DishCard.jsx";
import InlineError from "./menu/InlineError.jsx";
import MenuHero from "./menu/MenuHero.jsx";

const PAGE_SIZE = 9;

// Đường dẫn thực đơn từ bộ lọc; chỉ ghi tham số khác mặc định. #thuc-don để cuộn tới danh sách.
function menuHref({ q, category, sort, page }) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  if (sort && sort !== "default") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/dishes" + (qs ? "?" + qs : "") + "#thuc-don";
}

function parsePage(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export default function MenuPage() {
  useDocumentTitle("Thực đơn");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Trạng thái bộ lọc nằm hoàn toàn trên URL
  const q = (searchParams.get("q") || "").trim();
  const rawCategory = searchParams.get("category") || "";
  const rawSort = searchParams.get("sort") || "default";
  const pageParam = parsePage(searchParams.get("page"));

  const stats = useApiData((signal) => getStats(signal), []);
  const options = useApiData((signal) => getOptions(signal), []);
  const opts = options.status === "ok" ? options.data : null;

  // Giá trị lạ trên URL được xem như mặc định (API cũng làm vậy); chưa có options thì giữ nguyên
  const category = opts ? (opts.categories.includes(rawCategory) ? rawCategory : "") : rawCategory;
  const sort = opts ? (opts.sorts.some((s) => s.key === rawSort) ? rawSort : "default") : rawSort;

  const list = useApiData(
    (signal) => dishesApi.list({ q, category, sort, page: pageParam, pageSize: PAGE_SIZE }, signal),
    [q, category, sort, pageParam],
  );

  const filters = { q, category, sort };
  const go = (next) => navigate(menuHref({ ...filters, ...next }));
  const categoryHref = (c) => menuHref({ q, sort, category: c });

  const meta = list.status === "ok" ? list.meta : null;
  const total = meta ? meta.total : null;
  const page = meta ? meta.page : pageParam;
  const totalPages = meta ? meta.totalPages : 1;

  return (
    <>
      <MenuHero q={q} onSearch={(value) => go({ q: value, page: 1 })} stats={stats} />

      <CategoryTiles stats={stats} hrefFor={categoryHref} />

      {/* Thực đơn */}
      <section id="thuc-don" className="mb-16 scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {q ? `Kết quả cho “${q}”${category ? " trong " + category : ""}` : category || "Thực đơn"}
            </h2>
            <p className="mt-1 text-[15px] text-stone-500">
              {total !== null && (
                <>
                  {total} món{totalPages > 1 && ` · Trang ${page}/${totalPages}`}
                </>
              )}
              {(q || category) && (
                <>
                  {total !== null && " · "}
                  <Link to="/dishes#thuc-don" className="font-semibold text-brand-700 hover:underline">Xóa bộ lọc</Link>
                </>
              )}
            </p>
          </div>

          {opts && (
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-[15px] font-semibold text-stone-500">Sắp xếp theo</label>
              <select
                id="sort"
                name="sort"
                value={sort}
                onChange={(e) => go({ sort: e.target.value, page: 1 })}
                className="min-h-11 rounded-xl border border-[#EADBD2] bg-white py-2 pl-3 pr-8 text-[15px] font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              >
                {opts.sorts.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {options.status === "error" ? (
          <div className="mb-6">
            <InlineError text="Không tải được danh mục để lọc." onRetry={options.retry} />
          </div>
        ) : (
          opts && (
            <nav className="mb-6 flex flex-wrap gap-2" aria-label="Lọc theo danh mục">
              {["", ...opts.categories].map((c) => {
                const active = c === category;
                return (
                  <Link
                    key={c || "all"}
                    to={categoryHref(c)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition sm:px-5 sm:text-[15px] ${
                      active ? "bg-brand-600 text-white" : "border border-[#EADBD2] bg-white hover:bg-brand-50 hover:text-brand-700"
                    }`}
                  >
                    {c || "Tất cả"}
                  </Link>
                );
              })}
            </nav>
          )
        )}

        <DataStatus state={list}>
          {(dishes, listMeta) =>
            dishes.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#D9C3B7] bg-white p-12 text-center">
                <p className="text-lg font-bold">Chưa tìm thấy món phù hợp</p>
                <p className="mt-1 text-stone-500">
                  Thử từ khóa khác, hoặc <Link to="/dishes#thuc-don" className="font-semibold text-brand-700 hover:underline">xem toàn bộ thực đơn</Link>.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {dishes.map((d) => (
                    <DishCard key={d.id} dish={d} />
                  ))}
                </div>
                <Pagination
                  page={listMeta.page}
                  totalPages={listMeta.totalPages}
                  hrefFor={(p) => menuHref({ ...filters, page: p })}
                />
              </>
            )
          }
        </DataStatus>
      </section>

      <BookingCta />
    </>
  );
}
