import { Link } from "react-router-dom";
import DishImage from "../../components/DishImage.jsx";
import InlineError from "./InlineError.jsx";

const card = "rounded-3xl border border-[#EADBD2] bg-white";

// hrefFor(category) -> đường dẫn lọc theo danh mục (giữ từ khoá + sắp xếp)
export default function CategoryTiles({ stats, hrefFor }) {
  return (
    <section className="mb-14" aria-labelledby="danh-muc">
      <h2 id="danh-muc" className="mb-4 text-2xl font-extrabold tracking-tight">Hôm nay bạn muốn ăn gì?</h2>
      {stats.status === "error" && <InlineError text="Không tải được danh mục." onRetry={stats.retry} />}
      {stats.status === "ok" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.data.tiles.map((t) => (
            <Link
              key={t.name}
              to={hrefFor(t.name)}
              className={`group flex flex-col gap-2.5 ${card} p-3 transition hover:border-brand-300 hover:shadow-md`}
            >
              <span className="block h-24 overflow-hidden rounded-2xl bg-brand-50 sm:h-28">
                {t.imageUrl && (
                  <DishImage
                    src={t.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                )}
              </span>
              <span className="flex items-baseline justify-between gap-2 px-1">
                <span className="font-bold group-hover:text-brand-700">{t.name}</span>
                <span className="text-sm text-stone-500">{t.count} món</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
