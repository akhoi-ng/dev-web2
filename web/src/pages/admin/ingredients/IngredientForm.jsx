import { useState } from "react";
import { Link } from "react-router-dom";
import FieldError from "../../../components/FieldError.jsx";
import { useSubmit } from "../../../hooks/useSubmit.js";

const input =
  "mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

export const emptyIngredientValues = { name: "", unit: "" };

export const ingredientToValues = (i) => ({ name: i.name, unit: i.unit });

// units: gợi ý đơn vị (từ /api/options); onSubmit(body) -> Promise<{ data }>; onDone(data) khi ok: true
export default function IngredientForm({ initialValues, units, submitLabel, cancelHref, onSubmit, onDone }) {
  const [values, setValues] = useState(initialValues);
  const { pending, fieldErrors, formError, submit } = useSubmit();
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await submit(() => onSubmit(values));
    if (result) onDone(result.data);
  }

  return (
    <>
      {formError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
          <p className="font-semibold">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8">
        <div>
          <label htmlFor="name" className="text-sm font-semibold">Tên nguyên liệu <span className="text-red-500">*</span></label>
          <input id="name" type="text" value={values.name} onChange={set("name")} maxLength={100} required className={input} placeholder="VD: Thăn bò Wagyu" />
          <FieldError message={fieldErrors.name} />
        </div>

        <div>
          <label htmlFor="unit" className="text-sm font-semibold">Đơn vị tính <span className="text-red-500">*</span></label>
          <input id="unit" type="text" value={values.unit} onChange={set("unit")} maxLength={20} required list="unit-options" className={input} placeholder="VD: kg" />
          <datalist id="unit-options">
            {units.map((u) => (
              <option key={u} value={u}></option>
            ))}
          </datalist>
          <p className="mt-1 text-xs text-stone-500">Gợi ý: {units.join(", ")}</p>
          <FieldError message={fieldErrors.unit} />
        </div>

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
