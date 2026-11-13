import { useNavigate, useParams } from "react-router-dom";
import { getOptions, ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import IngredientForm, { ingredientToValues } from "./IngredientForm.jsx";

// GET /admin/ingredients/:id/edit — nạp bản ghi theo id; PATCH /api/ingredients/:id rồi sang trang chi tiết
export default function IngredientEditPage() {
  useDocumentTitle("Sửa nguyên liệu");
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useApiData(
    async (signal) => {
      const [ingredient, options] = await Promise.all([ingredientsApi.get(id, signal), getOptions(signal)]);
      return { data: { ingredient: ingredient.data, units: options.data.units } };
    },
    [id]
  );

  return (
    <div className="mx-auto max-w-2xl">
      <DataStatus state={state} notFoundText="Không tìm thấy nguyên liệu.">
        {({ ingredient, units }) => (
          <>
            <PageHeading heading="Sửa nguyên liệu" subheading={ingredient.name} back={{ href: "/admin/ingredients/" + ingredient.id, label: "Chi tiết nguyên liệu" }} />
            <IngredientForm
              initialValues={ingredientToValues(ingredient)}
              units={units}
              submitLabel="Lưu thay đổi"
              cancelHref={"/admin/ingredients/" + ingredient.id}
              onSubmit={(body) => ingredientsApi.update(ingredient.id, body)}
              onDone={(saved) => navigate("/admin/ingredients/" + saved.id)}
            />
          </>
        )}
      </DataStatus>
    </div>
  );
}
