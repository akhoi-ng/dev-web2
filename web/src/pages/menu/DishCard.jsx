import { Link } from "react-router-dom";
import DishImage from "../../components/DishImage.jsx";
import { formatPrice } from "../../lib/format.js";

export default function DishCard({ dish: d }) {
  return (
    <Link
      to={`/dishes/${d.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-[#EADBD2] bg-white transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-50">
        <DishImage
          src={d.imageUrl}
          alt={d.name}
          className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${d.available ? "" : "grayscale"}`}
        />
        {d.category && (
          <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-bold">{d.category}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-lg font-bold leading-snug group-hover:text-brand-700">{d.name}</h3>
        {d.chef && <p className="text-sm text-stone-500">Đầu bếp {d.chef.name}</p>}
        {d.description && <p className="line-clamp-2 text-sm text-stone-500">{d.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-xl font-extrabold text-brand-700">{formatPrice(d.price)}</span>
          {d.available ? (
            <span className="rounded-full bg-[#E3EFE7] px-2.5 py-1 text-xs font-bold text-[#1E5233]">Còn món</span>
          ) : (
            <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">Tạm hết</span>
          )}
        </div>
      </div>
    </Link>
  );
}
