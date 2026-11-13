import SearchForm from "../../components/SearchForm.jsx";
import DishImage from "../../components/DishImage.jsx";
import { formatPrice } from "../../lib/format.js";
import { RESTAURANT } from "../../lib/restaurant.js";
import InlineError from "./InlineError.jsx";

// Khi chưa tải được danh sách kiểu tìm kiếm từ API, vẫn tìm được theo kiểu cơ bản
const FALLBACK_MODES = [{ key: "basic", label: "Cơ bản" }];

function Stat({ label, value }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-3xl font-extrabold">{value}</dd>
    </div>
  );
}

// criteria: tiêu chí đang áp dụng (từ URL); onSearch(next) được gọi khi gửi form tìm kiếm
export default function MenuHero({ criteria, modes, onSearch, stats }) {
  const data = stats.status === "ok" ? stats.data : null;
  const heroImages = data ? data.tiles.filter((t) => t.imageUrl).slice(0, 3) : [];

  return (
    <section className="mb-12 flex flex-wrap items-center gap-10">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
        <span className="self-start rounded-full bg-brand-100 px-3.5 py-1.5 text-sm font-bold text-brand-800">Mở cửa {RESTAURANT.hours} mỗi ngày</span>
        <h1 className="text-[2.5rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Bữa ngon ấm áp,<br />gọi món thật dễ.</h1>
        <p className="max-w-lg text-lg leading-relaxed text-stone-600">Xem giá, thành phần và tình trạng từng món ngay trên điện thoại. Chọn xong rồi đến, khỏi phải chờ đợi.</p>

        <div className="max-w-2xl">
          <SearchForm criteria={criteria} modes={modes || FALLBACK_MODES} onSubmit={onSearch} idPrefix="menu-search" />
        </div>

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
