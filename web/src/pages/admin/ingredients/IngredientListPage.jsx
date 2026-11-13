import { Link, useSearchParams } from "react-router-dom";
import { ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import Pagination from "../../../components/Pagination.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";

// GET /admin/ingredients?page=... — bảng nguyên liệu + phân trang
export default function IngredientListPage() {
  useDocumentTitle("Quản lý nguyên liệu");
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page") || "1";
  const state = useApiData((signal) => ingredientsApi.list({ page, pageSize: 10 }, signal), [page]);

  return (
    <DataStatus state={state}>
      {(ingredients, meta) => (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Quản lý nguyên liệu</h1>
              <p className="mt-1 text-stone-500">{meta.total} nguyên liệu trong kho{meta.totalPages > 1 && ` · Trang ${meta.page}/${meta.totalPages}`}</p>
            </div>
            <Link to="/admin/ingredients/new" className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">+ Thêm mới</Link>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <table className="rtable w-full text-left text-sm md:min-w-[560px]">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Nguyên liệu</th>
                  <th className="px-4 py-3">Đơn vị</th>
                  <th className="px-4 py-3 text-center">Dùng trong</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {ingredients.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">Chưa có nguyên liệu nào.</td></tr>
                )}
                {ingredients.map((i) => (
                  <tr key={i.id} className="hover:bg-cream">
                    <td className="px-4 py-3 text-stone-400" data-label="ID">#{i.id}</td>
                    <td className="rt-title px-4 py-3">
                      <Link to={"/admin/ingredients/" + i.id} className="font-semibold hover:text-brand-700">{i.name}</Link>
                    </td>
                    <td className="px-4 py-3" data-label="Đơn vị">
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">{i.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-stone-600" data-label="Dùng trong">{i._count.dishes} món</td>
                    <td className="px-4 py-3 text-stone-500" data-label="Ngày tạo">{new Date(i.createdAt).toLocaleDateString("vi-VN")}</td>
                    <td className="rt-actions whitespace-nowrap px-4 py-3 text-right">
                      <Link to={`/admin/ingredients/${i.id}/edit`} className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50">Sửa</Link>
                      <Link to={`/admin/ingredients/${i.id}/delete`} className="rounded-lg px-3 py-1.5 font-medium text-red-600 hover:bg-red-50">Xóa</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(p) => (p > 1 ? "/admin/ingredients?page=" + p : "/admin/ingredients")} />
        </>
      )}
    </DataStatus>
  );
}
