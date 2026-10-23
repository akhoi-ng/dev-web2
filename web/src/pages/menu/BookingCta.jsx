import { Link } from "react-router-dom";
import { RESTAURANT } from "../../lib/restaurant.js";
import { formatPhone } from "../../lib/format.js";

export default function BookingCta() {
  return (
    <section id="dat-ban" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-8 rounded-3xl bg-brand-600 p-8 text-white sm:p-12">
      <div className="min-w-0 max-w-xl">
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Đặt bàn trước,<br />đến là có chỗ.</h2>
        <p className="mt-3 text-lg leading-relaxed text-[#FFE9E1]">Gửi yêu cầu trong một phút, nhà hàng gọi lại xác nhận. Khỏi phải chờ khi đến nơi.</p>
        <Link to="/bookings/new" className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-white px-7 text-base font-bold text-brand-700 hover:bg-brand-50">Đặt bàn ngay</Link>
      </div>
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white p-6 text-ink">
        <span className="text-sm font-semibold text-stone-500">Hoặc gọi hotline</span>
        <a href={`tel:${RESTAURANT.phone}`} className="text-2xl font-extrabold hover:text-brand-700">{formatPhone(RESTAURANT.phone)}</a>
        <span className="text-sm text-stone-600">{RESTAURANT.address}</span>
        <span className="text-sm text-stone-600">Mở cửa {RESTAURANT.hours}</span>
      </div>
    </section>
  );
}
