import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { bookingsApi, getOptions } from "../../api/index.js";
import DataStatus from "../../components/DataStatus.jsx";
import FieldError from "../../components/FieldError.jsx";
import { useApiData } from "../../hooks/useApiData.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { useSubmit } from "../../hooks/useSubmit.js";
import { formatPhone } from "../../lib/format.js";
import { RESTAURANT } from "../../lib/restaurant.js";

const field =
  "mt-1.5 min-h-12 w-full rounded-xl border border-[#D9C3B7] bg-white px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";
const label = "text-sm font-semibold";

const emptyValues = { name: "", phone: "", guests: "2", date: "", time: "", note: "" };

// GET /bookings/new — form đặt bàn; gửi POST /api/bookings rồi chuyển sang trang mã đặt bàn
export default function NewBookingPage() {
  useDocumentTitle("Đặt bàn");
  const options = useApiData((signal) => getOptions(signal), []);

  return (
    <>
      <nav aria-label="Vị trí trang" className="mb-6 flex flex-wrap gap-2 text-sm text-stone-500">
        <Link to="/dishes" className="hover:text-brand-700">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-semibold text-ink">Đặt bàn</span>
      </nav>

      <DataStatus state={options}>{(data) => <BookingForm booking={data.booking} />}</DataStatus>
    </>
  );
}

function BookingForm({ booking }) {
  const navigate = useNavigate();
  const [values, setValues] = useState(emptyValues);
  const { pending, fieldErrors, formError, submit } = useSubmit();

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const result = await submit(() =>
      bookingsApi.create({
        name: values.name,
        phone: values.phone,
        guests: Number(values.guests),
        date: values.date,
        time: values.time,
        note: values.note,
      })
    );
    if (result) navigate("/bookings/" + result.data.code);
  }

  const guestOptions = [];
  for (let n = 1; n <= booking.maxGuests; n++) guestOptions.push(n);

  return (
    <>
      {/* Điện thoại: tiêu đề ở trên, form ngay sau, thẻ thông tin xuống cuối */}
      <div className="mb-6 md:hidden">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">Đặt bàn trước, đến là có chỗ.</h1>
        <p className="mt-2 leading-relaxed text-stone-600">Gửi yêu cầu trong một phút. Nhà hàng sẽ gọi lại để xác nhận bàn cho bạn.</p>
      </div>

      <div className="flex flex-wrap items-start gap-6 md:gap-8">
        {/* Thông tin nhà hàng */}
        <aside className="order-last flex min-w-0 flex-[1_1_300px] flex-col gap-6 rounded-3xl bg-brand-600 p-6 text-white sm:p-8 md:order-first">
          <div className="hidden md:block">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Đặt bàn trước,<br />đến là có chỗ.</h1>
            <p className="mt-3 leading-relaxed text-[#FFE9E1]">Gửi yêu cầu trong một phút. Nhà hàng sẽ gọi lại để xác nhận bàn cho bạn.</p>
          </div>

          <dl className="flex flex-col gap-4 rounded-2xl bg-white p-5 text-ink">
            <div className="flex items-start gap-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9A2816" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path></svg>
              <div>
                <dt className="text-sm text-stone-500">Hotline</dt>
                <dd><a href={"tel:" + RESTAURANT.phone} className="text-xl font-extrabold hover:text-brand-700">{formatPhone(RESTAURANT.phone)}</a></dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9A2816" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <div>
                <dt className="text-sm text-stone-500">Địa chỉ</dt>
                <dd className="font-semibold">{RESTAURANT.address}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9A2816" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
              <div>
                <dt className="text-sm text-stone-500">Giờ mở cửa</dt>
                <dd className="font-semibold">{RESTAURANT.hours} mỗi ngày</dd>
              </div>
            </div>
          </dl>

          <p className="text-sm leading-relaxed text-[#FFE9E1]">Nhóm trên {booking.maxGuests} người, vui lòng gọi hotline để nhà hàng sắp xếp chỗ.</p>
        </aside>

        {/* Form đặt bàn */}
        <div className="min-w-0 flex-[2_1_480px]">
          {formError && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
              <p className="font-semibold">{formError}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-3xl border border-[#EADBD2] bg-white p-5 sm:p-8">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Thông tin đặt bàn</h2>
              <p className="mt-1 text-sm text-stone-500">Các ô có dấu <span className="text-brand-700">*</span> là bắt buộc.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className={label}>Họ tên <span className="text-brand-700">*</span></label>
                <input id="name" name="name" type="text" value={values.name} onChange={set("name")} maxLength={100} required autoComplete="name"
                       placeholder="Nguyễn Văn A" className={field} aria-invalid={Boolean(fieldErrors.name)} />
                <FieldError message={fieldErrors.name} />
              </div>

              <div>
                <label htmlFor="phone" className={label}>Số điện thoại <span className="text-brand-700">*</span></label>
                <input id="phone" name="phone" type="tel" value={values.phone} onChange={set("phone")} required autoComplete="tel" inputMode="tel"
                       placeholder="0123 456 789" className={field} aria-invalid={Boolean(fieldErrors.phone)} />
                <p className="mt-1 text-xs text-stone-500">Nhà hàng gọi số này để xác nhận.</p>
                <FieldError message={fieldErrors.phone} />
              </div>

              <div>
                <label htmlFor="guests" className={label}>Số khách <span className="text-brand-700">*</span></label>
                <select id="guests" name="guests" value={values.guests} onChange={set("guests")} className={field}>
                  {guestOptions.map((n) => (
                    <option key={n} value={String(n)}>{n} người</option>
                  ))}
                </select>
                <FieldError message={fieldErrors.guests} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="date" className={label}>Ngày đến <span className="text-brand-700">*</span></label>
                <input id="date" name="date" type="date" value={values.date} onChange={set("date")} min={booking.minDate} max={booking.maxDate} required
                       className={field + " sm:max-w-xs"} aria-invalid={Boolean(fieldErrors.date)} />
                <FieldError message={fieldErrors.date} />
              </div>
            </div>

            <fieldset>
              <legend className={label}>Giờ đến <span className="text-brand-700">*</span></legend>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {booking.slots.map((t) => (
                  <label key={t} className="cursor-pointer">
                    <input type="radio" name="time" value={t} className="peer sr-only" checked={values.time === t} onChange={set("time")} required />
                    <span className="flex min-h-11 items-center justify-center rounded-xl border border-[#D9C3B7] bg-white text-[15px] font-semibold transition hover:border-brand-400 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-saffron">{t}</span>
                  </label>
                ))}
              </div>
              <FieldError message={fieldErrors.time} />
            </fieldset>

            <div>
              <label htmlFor="note" className={label}>Ghi chú</label>
              <textarea id="note" name="note" rows={3} maxLength={500} value={values.note} onChange={set("note")}
                        placeholder="VD: có trẻ nhỏ, cần ghế em bé, muốn ngồi gần cửa sổ…"
                        className="mt-1.5 w-full rounded-xl border border-[#D9C3B7] px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"></textarea>
              <FieldError message={fieldErrors.note} />
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-[#F3E8E1] pt-6">
              <button type="submit" disabled={pending} className="min-h-12 w-full rounded-2xl bg-brand-600 px-8 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto">
                {pending ? "Đang gửi…" : "Gửi yêu cầu đặt bàn"}
              </button>
              <Link to="/dishes" className="font-semibold text-stone-600 hover:text-brand-700">Quay lại thực đơn</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
