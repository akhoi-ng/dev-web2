import { Link, useNavigate, useParams } from "react-router-dom";
import { dishesApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import DishImage from "../../../components/DishImage.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useSubmit } from "../../../hooks/useSubmit.js";
import { formatPrice } from "../../../lib/format.js";

// GET /admin/dishes/:id/delete — trang xác nhận; chỉ nút "Xác nhận xóa" gửi DELETE
export default function DishDeletePage() {
  useDocumentTitle("Xóa món ăn");
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useApiData((signal) => dishesApi.get(id, signal), [id]);
  const { pending, formError, submit } = useSubmit();

  async function confirmDelete(dishId) {
    const result = await submit(() => dishesApi.remove(dishId));
    if (result) navigate("/admin/dishes");
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeading heading="Xác nhận xóa món ăn" back={{ href: "/admin/dishes", label: "Danh sách món ăn" }} />
      <DataStatus state={state} notFoundText="Không tìm thấy món ăn.">
        {(dish) => (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-red-200">
            <div className="flex gap-4 p-6">
              <DishImage src={dish.imageUrl} alt="" className="h-24 w-24 flex-none rounded-xl object-cover" />
              <div>
                <p className="text-xs text-stone-400">#{dish.id} · {dish.category || "Không phân loại"}</p>
                <p className="text-lg font-bold">{dish.name}</p>
                <p className="font-semibold text-brand-600">{formatPrice(dish.price)}</p>
              </div>
            </div>

            <div className="border-t border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700">
              Bạn có chắc muốn xóa món <strong>{dish.name}</strong>? Thao tác này không thể hoàn tác.
            </div>

            {formError && <p className="px-6 pt-4 text-sm font-semibold text-red-700" role="alert">{formError}</p>}

            <div className="flex flex-wrap gap-3 px-6 py-4">
              <button type="button" disabled={pending} onClick={() => confirmDelete(dish.id)}
                      className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {pending ? "Đang xóa…" : "Xác nhận xóa"}
              </button>
              <Link to="/admin/dishes" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Hủy</Link>
            </div>
          </div>
        )}
      </DataStatus>
    </div>
  );
}
