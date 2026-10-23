import { Link, useParams } from "react-router-dom";
import { dishesApi } from "../../../api/index.js";
import ChefAvatar from "../../../components/ChefAvatar.jsx";
import DataStatus from "../../../components/DataStatus.jsx";
import DishImage from "../../../components/DishImage.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { formatPrice, formatQty } from "../../../lib/format.js";

const row = "grid gap-1 px-6 py-3 sm:grid-cols-3 sm:gap-4";

// GET /admin/dishes/:id — chi tiết món ăn (trang đích sau khi thêm / sửa)
export default function DishShowPage() {
  const { id } = useParams();
  const state = useApiData((signal) => dishesApi.get(id, signal), [id]);
  useDocumentTitle(state.status === "ok" ? state.data.name : "Món ăn");

  return (
    <DataStatus state={state} notFoundText="Không tìm thấy món ăn.">
      {(dish) => (
        <div className="mx-auto max-w-3xl">
          <PageHeading heading={dish.name} subheading={"Món ăn #" + dish.id} back={{ href: "/admin/dishes", label: "Danh sách món ăn" }} />

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <DishImage src={dish.imageUrl} alt={dish.name} className="aspect-[16/7] w-full object-cover" />

            <dl className="divide-y divide-stone-100 text-sm">
              <div className={row}><dt className="text-stone-500">Tên món</dt><dd className="font-semibold sm:col-span-2">{dish.name}</dd></div>
              <div className={row}><dt className="text-stone-500">Giá</dt><dd className="font-semibold text-brand-600 sm:col-span-2">{formatPrice(dish.price)}</dd></div>
              <div className={row}><dt className="text-stone-500">Danh mục</dt><dd className="sm:col-span-2">{dish.category || "—"}</dd></div>
              <div className={row}>
                <dt className="text-stone-500">Đầu bếp phụ trách</dt>
                <dd className="sm:col-span-2">
                  {dish.chef ? (
                    <>
                      <Link to={"/admin/chefs/" + dish.chef.id} className="inline-flex items-center gap-2 font-semibold hover:text-brand-700">
                        <ChefAvatar chef={dish.chef} size="h-7 w-7" textSize="text-xs" />
                        {dish.chef.name}
                      </Link>
                      <span className="text-stone-500"> · {dish.chef.specialty}</span>
                    </>
                  ) : (
                    <span className="text-stone-400">Chưa phân công</span>
                  )}
                </dd>
              </div>
              <div className={row}><dt className="text-stone-500">Trạng thái</dt><dd className="sm:col-span-2">{dish.available ? "Còn món" : "Hết món"}</dd></div>
              <div className={row}><dt className="text-stone-500">Mô tả</dt><dd className="text-stone-700 sm:col-span-2">{dish.description || "—"}</dd></div>
              <div className={row}><dt className="text-stone-500">URL ảnh</dt><dd className="break-all text-stone-500 sm:col-span-2">{dish.imageUrl || "(dùng ảnh mặc định)"}</dd></div>
              <div className={row}><dt className="text-stone-500">Ngày tạo</dt><dd className="sm:col-span-2">{new Date(dish.createdAt).toLocaleString("vi-VN")}</dd></div>
            </dl>

            <div className="border-t border-stone-100 px-6 py-4">
              <h2 className="mb-3 text-sm font-semibold">Công thức · {dish.ingredients.length} nguyên liệu / phần</h2>
              {dish.ingredients.length === 0 ? (
                <p className="text-sm text-stone-400">Chưa có nguyên liệu. Bấm "Sửa" để thêm công thức.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {dish.ingredients.map((di) => (
                    <li key={di.ingredientId}>
                      <Link to={"/admin/ingredients/" + di.ingredientId} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm hover:bg-brand-50">
                        <span>{di.ingredient.name}</span>
                        <span className="font-semibold text-stone-700">{formatQty(di.quantity)} {di.ingredient.unit}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-stone-100 px-6 py-4">
              <Link to={`/admin/dishes/${dish.id}/edit`} className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Sửa</Link>
              <Link to={`/admin/dishes/${dish.id}/delete`} className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700">Xóa</Link>
              <Link to="/admin/dishes" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Quay lại danh sách</Link>
              <Link to={"/dishes/" + dish.id} className="ml-auto rounded-xl px-5 py-2.5 font-medium text-stone-500 hover:text-brand-700">Xem trang khách →</Link>
            </div>
          </div>
        </div>
      )}
    </DataStatus>
  );
}
