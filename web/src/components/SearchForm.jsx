import { useEffect, useState } from "react";

const field =
  "min-h-11 w-full rounded-xl border border-[#EADBD2] bg-white px-3 py-2 text-[15px] focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const label = "mb-1 block text-sm font-semibold text-stone-500";

/*
 * Form tìm kiếm món dùng chung cho thực đơn và trang quản lý.
 *  - criteria: tiêu chí đang áp dụng (đọc từ URL); ô nhập đồng bộ lại khi URL đổi (Back/Forward, Xóa bộ lọc)
 *  - modes: [{ key, label }] từ GET /api/options
 *  - onSubmit(next): tiêu chí mới (cùng khóa với criteria); trang tự ghi lên URL và về trang đầu
 * Chọn "Nâng cao" mở thêm khoảng giá, tình trạng, nguyên liệu.
 */
export default function SearchForm({ criteria, modes, onSubmit, placeholder = "Tìm món: phở, bún chả, tiramisu…", idPrefix = "search" }) {
  const [draft, setDraft] = useState(criteria);

  useEffect(() => {
    setDraft(criteria);
    // criteria là object mới mỗi lần render: so theo nội dung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(criteria)]);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const advanced = draft.mode === "advanced";
  const id = (name) => `${idPrefix}-${name}`;

  const submit = (e) => {
    e.preventDefault();
    const next = { ...draft };
    for (const key of ["q", "minPrice", "maxPrice", "ingredient"]) next[key] = (next[key] || "").trim();
    onSubmit(next);
  };

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-3 rounded-2xl border border-[#EADBD2] bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={id("q")} className="sr-only">Từ khóa</label>
        <input
          id={id("q")}
          type="search"
          value={draft.q}
          onChange={set("q")}
          maxLength={100}
          placeholder={placeholder}
          className="min-h-12 min-w-0 flex-[1_1_220px] rounded-xl border-0 bg-cream px-3.5 text-base placeholder-stone-400 focus:ring-2 focus:ring-brand-200"
        />
        <label htmlFor={id("mode")} className="sr-only">Kiểu tìm kiếm</label>
        <select
          id={id("mode")}
          value={draft.mode}
          onChange={set("mode")}
          className="min-h-12 rounded-xl border border-[#EADBD2] bg-white py-2 pl-3 pr-8 text-[15px] font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        >
          {modes.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <button type="submit" className="min-h-12 rounded-xl bg-brand-600 px-6 font-bold text-white hover:bg-brand-700">Tìm</button>
      </div>

      {advanced && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={id("minPrice")} className={label}>Giá từ (đ)</label>
            <input id={id("minPrice")} type="number" min="0" step="1000" inputMode="numeric" value={draft.minPrice} onChange={set("minPrice")} className={field} />
          </div>
          <div>
            <label htmlFor={id("maxPrice")} className={label}>Giá đến (đ)</label>
            <input id={id("maxPrice")} type="number" min="0" step="1000" inputMode="numeric" value={draft.maxPrice} onChange={set("maxPrice")} className={field} />
          </div>
          <div>
            <label htmlFor={id("available")} className={label}>Tình trạng</label>
            <select id={id("available")} value={draft.available} onChange={set("available")} className={field}>
              <option value="">Tất cả</option>
              <option value="true">Còn món</option>
              <option value="false">Tạm hết</option>
            </select>
          </div>
          <div>
            <label htmlFor={id("ingredient")} className={label}>Nguyên liệu</label>
            <input id={id("ingredient")} type="text" value={draft.ingredient} onChange={set("ingredient")} placeholder="tôm, nấm…" className={field} />
          </div>
        </div>
      )}
    </form>
  );
}
