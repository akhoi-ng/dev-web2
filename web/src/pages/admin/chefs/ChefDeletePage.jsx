import { Link, useNavigate, useParams } from "react-router-dom";
import { chefsApi } from "../../../api/index.js";
import ChefAvatar from "../../../components/ChefAvatar.jsx";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useSubmit } from "../../../hooks/useSubmit.js";

// GET /admin/chefs/:id/delete — trang xác nhận; chỉ nút "Xác nhận xóa" gửi DELETE
export default function ChefDeletePage() {
  useDocumentTitle("Xóa đầu bếp");
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useApiData((signal) => chefsApi.get(id, signal), [id]);
  const { pending, formError, submit } = useSubmit();

  async function confirmDelete(chefId) {
    const result = await submit(() => chefsApi.remove(chefId));
    if (result) navigate("/admin/chefs");
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeading heading="Xác nhận xóa đầu bếp" back={{ href: "/admin/chefs", label: "Danh sách đầu bếp" }} />
      <DataStatus state={state} notFoundText="Không tìm thấy đầu bếp.">
        {(chef) => (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-red-200">
            <div className="flex items-center gap-4 p-6">
              <ChefAvatar chef={chef} size="h-20 w-20" textSize="text-2xl" />
              <div>
                <p className="text-xs text-stone-400">#{chef.id}</p>
                <p className="text-lg font-bold">{chef.name}</p>
                <p className="text-brand-700">{chef.specialty}</p>
              </div>
            </div>

            <div className="border-t border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700">
              Bạn có chắc muốn xóa đầu bếp <strong>{chef.name}</strong>? Thao tác này không thể hoàn tác.
              {chef.dishes.length > 0 && (
                <>
                  <br />
                  <strong>{chef.dishes.length} món</strong> đang do đầu bếp này phụ trách sẽ chuyển thành "Chưa phân công" (món ăn không bị xóa).
                </>
              )}
            </div>

            {formError && <p className="px-6 pt-4 text-sm font-semibold text-red-700" role="alert">{formError}</p>}

            <div className="flex flex-wrap gap-3 px-6 py-4">
              <button type="button" disabled={pending} onClick={() => confirmDelete(chef.id)}
                      className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {pending ? "Đang xóa…" : "Xác nhận xóa"}
              </button>
              <Link to="/admin/chefs" className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100">Hủy</Link>
            </div>
          </div>
        )}
      </DataStatus>
    </div>
  );
}
