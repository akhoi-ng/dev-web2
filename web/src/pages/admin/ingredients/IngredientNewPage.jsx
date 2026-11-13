import { useNavigate } from "react-router-dom";
import { getOptions, ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import IngredientForm, { emptyIngredientValues } from "./IngredientForm.jsx";

// GET /admin/ingredients/new — form thêm; POST /api/ingredients rồi sang trang chi tiết
export default function IngredientNewPage() {
  useDocumentTitle("Thêm nguyên liệu");
  const navigate = useNavigate();
  const options = useApiData((signal) => getOptions(signal), []);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading heading="Thêm nguyên liệu mới" back={{ href: "/admin/ingredients", label: "Danh sách nguyên liệu" }} />
      <DataStatus state={options}>
        {(opts) => (
          <IngredientForm
            initialValues={emptyIngredientValues}
            units={opts.units}
            submitLabel="Thêm nguyên liệu"
            cancelHref="/admin/ingredients"
            onSubmit={(body) => ingredientsApi.create(body)}
            onDone={(ingredient) => navigate("/admin/ingredients/" + ingredient.id)}
          />
        )}
      </DataStatus>
    </div>
  );
}
