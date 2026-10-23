import { Link, useParams } from "react-router-dom";
import { dishesApi } from "../api/index.js";
import ChefAvatar from "../components/ChefAvatar.jsx";
import DataStatus from "../components/DataStatus.jsx";
import DishImage from "../components/DishImage.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { formatPrice, formatQty } from "../lib/format.js";

export default function DishPage() {
  const { id } = useParams();
  const state = useApiData((signal) => dishesApi.get(id, signal), [id]);

  useDocumentTitle(
    state.status === "ok" ? state.data.name : state.status === "notFound" ? "Không tìm thấy món ăn" : "Món ăn",
  );

  return (
    <DataStatus state={state} notFoundText="Không tìm thấy món ăn">
      {(dish) => (
        <>
          <nav aria-label="Vị trí trang" className="mb-6 flex flex-wrap gap-2 text-sm text-stone-500">
            <Link to="/dishes#thuc-don" className="hover:text-brand-700">Thực đơn</Link>
            {dish.category && (
              <>
                <span aria-hidden="true">/</span>
                <Link to={`/dishes?category=${encodeURIComponent(dish.category)}#thuc-don`} className="hover:text-brand-700">{dish.category}</Link>
              </>
            )}
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="font-semibold text-ink">{dish.name}</span>
          </nav>

          <article className="flex flex-wrap items-start gap-10">
            <div className="min-w-0 flex-[1_1_480px]">
              <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-brand-50">
                <DishImage
                  src={dish.imageUrl}
                  alt={dish.name}
                  className={`h-full w-full object-cover ${dish.available ? "" : "grayscale"}`}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {dish.category && (
                  <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">{dish.category}</span>
                )}
                {dish.available ? (
                  <span className="rounded-full bg-[#E3EFE7] px-3 py-1 text-xs font-bold text-[#1E5233]">Còn món</span>
                ) : (
                  <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">Tạm hết món</span>
                )}
              </div>

              <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{dish.name}</h1>
              <p className="text-3xl font-extrabold text-brand-700">{formatPrice(dish.price)}</p>
              <p className="text-lg leading-relaxed text-stone-700">{dish.description || "Chưa có mô tả cho món ăn này."}</p>

              <div className="flex items-center gap-3.5 rounded-2xl border border-[#EADBD2] bg-white p-4">
                <ChefAvatar chef={dish.chef || { name: "?" }} size="h-[52px] w-[52px]" textSize="text-lg" />
                <div className="flex flex-col">
                  <span className="text-sm text-stone-500">Đầu bếp phụ trách</span>
                  {dish.chef ? (
                    <>
                      <span className="text-lg font-bold">{dish.chef.name}</span>
                      <span className="text-sm text-stone-500">{dish.chef.specialty}</span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-stone-500">Chưa phân công</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link to="/bookings/new" className="flex min-h-12 flex-[1_1_200px] items-center justify-center rounded-2xl bg-brand-600 px-5 font-bold text-white hover:bg-brand-700">Đặt bàn để thưởng thức</Link>
                <Link to="/dishes#thuc-don" className="flex min-h-12 flex-[1_1_160px] items-center justify-center rounded-2xl border border-[#D9C3B7] bg-white px-5 font-bold hover:bg-brand-50">← Quay lại thực đơn</Link>
              </div>
            </div>
          </article>

          {dish.ingredients.length > 0 && (
            <section className="mt-12 max-w-3xl rounded-3xl border border-[#EADBD2] bg-white p-7">
              <h2 className="text-xl font-extrabold">Thành phần cho 1 phần ăn</h2>
              <p className="mb-4 mt-1 text-sm text-stone-500">Định lượng theo đơn vị của từng nguyên liệu.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#EADBD2] text-sm text-stone-500">
                      <th scope="col" className="py-2.5 font-semibold">Nguyên liệu</th>
                      <th scope="col" className="py-2.5 text-right font-semibold">Định lượng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dish.ingredients.map((di) => (
                      <tr key={di.ingredientId} className="border-b border-[#F3E8E1] last:border-0">
                        <td className="py-3.5">{di.ingredient.name}</td>
                        <td className="py-3.5 text-right font-semibold">{formatQty(di.quantity)} {di.ingredient.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </DataStatus>
  );
}
