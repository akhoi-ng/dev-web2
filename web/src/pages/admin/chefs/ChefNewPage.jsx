import { useNavigate } from "react-router-dom";
import { chefsApi } from "../../../api/index.js";
import PageHeading from "../../../components/PageHeading.jsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import ChefForm, { emptyChefValues } from "./ChefForm.jsx";

// GET /admin/chefs/new — form thêm; POST /api/chefs rồi sang trang chi tiết
export default function ChefNewPage() {
  useDocumentTitle("Thêm đầu bếp");
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading heading="Thêm đầu bếp mới" back={{ href: "/admin/chefs", label: "Danh sách đầu bếp" }} />
      <ChefForm
        initialValues={emptyChefValues}
        submitLabel="Thêm đầu bếp"
        cancelHref="/admin/chefs"
        onSubmit={(body) => chefsApi.create(body)}
        onDone={(chef) => navigate("/admin/chefs/" + chef.id)}
      />
    </div>
  );
}
