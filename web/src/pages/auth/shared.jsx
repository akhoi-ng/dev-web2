import { ApiError } from "../../api/client.js";

export const field =
  "mt-1.5 min-h-12 w-full rounded-xl border border-[#D9C3B7] bg-white px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 aria-[invalid=true]:border-brand-600";
export const label = "text-sm font-semibold";
export const primaryBtn =
  "min-h-12 w-full rounded-2xl bg-brand-600 px-8 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60";
export const linkCls = "font-semibold text-brand-700 hover:underline";

// Khung chung của các trang xác thực: thẻ trắng ở giữa, tiêu đề, mô tả
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-8">
      <div className="rounded-3xl border border-[#EADBD2] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 leading-relaxed text-stone-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-stone-600">{footer}</div>}
    </div>
  );
}

// Hộp thông báo: tone "error" | "info" | "ok". data-code giúp đọc mã lỗi khi chụp bằng chứng.
export function Notice({ tone = "error", code, children }) {
  if (!children) return null;
  const styles = {
    error: "border-brand-200 bg-brand-50 text-brand-800",
    info: "border-[#F2D9A6] bg-[#FFF6E5] text-[#6B4A0E]",
    ok: "border-[#BFDCC8] bg-[#E3EFE7] text-[#1E5233]",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} data-code={code || undefined} className={`mb-5 rounded-2xl border px-4 py-3 text-[15px] leading-relaxed ${styles[tone]}`}>
      {children}
    </div>
  );
}

const minutes = (sec) => Math.max(1, Math.ceil(Number(sec || 60) / 60));

// Lỗi từ lớp gọi API -> { message, code }. Lỗi nghiệp vụ dùng thông báo của server (tiếng Việt).
export function describeError(error) {
  if (!(error instanceof ApiError)) return { message: "Đã có lỗi xảy ra, vui lòng thử lại.", code: null };
  if (error.kind === "network") return { message: "Không kết nối được máy chủ, vui lòng thử lại.", code: "NETWORK" };
  if (error.kind === "business") {
    if (error.code === "VALIDATION_FAILED") return { message: "Vui lòng kiểm tra lại các ô được đánh dấu.", code: error.code };
    return { message: error.message || error.code, code: error.code };
  }
  if (error.status === 429) {
    return { message: `${error.message || "Bạn đã thử quá nhiều lần"}. Vui lòng thử lại sau khoảng ${minutes(error.retryAfterSec)} phút.`, code: "RATE_LIMITED" };
  }
  if (error.status === 503) return { message: error.message || "Dịch vụ tạm thời không sẵn sàng, vui lòng thử lại.", code: "CAPTCHA_UNAVAILABLE" };
  return { message: "Máy chủ đang gặp lỗi, vui lòng thử lại sau.", code: error.code || `HTTP_${error.status}` };
}

export const isCaptchaError = (error) =>
  error instanceof ApiError && (error.code === "CAPTCHA_REQUIRED" || error.code === "INVALID_CAPTCHA");
