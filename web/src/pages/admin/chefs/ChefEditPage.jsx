import { useNavigate, useParams } from "react-router-dom";
import { chefsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import ChefForm, { chefToValues } from "./ChefForm.jsx";

// GET /admin/chefs/:id/edit — nạp bản ghi theo id; PATCH /api/chefs/:id rồi sang trang chi tiết
export default function ChefEditPage() {
  useDocumentTitle("Sửa đầu bếp");
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useApiData((signal) => chefsApi.get(id, signal), [id]);

  return (
    <div className="mx-auto max-w-2xl">
      <DataStatus state={state} notFoundText="Không tìm thấy đầu bếp.">
        {(chef) => (
          <>
            <PageHeading heading="Sửa đầu bếp" subheading={chef.name} back={{ href: "/admin/chefs/" + chef.id, label: "Chi tiết đầu bếp" }} />
            <ChefForm
              initialValues={chefToValues(chef)}
              submitLabel="Lưu thay đổi"
              cancelHref={"/admin/chefs/" + chef.id}
              onSubmit={(body) => chefsApi.update(chef.id, body)}
              onDone={(saved) => navigate("/admin/chefs/" + saved.id)}
            />
          </>
        )}
      </DataStatus>
    </div>
  );
}
