import { Link, useNavigate, useParams } from "react-router-dom";
import { ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useSubmit } from "../../../hooks/useSubmit.js";

// GET /admin/ingredients/:id/delete — trang xác nhận; chỉ nút "Xác nhận xóa" gửi DELETE
export default function IngredientDeletePage() {
  useDocumentTitle("Xóa nguyên liệu");
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useApiData((signal) => ingredientsApi.get(id, signal), [id]);
  const { pending, formError, submit } = useSubmit();

  async function confirmDelete(ingredientId) {
    const result = await submit(() => ingredientsApi.remove(ingredientId));
    if (result) navigate("/admin/ingredients");
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeading heading="Xác nhận xóa nguyên liệu" back={{ href: "/admin/ingredients", label: "Danh sách nguyên liệu" }} />
      <DataStatus state={state} notFoundText="Không tìm thấy nguyên liệu.">
        {(ingredient) => (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-red-200">
            <div className="p-6">
              <p className="text-xs text-stone-400">#{ingredient.id}</p>
              <p className="text-lg font-bold">{ingredient.name}</p>
              <p className="text-stone-600">Đơn vị tính: {ingredient.unit}</p>
            </div>

            <div className="border-t border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700">
              Bạn có chắc muốn xóa nguyên liệu <strong>{ingredient.name}</strong>? Thao tác này không thể hoàn tác.
              {ingredient.dishes.length > 0 && (
                <>
                  <br />
                  Nguyên liệu đang có trong công thức của <strong>{ingredient.dishes.length} món</strong> và sẽ bị gỡ khỏi các công thức đó (món ăn không bị xóa).
                </>
              )}
            </div>

            {formError && <p className="px-6 pt-4 text-sm font-semibold text-red-700" role="alert">{formError}</p>}

            <div className="flex flex-wrap gap-3 px-6 py-4">
              <button type="button" disabled={pending} onClick={() => confirmDelete(ingredient.id)}
                      className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {pending ? "Đang xóa…" : "Xác nhận xóa"}
              </button>
              <Link to="/admin/ingredients" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Hủy</Link>
            </div>
          </div>
        )}
      </DataStatus>
    </div>
  );
}
