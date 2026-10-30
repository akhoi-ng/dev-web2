import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { dishesApi, getOptions, getStats } from "../api/index.js";
import DataStatus from "../components/DataStatus.jsx";
import Pagination from "../components/Pagination.jsx";
import SearchError, { isSearchError } from "../components/SearchError.jsx";
import ViewSwitch, { parseView } from "../components/ViewSwitch.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useLoadMore } from "../hooks/useLoadMore.js";
import { apiQuery, criteriaKey, hasFilters, isRankedCriteria, readCriteria, writeParams } from "../lib/dish-search.js";
import BookingCta from "./menu/BookingCta.jsx";
import CategoryTiles from "./menu/CategoryTiles.jsx";
import DishCard from "./menu/DishCard.jsx";
import InlineError from "./menu/InlineError.jsx";
import LoadMoreList from "./menu/LoadMoreList.jsx";
import MenuHero from "./menu/MenuHero.jsx";

const PAGE_SIZE = 9;
const CLEAR_HREF = "/dishes#thuc-don";

// Đường dẫn thực đơn: tiêu chí tìm kiếm + kiểu phân trang (+ số trang khi ở kiểu "Số trang").
// Chỉ ghi tham số khác mặc định. #thuc-don để cuộn tới danh sách.
function menuHref(criteria, view, page = 1) {
  const qs = writeParams(criteria, {
    view: view === "pages" ? "" : view,
    page: view === "pages" && page > 1 ? page : "",
  }).toString();
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

  // Trạng thái tìm kiếm và kiểu phân trang nằm hoàn toàn trên URL
  const criteria = readCriteria(searchParams);
  const view = parseView(searchParams.get("view"));
  const pageParam = parsePage(searchParams.get("page"));
  const key = criteriaKey(criteria);

  const stats = useApiData((signal) => getStats(signal), []);
  const options = useApiData((signal) => getOptions(signal), []);
  const opts = options.status === "ok" ? options.data : null;

  // Kiểu "Số trang": mỗi trang là một URL (?page=); Reload / copy link mở lại đúng trang
  const paged = useApiData(
    (signal) =>
      view === "pages"
        ? dishesApi.list({ ...apiQuery(criteria), page: pageParam, pageSize: PAGE_SIZE }, signal)
        : Promise.resolve({ data: [], meta: null }),
    [key, view, pageParam],
  );

  // Kiểu "Tải thêm" / "Cuộn vô hạn": tải từng trang bằng AJAX, nối vào danh sách của lần tìm này.
  // URL không giữ số trang: Reload / mở lại link / Back từ trang chi tiết tải lại từ đầu.
  const more = useLoadMore(view === "pages" ? null : `${key}|${view}`, (page, signal) =>
    dishesApi.list({ ...apiQuery(criteria), page, pageSize: PAGE_SIZE }, signal),
  );

  // Tìm lại, đổi bộ lọc, sắp xếp hoặc kiểu phân trang -> bắt đầu từ phần đầu của kết quả mới
  const go = (next, nextView = view) => navigate(menuHref(next, nextView));
  const categoryHref = (c) => menuHref({ ...criteria, category: c }, view);

  const filtered = hasFilters(criteria);
  const ranked = isRankedCriteria(criteria);
  const modeLabel = opts?.searchModes.find((m) => m.key === criteria.mode)?.label;

  const meta = view === "pages" ? (paged.status === "ok" ? paged.meta : null) : null;
  const total = view === "pages" ? (meta ? meta.total : null) : more.total;
  const listError = view === "pages" ? (paged.status === "error" ? paged.error : null) : more.items.length === 0 ? more.error : null;

  const empty = (
    <div className="rounded-3xl border border-dashed border-[#D9C3B7] bg-white p-12 text-center">
      <p className="text-lg font-bold">Chưa tìm thấy món phù hợp</p>
      <p className="mt-1 text-stone-500">
        Thử từ khóa hoặc kiểu tìm kiếm khác, hoặc <Link to={CLEAR_HREF} className="font-semibold text-brand-700 hover:underline">xem toàn bộ thực đơn</Link>.
      </p>
    </div>
  );

  return (
    <>
      <MenuHero criteria={criteria} modes={opts?.searchModes} onSearch={(next) => go(next)} stats={stats} />

      <CategoryTiles stats={stats} hrefFor={categoryHref} />

      {/* Thực đơn */}
      <section id="thuc-don" className="mb-16 scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {criteria.q
                ? `Kết quả${modeLabel ? " " + modeLabel.toLocaleLowerCase("vi") : ""} cho “${criteria.q}”${criteria.category ? " trong " + criteria.category : ""}`
                : criteria.category || "Thực đơn"}
            </h2>
            <p className="mt-1 text-[15px] text-stone-500">
              {total !== null && (
                <>
                  {total} món
                  {meta && meta.totalPages > 1 && ` · Trang ${meta.page}/${meta.totalPages}`}
                  {view !== "pages" && more.items.length > 0 && ` · Đang hiện ${more.items.length}`}
                </>
              )}
              {filtered && (
                <>
                  {total !== null && " · "}
                  <Link to={CLEAR_HREF} className="font-semibold text-brand-700 hover:underline">Xóa bộ lọc</Link>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitch view={view} hrefFor={(v) => menuHref(criteria, v)} />
            {opts &&
              (ranked ? (
                <span className="text-[15px] font-semibold text-stone-500">Sắp xếp: Độ liên quan</span>
              ) : (
                <div className="flex items-center gap-2">
                  <label htmlFor="sort" className="text-[15px] font-semibold text-stone-500">Sắp xếp theo</label>
                  <select
                    id="sort"
                    name="sort"
                    value={criteria.sort}
                    onChange={(e) => go({ ...criteria, sort: e.target.value })}
                    className="min-h-11 rounded-xl border border-[#EADBD2] bg-white py-2 pl-3 pr-8 text-[15px] font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  >
                    {opts.sorts.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </div>

        {options.status === "error" ? (
          <div className="mb-6">
            <InlineError text="Không tải được danh mục để lọc." onRetry={options.retry} />
          </div>
        ) : (
          opts && (
            <nav className="mb-6 flex flex-wrap gap-2" aria-label="Lọc theo danh mục">
              {["", ...opts.categories].map((c) => {
                const active = c === criteria.category;
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

        {listError && isSearchError(listError) ? (
          <SearchError error={listError} clearHref={CLEAR_HREF} />
        ) : view === "pages" ? (
          <DataStatus state={paged}>
            {(dishes, listMeta) =>
              dishes.length === 0 ? (
                empty
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
                    hrefFor={(p) => menuHref(criteria, "pages", p)}
                  />
                </>
              )
            }
          </DataStatus>
        ) : (
          <LoadMoreList list={more} view={view} empty={empty} />
        )}
      </section>

      <BookingCta />
    </>
  );
}
