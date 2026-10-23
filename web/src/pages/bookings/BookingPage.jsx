import { Link, useParams } from "react-router-dom";
import { bookingsApi, getOptions } from "../../api/index.js";
import DataStatus from "../../components/DataStatus.jsx";
import { useApiData } from "../../hooks/useApiData.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDateTime, formatPhone } from "../../lib/format.js";
import { RESTAURANT } from "../../lib/restaurant.js";

// GET /bookings/:code — xác nhận đã nhận yêu cầu (tải lại theo mã trong URL)
export default function BookingPage() {
  useDocumentTitle("Đã nhận yêu cầu đặt bàn");
  const { code } = useParams();
  const state = useApiData(
    async (signal) => {
      const [booking, options] = await Promise.all([bookingsApi.get(code, signal), getOptions(signal)]);
      return { data: { booking: booking.data, statuses: options.data.booking.statuses } };
    },
    [code]
  );

  return (
    <DataStatus state={state} notFoundText="Không tìm thấy yêu cầu đặt bàn với mã này.">
      {({ booking, statuses }) => (
        <div className="mx-auto max-w-xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E3EFE7]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1E5233" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">Đã nhận yêu cầu đặt bàn</h1>
            <p className="text-stone-600">Nhà hàng sẽ gọi số <strong className="text-ink">{formatPhone(booking.phone)}</strong> để xác nhận. Lưu lại trang này để xem lại yêu cầu.</p>
          </div>

          <dl className="mt-8 divide-y divide-[#F3E8E1] rounded-3xl border border-[#EADBD2] bg-white px-6">
            <div className="flex justify-between gap-4 py-4"><dt className="text-stone-500">Mã đặt bàn</dt><dd className="font-mono text-lg font-bold tracking-wider">{booking.code.toUpperCase()}</dd></div>
            <div className="flex justify-between gap-4 py-4"><dt className="text-stone-500">Trạng thái</dt><dd className="font-semibold">{statuses[booking.status] || booking.status}</dd></div>
            <div className="flex justify-between gap-4 py-4"><dt className="text-stone-500">Thời gian</dt><dd className="text-right font-semibold">{formatDateTime(booking.bookedAt)}</dd></div>
            <div className="flex justify-between gap-4 py-4"><dt className="text-stone-500">Số khách</dt><dd className="font-semibold">{booking.guests} người</dd></div>
            <div className="flex justify-between gap-4 py-4"><dt className="text-stone-500">Họ tên</dt><dd className="text-right font-semibold">{booking.name}</dd></div>
            {booking.note && (
              <div className="flex flex-col gap-1 py-4"><dt className="text-stone-500">Ghi chú</dt><dd className="whitespace-pre-line">{booking.note}</dd></div>
            )}
          </dl>

          <p className="mt-6 text-center text-sm text-stone-500">
            Cần đổi giờ hoặc hủy? Gọi <a href={"tel:" + RESTAURANT.phone} className="font-semibold text-brand-700 hover:underline">{formatPhone(RESTAURANT.phone)}</a> · {RESTAURANT.address}
          </p>

          <div className="mt-8 flex justify-center">
            <Link to="/dishes#thuc-don" className="rounded-2xl bg-ink px-6 py-3 font-bold text-white hover:bg-stone-700">Xem thực đơn trong lúc chờ</Link>
          </div>
        </div>
      )}
    </DataStatus>
  );
}
