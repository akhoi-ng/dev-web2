import { useState } from "react";
import { Link } from "react-router-dom";
import FieldError from "../../../components/FieldError.jsx";
import { useSubmit } from "../../../hooks/useSubmit.js";

const input =
  "mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

export const emptyDishValues = {
  name: "",
  description: "",
  price: "",
  category: "",
  imageUrl: "",
  available: true,
  chefId: "",
  ingredients: {},
};

// Bản ghi từ API -> giá trị chuỗi để điền sẵn vào form sửa
export function dishToValues(d) {
  const ingredients = {};
  for (const di of d.ingredients || []) {
    ingredients[String(di.ingredientId)] = { selected: true, quantity: String(di.quantity) };
  }
  return {
    name: d.name,
    description: d.description || "",
    price: String(d.price),
    category: d.category || "",
    imageUrl: d.imageUrl || "",
    available: d.available,
    chefId: d.chefId ? String(d.chefId) : "",
    ingredients,
  };
}

// Giá trị form -> body JSON gửi lên API (API vẫn validate lại toàn bộ)
function toBody(values) {
  const ingredients = Object.entries(values.ingredients)
    .filter(([, v]) => v.selected)
    .map(([id, v]) => {
      const q = v.quantity.trim().replace(",", ".");
      return { ingredientId: Number(id), quantity: q === "" ? null : Number(q) };
    });
  return {
    name: values.name,
    description: values.description,
    price: values.price.trim() === "" ? null : Number(values.price),
    category: values.category,
    imageUrl: values.imageUrl,
    available: values.available,
    chefId: values.chefId ? Number(values.chefId) : null,
    ingredients,
  };
}

// onSubmit(body) -> Promise<{ data }>; onDone(data) được gọi khi API trả ok: true
export default function DishForm({ initialValues, categories, chefs, ingredients, submitLabel, cancelHref, onSubmit, onDone }) {
  const [values, setValues] = useState(initialValues);
  const { pending, fieldErrors, formError, submit } = useSubmit();

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const setIngredient = (id, patch) =>
    setValues((v) => {
      const cur = v.ingredients[id] || { selected: false, quantity: "" };
      return { ...v, ingredients: { ...v.ingredients, [id]: { ...cur, ...patch } } };
    });

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await submit(() => onSubmit(toBody(values)));
    if (result) onDone(result.data);
  }

  return (
    <>
      {formError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
          <p className="font-semibold">{formError}</p>
          {fieldErrors.ingredients && <p className="mt-1 text-sm">{fieldErrors.ingredients}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8">
        <div>
          <label htmlFor="name" className="text-sm font-semibold">Tên món ăn <span className="text-red-500">*</span></label>
          <input id="name" name="name" type="text" value={values.name} onChange={set("name")} maxLength={100} required className={input} placeholder="VD: Phở bò" />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className="text-sm font-semibold">Giá (VNĐ) <span className="text-red-500">*</span></label>
            <input id="price" name="price" type="number" min="0" step="1" inputMode="numeric" value={values.price} onChange={set("price")} required className={input} placeholder="VD: 75000" />
            <FieldError message={fieldErrors.price} />
          </div>
          <div>
            <label htmlFor="category" className="text-sm font-semibold">Danh mục</label>
            <select id="category" name="category" value={values.category} onChange={set("category")} className={input + " bg-white"}>
              <option value="">— Không phân loại —</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.category} />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="text-sm font-semibold">Mô tả</label>
          <textarea id="description" name="description" rows={4} maxLength={1000} value={values.description} onChange={set("description")} className={input} placeholder="Thành phần, hương vị..."></textarea>
          <FieldError message={fieldErrors.description} />
        </div>

        <div>
          <label htmlFor="imageUrl" className="text-sm font-semibold">URL hình ảnh</label>
          <input id="imageUrl" name="imageUrl" type="text" value={values.imageUrl} onChange={set("imageUrl")} className={input} placeholder="https://images.unsplash.com/..." />
          <p className="mt-1 text-xs text-stone-500">Để trống sẽ dùng ảnh mặc định.</p>
          <FieldError message={fieldErrors.imageUrl} />
        </div>

        <div>
          <label htmlFor="chefId" className="text-sm font-semibold">Đầu bếp phụ trách</label>
          <select id="chefId" name="chefId" value={values.chefId} onChange={set("chefId")} className={input + " bg-white"}>
            <option value="">— Chưa phân công —</option>
            {chefs.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name} · {c.specialty}</option>
            ))}
          </select>
          {chefs.length === 0 && (
            <p className="mt-1 text-xs text-stone-500">Chưa có đầu bếp. <Link to="/admin/chefs/new" className="text-brand-700 hover:underline">Thêm đầu bếp</Link></p>
          )}
          <FieldError message={fieldErrors.chefId} />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Công thức (nguyên liệu cho 1 phần ăn)</legend>
          <p className="mb-2 mt-1 text-xs text-stone-500">Tích chọn nguyên liệu và nhập định lượng theo đơn vị của nguyên liệu (VD: 0,25 kg).</p>
          {ingredients.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
              Chưa có nguyên liệu. <Link to="/admin/ingredients/new" className="text-brand-700 hover:underline">Thêm nguyên liệu</Link>
            </p>
          ) : (
            <div className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-300">
              {ingredients.map((ing) => {
                const id = String(ing.id);
                const v = values.ingredients[id] || { selected: false, quantity: "" };
                const error = fieldErrors["ingredients." + id];
                return (
                  <div key={id} className={"px-4 py-2 " + (v.selected ? "bg-brand-50" : "")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id={"ing-" + id} checked={v.selected} onChange={(e) => setIngredient(id, { selected: e.target.checked })}
                             className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-400" />
                      <label htmlFor={"ing-" + id} className="flex-1 text-sm">{ing.name}</label>
                      <input type="text" inputMode="decimal" value={v.quantity} onChange={(e) => setIngredient(id, { quantity: e.target.value })}
                             aria-label={"Định lượng " + ing.name}
                             className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" placeholder="0" />
                      <span className="w-12 text-xs text-stone-500">{ing.unit}</span>
                    </div>
                    <FieldError message={error} />
                  </div>
                );
              })}
            </div>
          )}
          <FieldError message={fieldErrors.ingredients} />
        </fieldset>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={values.available} onChange={(e) => setValues((v) => ({ ...v, available: e.target.checked }))}
                 className="h-5 w-5 rounded border-stone-300 text-brand-600 focus:ring-brand-400" />
          <span className="font-medium">Còn món (đang phục vụ)</span>
        </label>
        <FieldError message={fieldErrors.available} />

        <div className="flex flex-wrap gap-3 border-t border-stone-100 pt-5">
          <button type="submit" disabled={pending} className="rounded-xl bg-brand-600 px-6 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {pending ? "Đang lưu…" : submitLabel}
          </button>
          <Link to={cancelHref} className="rounded-xl border border-stone-300 px-6 py-2.5 font-semibold hover:bg-stone-100">Hủy</Link>
        </div>
      </form>
    </>
  );
}
