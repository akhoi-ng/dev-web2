import { useNavigate } from "react-router-dom";
import { chefsApi, dishesApi, getOptions, ingredientsApi } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import PageHeading from "../../../components/PageHeading.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import DishForm, { emptyDishValues } from "./DishForm.jsx";

// Danh sách đầu bếp, nguyên liệu, danh mục cho các ô chọn trong form
export async function loadDishFormOptions(signal) {
  const [chefs, ingredients, options] = await Promise.all([
    chefsApi.list({}, signal),
    ingredientsApi.list({}, signal),
    getOptions(signal),
  ]);
  const byName = (a, b) => a.name.localeCompare(b.name, "vi");
  return {
    chefs: [...chefs.data].sort(byName),
    ingredients: [...ingredients.data].sort(byName),
    categories: options.data.categories,
  };
}

// GET /admin/dishes/new — form thêm; POST /api/dishes rồi sang trang chi tiết
export default function DishNewPage() {
  useDocumentTitle("Thêm món ăn");
  const navigate = useNavigate();
  const state = useApiData(async (signal) => ({ data: await loadDishFormOptions(signal) }), []);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading heading="Thêm món ăn mới" back={{ href: "/admin/dishes", label: "Danh sách món ăn" }} />
      <DataStatus state={state}>
        {(opts) => (
          <DishForm
            initialValues={emptyDishValues}
            {...opts}
            submitLabel="Thêm món ăn"
            cancelHref="/admin/dishes"
            onSubmit={(body) => dishesApi.create(body)}
            onDone={(dish) => navigate("/admin/dishes/" + dish.id)}
          />
        )}
      </DataStatus>
    </div>
  );
}
