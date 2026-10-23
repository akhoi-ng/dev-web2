import { useEffect, useState } from "react";
import DishImage from "../../components/DishImage.jsx";
import { formatPrice } from "../../lib/format.js";
import { RESTAURANT } from "../../lib/restaurant.js";
import InlineError from "./InlineError.jsx";

function Stat({ label, value }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-3xl font-extrabold">{value}</dd>
    </div>
  );
}

// q: từ khoá đang áp dụng (từ URL); onSearch(value) được gọi khi gửi form tìm kiếm
export default function MenuHero({ q, onSearch, stats }) {
  const [input, setInput] = useState(q);

  // URL là nguồn sự thật: khi q trên URL đổi (Xóa bộ lọc, Back/Forward) thì ô nhập theo
  useEffect(() => {
    setInput(q);
  }, [q]);

  const submit = (e) => {
    e.preventDefault();
    onSearch(input.trim());
  };

  const data = stats.status === "ok" ? stats.data : null;
  const heroImages = data ? data.tiles.filter((t) => t.imageUrl).slice(0, 3) : [];

  return (
    <section className="mb-12 flex flex-wrap items-center gap-10">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
        <span className="self-start rounded-full bg-brand-100 px-3.5 py-1.5 text-sm font-bold text-brand-800">Mở cửa {RESTAURANT.hours} mỗi ngày</span>
        <h1 className="text-[2.5rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Bữa ngon ấm áp,<br />gọi món thật dễ.</h1>
        <p className="max-w-lg text-lg leading-relaxed text-stone-600">Xem giá, thành phần và tình trạng từng món ngay trên điện thoại. Chọn xong rồi đến, khỏi phải chờ đợi.</p>

        <form onSubmit={submit} role="search" className="flex max-w-xl gap-2 rounded-2xl border border-[#EADBD2] bg-white p-1.5">
          <label htmlFor="q" className="sr-only">Tìm món ăn</label>
          <input
            id="q"
            type="search"
            name="q"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tìm món: phở, bún chả, tiramisu…"
            className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3.5 py-3 text-base placeholder-stone-400 focus:ring-0"
          />
          <button type="submit" className="min-h-12 rounded-xl bg-brand-600 px-6 font-bold text-white hover:bg-brand-700">Tìm</button>
        </form>

        {data && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
            <Stat label="món ăn" value={data.dishes} />
            <Stat label="danh mục" value={data.categories} />
            <Stat label="đầu bếp" value={data.chefs} />
            {data.minPrice !== null && <Stat label="giá từ" value={formatPrice(data.minPrice)} />}
          </dl>
        )}
        {stats.status === "error" && <InlineError text="Không tải được số liệu thực đơn." onRetry={stats.retry} />}
      </div>

      {heroImages.length === 3 && (
        <div className="hidden min-w-0 flex-[1_1_380px] grid-cols-2 gap-3 sm:grid" aria-hidden="true">
          <DishImage src={heroImages[0].imageUrl} alt="" className="row-span-2 h-full min-h-[340px] w-full rounded-3xl object-cover" />
          <DishImage src={heroImages[1].imageUrl} alt="" className="h-40 w-full rounded-3xl object-cover sm:h-44" />
          <DishImage src={heroImages[2].imageUrl} alt="" className="h-40 w-full rounded-3xl object-cover sm:h-44" />
        </div>
      )}
    </section>
  );
}
