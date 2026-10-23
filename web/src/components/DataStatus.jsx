import { Link } from "react-router-dom";

export function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-500" role="status" aria-live="polite">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
        aria-hidden="true"
      ></span>
      <span>Đang tải...</span>
    </div>
  );
}

export function ErrorState({ onRetry }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <h2 className="text-xl font-bold">Không tải được dữ liệu</h2>
      <p className="mt-2 text-stone-500">Đã có lỗi xảy ra hoặc không kết nối được máy chủ. Vui lòng thử lại.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 min-h-11 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Thử lại
      </button>
    </div>
  );
}

export function NotFoundPanel({ text = "Trang hoặc bản ghi bạn tìm không tồn tại, có thể đã bị xóa hoặc đường dẫn không đúng." }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">Không tìm thấy</h1>
      <p className="mt-2 text-stone-500">{text}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/dishes" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Về thực đơn</Link>
        <Link to="/admin/dishes" className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold hover:bg-stone-100">Về trang quản trị</Link>
      </div>
    </div>
  );
}

// state: kết quả của useApiData; children(data, meta) chỉ được gọi khi status === "ok"
export default function DataStatus({ state, notFoundText, children }) {
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState onRetry={state.retry} />;
  if (state.status === "notFound") return <NotFoundPanel text={notFoundText} />;
  return children(state.data, state.meta);
}
