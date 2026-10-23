import { Link } from "react-router-dom";
import { chefsApi, getStats } from "../api/index.js";
import ChefAvatar from "../components/ChefAvatar.jsx";
import DataStatus from "../components/DataStatus.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { formatPhone } from "../lib/format.js";
import { DEFAULT_DISH_IMAGE, RESTAURANT } from "../lib/restaurant.js";

const card = "rounded-3xl border border-[#EADBD2] bg-white";

// icon: các đường SVG viết sẵn tại đây (không phải dữ liệu người dùng)
const REASONS = [
  { title: "Giá rõ ràng", text: "Giá in trên từng món, sắp xếp theo giá chỉ một chạm.",
    icon: (<><path d="M20 12l-8 8-9-9V3h8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle></>) },
  { title: "Biết món nào còn", text: "Món tạm hết được đánh dấu ngay trên thẻ, không gọi nhầm.",
    icon: (<><circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path></>) },
  { title: "Thành phần minh bạch", text: "Mỗi món ghi đủ nguyên liệu và định lượng cho một phần ăn.",
    icon: (<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"></path>) },
  { title: "Đầu bếp phụ trách", text: "Biết món của bạn do ai nấu, từ món Á đến món Ý và bánh ngọt.",
    icon: (<><path d="M6 13a4 4 0 1 1 2-7.5A4 4 0 0 1 16 5.5 4 4 0 1 1 18 13v7H6z"></path><path d="M6 17h12"></path></>) },
];

export default function AboutPage() {
  useDocumentTitle("Về chúng tôi");
  const chefsState = useApiData((signal) => chefsApi.list(undefined, signal), []);
  const stats = useApiData((signal) => getStats(signal), []);
  const dishCount = stats.status === "ok" ? stats.data.dishes : null;

  return (
    <>
      <nav aria-label="Vị trí trang" className="mb-6 flex flex-wrap gap-2 text-sm text-stone-500">
        <Link to="/dishes" className="hover:text-brand-700">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-semibold text-ink">Về chúng tôi</span>
      </nav>

      <DataStatus state={chefsState}>
        {(chefs) => (
          <>
            {/* Giới thiệu */}
            <section className="mb-14 flex flex-wrap items-center gap-10">
              <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
                <span className="self-start rounded-full bg-brand-100 px-3.5 py-1.5 text-sm font-bold text-brand-800">Về {RESTAURANT.name}</span>
                <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Bếp Việt &amp; Âu<br />cho những bữa ăn ấm áp.</h1>
                <p className="max-w-xl text-lg leading-relaxed text-stone-600">
                  {RESTAURANT.name} phục vụ {dishCount !== null ? `${dishCount} món` : "nhiều món"}, từ phở, bún chả đến mỳ Ý và bánh ngọt,
                  do {chefs.length} đầu bếp phụ trách. Chúng tôi muốn việc chọn món dễ như đọc một tờ thực đơn giấy:
                  giá, thành phần và tình trạng từng món đều ghi rõ.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/dishes#thuc-don" className="flex min-h-12 items-center rounded-2xl bg-brand-600 px-6 font-bold text-white hover:bg-brand-700">Xem thực đơn</Link>
                  <Link to="/bookings/new" className="flex min-h-12 items-center rounded-2xl border border-[#D9C3B7] bg-white px-6 font-bold hover:bg-brand-50">Đặt bàn</Link>
                </div>
              </div>
              <img
                src={DEFAULT_DISH_IMAGE}
                alt=""
                aria-hidden="true"
                className="h-72 min-w-0 flex-[1_1_360px] rounded-3xl object-cover sm:h-80"
              />
            </section>

            {/* Vì sao chọn chúng tôi */}
            <section className="mb-14" aria-labelledby="vi-sao">
              <h2 id="vi-sao" className="text-3xl font-extrabold tracking-tight">Gọi món không còn đoán mò</h2>
              <p className="mb-6 mt-2 max-w-2xl text-stone-600">Mọi thông tin bạn cần trước khi gọi món đều có sẵn, rõ ràng như trên tờ thực đơn giấy.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {REASONS.map((r) => (
                  <div key={r.title} className={`flex flex-col gap-2.5 ${card} p-6`}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A2013" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{r.icon}</svg>
                    </span>
                    <h3 className="text-lg font-bold">{r.title}</h3>
                    <p className="text-[15px] leading-relaxed text-stone-600">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Đội ngũ đầu bếp */}
            {chefs.length > 0 && (
              <section className="mb-14" aria-labelledby="dau-bep">
                <h2 id="dau-bep" className="text-3xl font-extrabold tracking-tight">Đội ngũ đầu bếp</h2>
                <p className="mb-6 mt-2 max-w-2xl text-stone-600">Mỗi món trong thực đơn đều có một đầu bếp phụ trách.</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {chefs.map((c) => (
                    <div key={c.id} className={`flex items-center gap-4 ${card} p-5`}>
                      <ChefAvatar chef={c} size="h-16 w-16" textSize="text-xl" />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-lg font-bold">{c.name}</span>
                        <span className="text-sm text-stone-600">{c.specialty}</span>
                        <span className="mt-1 text-sm font-semibold text-brand-700">{c._count.dishes} món phụ trách</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Ghé thăm */}
            <section className="flex flex-wrap items-center justify-between gap-8 rounded-3xl bg-ink p-8 text-white sm:p-12" aria-labelledby="ghe-tham">
              <div className="min-w-0 max-w-xl">
                <h2 id="ghe-tham" className="text-3xl font-extrabold leading-tight tracking-tight">Ghé thăm {RESTAURANT.name}</h2>
                <dl className="mt-5 flex flex-col gap-2 text-[#E9DCD5]">
                  <div className="flex gap-2"><dt className="font-semibold text-white">Địa chỉ:</dt><dd>{RESTAURANT.address}</dd></div>
                  <div className="flex gap-2"><dt className="font-semibold text-white">Hotline:</dt><dd><a href={`tel:${RESTAURANT.phone}`} className="hover:underline">{formatPhone(RESTAURANT.phone)}</a></dd></div>
                  <div className="flex gap-2"><dt className="font-semibold text-white">Mở cửa:</dt><dd>{RESTAURANT.hours} mỗi ngày</dd></div>
                </dl>
              </div>
              <Link to="/bookings/new" className="flex min-h-12 items-center rounded-2xl bg-brand-600 px-7 font-bold text-white hover:bg-brand-700">Đặt bàn ngay</Link>
            </section>
          </>
        )}
      </DataStatus>
    </>
  );
}
