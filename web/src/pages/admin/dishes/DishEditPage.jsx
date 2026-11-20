import { useNavigate, useParams } from "react-router-dom";
import { adminDishesApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useAuth } from "../../../auth/AuthContext.jsx";
import DishForm, { dishToValues } from "./DishForm.jsx";
import { loadDishFormOptions } from "./DishNewPage.jsx";

// GET /admin/dishes/:id/edit — nạp bản ghi theo id trong URL; PATCH /api/dishes/:id rồi sang trang chi tiết
export default function DishEditPage() {
  useDocumentTitle("Sửa món ăn");
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const state = useApiData(
    async (signal) => {
      const [dish, opts] = await Promise.all([adminDishesApi.get(id, signal), loadDishFormOptions(signal)]);
      return { data: { dish: dish.data, opts } };
    },
    [id]
  );

  return (
    <div className="mx-auto max-w-2xl">
      <DataStatus state={state} notFoundText="Không tìm thấy món ăn.">
        {({ dish, opts }) => (
          <>
            <PageHeading heading="Sửa món ăn" subheading={dish.name} back={{ href: "/admin/dishes/" + dish.id, label: "Chi tiết món ăn" }} />
            {/* Mở được form chưa bảo đảm ghi được: PATCH vẫn bị API kiểm tra lại (RBAC + ABAC) */}
            {!dish.canEdit ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900" role="alert" data-code="FORBIDDEN">
                Bạn không sửa được món này: Editor chỉ sửa món ở trạng thái nháp của đầu bếp mình phụ trách.
              </div>
            ) : (
            <DishForm
              initialValues={dishToValues(dish)}
              {...opts}
              canAssign={user.role === "admin"}
              submitLabel="Lưu thay đổi"
              cancelHref={"/admin/dishes/" + dish.id}
              onSubmit={(body) => adminDishesApi.update(dish.id, body)}
              onDone={(saved) => navigate("/admin/dishes/" + saved.id)}
            />
            )}
          </>
        )}
      </DataStatus>
    </div>
  );
}
