import { Link, useSearchParams } from "react-router-dom";
import { adminBookingsApi, getOptions } from "../../../api/index.js";
import DataStatus from "../../../components/DataStatus.jsx";
import { useApiData } from "../../../hooks/useApiData.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useSubmit } from "../../../hooks/useSubmit.js";
import { formatDateTime, formatPhone } from "../../../lib/format.js";

const badge = {
  pending: "bg-saffron/25 text-[#6B4410]",
  confirmed: "bg-[#E3EFE7] text-[#1E5233]",
  cancelled: "bg-stone-200 text-stone-600",
};
// Nút đổi trạng thái hiện cho mỗi trạng thái hiện tại
const actions = {
  pending: [
    { to: "confirmed", label: "Xác nhận", cls: "bg-brand-600 text-white hover:bg-brand-700" },
    { to: "cancelled", label: "Hủy", cls: "text-stone-600 hover:bg-stone-100" },
  ],
  confirmed: [{ to: "cancelled", label: "Hủy", cls: "text-stone-600 hover:bg-stone-100" }],
  cancelled: [{ to: "pending", label: "Mở lại", cls: "text-brand-700 hover:bg-brand-50" }],
};

// GET /admin/bookings?show=all — danh sách yêu cầu đặt bàn, đổi trạng thái bằng PATCH
export default function AdminBookingsPage() {
  useDocumentTitle("Đặt bàn");
  const [searchParams] = useSearchParams();
  const showAll = searchParams.get("show") === "all";
  const state = useApiData(
    async (signal) => {
      const [list, options] = await Promise.all([
        adminBookingsApi.list({ show: showAll ? "all" : undefined }, signal),
        getOptions(signal),
      ]);
      return { data: { bookings: list.data, statuses: options.data.booking.statuses } };
    },
    [showAll]
  );
  const { pending, formError, submit } = useSubmit();

  async function changeStatus(id, status) {
    const result = await submit(() => adminBookingsApi.update(id, { status }));
    if (result) state.retry();
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Đặt bàn</h1>
          {state.status === "ok" && (
            <p className="mt-1 text-stone-500">{state.data.bookings.length} yêu cầu {showAll ? "(tất cả)" : "từ hôm nay trở đi"}</p>
          )}
        </div>
        <Link to={showAll ? "/admin/bookings" : "/admin/bookings?show=all"} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-100">
          {showAll ? "Chỉ hiện lịch sắp tới" : "Hiện cả lịch đã qua"}
        </Link>
      </div>

      {formError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
          <p className="font-semibold">{formError}</p>
        </div>
      )}

      <DataStatus state={state}>
        {({ bookings, statuses }) => (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <table className="rtable w-full text-left text-sm md:min-w-[860px]">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Khách</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3 text-center">Số người</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {bookings.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">Chưa có yêu cầu đặt bàn nào.</td></tr>
                )}
                {bookings.map((b) => (
                  <tr key={b.id} className={"hover:bg-cream " + (b.status === "cancelled" ? "text-stone-400" : "")}>
                    <td className="rt-title px-4 py-3 font-semibold md:whitespace-nowrap">{formatDateTime(b.bookedAt)}</td>
                    <td className="px-4 py-3" data-label="Khách"><span>{b.name}<span className="block font-mono text-xs text-stone-400">{b.code.toUpperCase()}</span></span></td>
                    <td className="whitespace-nowrap px-4 py-3" data-label="Điện thoại"><a href={"tel:" + b.phone} className="font-semibold text-brand-700 hover:underline md:font-normal md:text-ink">{formatPhone(b.phone)}</a></td>
                    <td className="px-4 py-3 md:text-center" data-label="Số người">{b.guests}</td>
                    <td className="px-4 py-3 text-stone-600 md:max-w-[220px]" data-label="Ghi chú">{b.note || "—"}</td>
                    <td className="px-4 py-3" data-label="Trạng thái"><span className={"whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " + (badge[b.status] || "")}>{statuses[b.status] || b.status}</span></td>
                    <td className="rt-actions whitespace-nowrap px-4 py-3 text-right">
                      {(actions[b.status] || []).map((a) => (
                        <button key={a.to} type="button" disabled={pending} onClick={() => changeStatus(b.id, a.to)}
                                className={"rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60 " + a.cls}>
                          {a.label}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataStatus>
    </>
  );
}
