import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { dishesApi, getOptions } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import DishImage from "../../../components/DishImage.jsx";
import Pagination from "../../../components/Pagination.jsx";
import SearchError, { isSearchError } from "../../../components/SearchError.jsx";
import SearchForm from "../../../components/SearchForm.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { apiQuery, criteriaKey, hasFilters, isRankedCriteria, readCriteria, writeParams } from "../../../lib/dish-search.js";
import { formatPrice } from "../../../lib/format.js";

const PAGE_SIZE = 10;

// Đường dẫn bảng món giữ nguyên tiêu chí; trang 1 không ghi lên URL
function adminHref(criteria, page = 1) {
  const qs = writeParams(criteria, { page: page > 1 ? page : "" }).toString();
  return "/admin/dishes" + (qs ? "?" + qs : "");
}

// GET /admin/dishes?mode&q&...&sort&page — bảng món ăn + tìm kiếm 4 mode + sắp xếp + phân trang số trang
export default function DishListPage() {
  useDocumentTitle("Quản lý món ăn");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const criteria = readCriteria(searchParams);
  const page = searchParams.get("page") || "1";

  const options = useApiData((signal) => getOptions(signal), []);
  const opts = options.status === "ok" ? options.data : null;

  const list = useApiData(
    (signal) => dishesApi.list({ ...apiQuery(criteria), page, pageSize: PAGE_SIZE }, signal),
    [criteriaKey(criteria), page]
  );

  // Đổi tiêu chí hoặc sắp xếp -> về trang 1 của kết quả mới
  const go = (next) => navigate(adminHref(next));
  const hrefFor = (p) => adminHref(criteria, p);
  const filtered = hasFilters(criteria);
  const ranked = isRankedCriteria(criteria);

  const meta = list.status === "ok" ? list.meta : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Quản lý món ăn</h1>
          <p className="mt-1 text-stone-500">
            {meta ? (
              <>
                {filtered ? `${meta.total} món phù hợp` : `${meta.total} món trong thực đơn`}
                {meta.totalPages > 1 && ` · Trang ${meta.page}/${meta.totalPages}`}
              </>
            ) : (
              " "
            )}
            {filtered && (
              <>
                {" · "}
                <Link to="/admin/dishes" className="font-semibold text-brand-700 hover:underline">Xóa bộ lọc</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {opts && (
            <div className="flex items-center gap-2">
              {ranked ? (
                <span className="text-sm font-medium text-stone-500">Sắp xếp: Độ liên quan</span>
              ) : (
                <>
                  <label htmlFor="sort" className="text-sm font-medium text-stone-500">Sắp xếp theo</label>
                  <select id="sort" value={criteria.sort} onChange={(e) => go({ ...criteria, sort: e.target.value })}
                          className="rounded-xl border-0 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 focus:ring-2 focus:ring-brand-400">
                    {opts.sorts.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
          <Link to="/admin/dishes/new" className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">+ Thêm mới</Link>
        </div>
      </div>

      {opts && (
        <div className="mb-6">
          <SearchForm criteria={criteria} modes={opts.searchModes} onSubmit={go} placeholder="Tìm theo tên món…" idPrefix="admin-search" />
        </div>
      )}

      {list.status === "error" && isSearchError(list.error) ? (
        <SearchError error={list.error} clearHref="/admin/dishes" />
      ) : (
    <DataStatus state={list}>
      {(dishes, meta) => (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <table className="rtable w-full text-left text-sm md:min-w-[900px]">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Món ăn</th>
                  <th className="px-4 py-3">Danh mục</th>
                  <th className="px-4 py-3">Đầu bếp</th>
                  <th className="px-4 py-3 text-center">Nguyên liệu</th>
                  <th className="px-4 py-3 text-right">Giá</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dishes.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-stone-500">{filtered ? "Không có món phù hợp." : "Chưa có món ăn nào."}</td></tr>
                )}
                {dishes.map((d) => (
                  <tr key={d.id} className="hover:bg-cream">
                    <td className="px-4 py-3 text-stone-400" data-label="ID">#{d.id}</td>
                    <td className="rt-title px-4 py-3">
                      <Link to={"/admin/dishes/" + d.id} className="flex items-center gap-3 font-semibold hover:text-brand-700">
                        <DishImage src={d.imageUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600" data-label="Danh mục">{d.category || "—"}</td>
                    <td className="px-4 py-3" data-label="Đầu bếp">
                      {d.chef ? (
                        <Link to={"/admin/chefs/" + d.chef.id} className="text-stone-700 hover:text-brand-700">{d.chef.name}</Link>
                      ) : (
                        <span className="text-stone-400">Chưa phân công</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-stone-600" data-label="Nguyên liệu">{d._count.ingredients}</td>
                    <td className="px-4 py-3 text-right font-semibold" data-label="Giá">{formatPrice(d.price)}</td>
                    <td className="px-4 py-3" data-label="Trạng thái">
                      {d.available ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Còn món</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Hết món</span>
                      )}
                    </td>
                    <td className="rt-actions whitespace-nowrap px-4 py-3 text-right">
                      <Link to={`/admin/dishes/${d.id}/edit`} className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50">Sửa</Link>
                      <Link to={`/admin/dishes/${d.id}/delete`} className="rounded-lg px-3 py-1.5 font-medium text-red-600 hover:bg-red-50">Xóa</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
        </>
      )}
    </DataStatus>
      )}
    </>
  );
}
