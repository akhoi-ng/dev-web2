import { Link, useSearchParams } from "react-router-dom";
import { chefsApi } from "../../../api/index.js";
import ChefAvatar from "../../../components/ChefAvatar.jsx";
import DataStatus from "../../../components/DataStatus.jsx";
import Pagination from "../../../components/Pagination.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";

// GET /admin/chefs?page=... — bảng đầu bếp + phân trang
export default function ChefListPage() {
  useDocumentTitle("Quản lý đầu bếp");
  const [searchParams] = useSearchParams();
  const page = searchParams.get("page") || "1";
  const state = useApiData((signal) => chefsApi.list({ page, pageSize: 10 }, signal), [page]);

  return (
    <DataStatus state={state}>
      {(chefs, meta) => (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Quản lý đầu bếp</h1>
              <p className="mt-1 text-stone-500">{meta.total} đầu bếp trong đội ngũ{meta.totalPages > 1 && ` · Trang ${meta.page}/${meta.totalPages}`}</p>
            </div>
            <Link to="/admin/chefs/new" className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">+ Thêm mới</Link>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <table className="rtable w-full text-left text-sm md:min-w-[600px]">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Đầu bếp</th>
                  <th className="px-4 py-3">Chuyên môn</th>
                  <th className="px-4 py-3 text-center">Món phụ trách</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {chefs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">Chưa có đầu bếp nào.</td></tr>
                )}
                {chefs.map((c) => (
                  <tr key={c.id} className="hover:bg-cream">
                    <td className="px-4 py-3 text-stone-400" data-label="ID">#{c.id}</td>
                    <td className="rt-title px-4 py-3">
                      <Link to={"/admin/chefs/" + c.id} className="flex items-center gap-3 font-semibold hover:text-brand-700">
                        <ChefAvatar chef={c} size="h-11 w-11" />
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600" data-label="Chuyên môn">{c.specialty}</td>
                    <td className="px-4 py-3 text-center text-stone-600" data-label="Món phụ trách">{c._count.dishes}</td>
                    <td className="rt-actions whitespace-nowrap px-4 py-3 text-right">
                      <Link to={`/admin/chefs/${c.id}/edit`} className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50">Sửa</Link>
                      <Link to={`/admin/chefs/${c.id}/delete`} className="rounded-lg px-3 py-1.5 font-medium text-red-600 hover:bg-red-50">Xóa</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(p) => (p > 1 ? "/admin/chefs?page=" + p : "/admin/chefs")} />
        </>
      )}
    </DataStatus>
  );
}
