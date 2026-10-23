import { Link, useParams } from "react-router-dom";
import { ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import DishImage from "../../../components/DishImage.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { formatQty } from "../../../lib/format.js";

const row = "grid gap-1 px-6 py-3 sm:grid-cols-3 sm:gap-4";

// GET /admin/ingredients/:id — chi tiết nguyên liệu và các món dùng nó
export default function IngredientShowPage() {
  const { id } = useParams();
  const state = useApiData((signal) => ingredientsApi.get(id, signal), [id]);
  useDocumentTitle(state.status === "ok" ? state.data.name : "Nguyên liệu");

  return (
    <DataStatus state={state} notFoundText="Không tìm thấy nguyên liệu.">
      {(ingredient) => (
        <div className="mx-auto max-w-2xl">
          <PageHeading heading={ingredient.name} subheading={"Nguyên liệu #" + ingredient.id} back={{ href: "/admin/ingredients", label: "Danh sách nguyên liệu" }} />

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <dl className="divide-y divide-stone-100 text-sm">
              <div className={row}><dt className="text-stone-500">Tên nguyên liệu</dt><dd className="font-semibold sm:col-span-2">{ingredient.name}</dd></div>
              <div className={row}><dt className="text-stone-500">Đơn vị tính</dt><dd className="sm:col-span-2">{ingredient.unit}</dd></div>
              <div className={row}><dt className="text-stone-500">Ngày tạo</dt><dd className="sm:col-span-2">{new Date(ingredient.createdAt).toLocaleString("vi-VN")}</dd></div>
            </dl>

            <div className="border-t border-stone-100 px-6 py-4">
              <h2 className="mb-3 text-sm font-semibold">Dùng trong · {ingredient.dishes.length} món</h2>
              {ingredient.dishes.length === 0 ? (
                <p className="text-sm text-stone-400">Chưa có món nào dùng nguyên liệu này. Thêm vào công thức trong form sửa món ăn.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ingredient.dishes.map((di) => (
                    <li key={di.dish.id}>
                      <Link to={"/admin/dishes/" + di.dish.id} className="flex items-center gap-3 rounded-lg bg-stone-50 p-2 text-sm hover:bg-brand-50">
                        <DishImage src={di.dish.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                        <span className="flex-1 font-medium">{di.dish.name}</span>
                        <span className="font-semibold text-stone-700">{formatQty(di.quantity)} {ingredient.unit}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-stone-100 px-6 py-4">
              <Link to={`/admin/ingredients/${ingredient.id}/edit`} className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Sửa</Link>
              <Link to={`/admin/ingredients/${ingredient.id}/delete`} className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700">Xóa</Link>
              <Link to="/admin/ingredients" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Quay lại danh sách</Link>
            </div>
          </div>
        </div>
      )}
    </DataStatus>
  );
}
