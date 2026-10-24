import { Link, useParams } from "react-router-dom";
import { chefsApi } from "../../../api/index.js";
import ChefAvatar from "../../../components/ChefAvatar.jsx";
import DataStatus from "../../../components/DataStatus.jsx";
import DishImage from "../../../components/DishImage.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";

const row = "grid gap-1 px-6 py-3 sm:grid-cols-3 sm:gap-4";

// GET /admin/chefs/:id — chi tiết đầu bếp và các món phụ trách
export default function ChefShowPage() {
  const { id } = useParams();
  const state = useApiData((signal) => chefsApi.get(id, signal), [id]);
  useDocumentTitle(state.status === "ok" ? state.data.name : "Đầu bếp");

  return (
    <DataStatus state={state} notFoundText="Không tìm thấy đầu bếp.">
      {(chef) => (
        <div className="mx-auto max-w-2xl">
          <PageHeading heading={chef.name} subheading={"Đầu bếp #" + chef.id} back={{ href: "/admin/chefs", label: "Danh sách đầu bếp" }} />

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-brand-50 to-stone-100 px-6 py-8 text-center">
              <ChefAvatar chef={chef} size="h-32 w-32" textSize="text-4xl" />
              <div>
                <p className="text-xl font-bold">{chef.name}</p>
                <p className="text-brand-700">{chef.specialty}</p>
              </div>
            </div>

            <dl className="divide-y divide-stone-100 text-sm">
              <div className={row}><dt className="text-stone-500">Họ tên</dt><dd className="font-semibold sm:col-span-2">{chef.name}</dd></div>
              <div className={row}><dt className="text-stone-500">Chuyên môn</dt><dd className="sm:col-span-2">{chef.specialty}</dd></div>
              <div className={row}><dt className="text-stone-500">URL ảnh</dt><dd className="break-all text-stone-500 sm:col-span-2">{chef.imageUrl || "(chưa có ảnh)"}</dd></div>
              <div className={row}><dt className="text-stone-500">Ngày tạo</dt><dd className="sm:col-span-2">{new Date(chef.createdAt).toLocaleString("vi-VN")}</dd></div>
            </dl>

            <div className="border-t border-stone-100 px-6 py-4">
              <h2 className="mb-3 text-sm font-semibold">Món phụ trách · {chef.dishes.length} món</h2>
              {chef.dishes.length === 0 ? (
                <p className="text-sm text-stone-400">Chưa phụ trách món nào. Gán đầu bếp trong form sửa món ăn.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {chef.dishes.map((d) => (
                    <li key={d.id}>
                      <Link to={"/admin/dishes/" + d.id} className="flex items-center gap-3 rounded-lg bg-stone-50 p-2 text-sm hover:bg-brand-50">
                        <DishImage src={d.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                        <span className="flex-1 font-medium">{d.name}</span>
                        <span className="text-xs text-stone-500">{d.category || ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-stone-100 px-6 py-4">
              <Link to={`/admin/chefs/${chef.id}/edit`} className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Sửa</Link>
              <Link to={`/admin/chefs/${chef.id}/delete`} className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700">Xóa</Link>
              <Link to="/admin/chefs" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Quay lại danh sách</Link>
            </div>
          </div>
        </div>
      )}
    </DataStatus>
  );
}
