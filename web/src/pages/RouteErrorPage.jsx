import { Link } from "react-router-dom";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

// Nội dung trang lỗi chung (lỗi không mong muốn khi hiển thị trang).
export default function RouteErrorPage() {
  useDocumentTitle("Lỗi hệ thống");
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <p className="text-7xl font-extrabold text-red-500">500</p>
      <h1 className="mt-4 text-2xl font-bold">Đã xảy ra lỗi hệ thống, vui lòng thử lại sau</h1>
      <p className="mt-2 text-stone-500">Trang này gặp sự cố khi hiển thị. Bạn có thể quay về thực đơn hoặc thử tải lại trang.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/dishes" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Về thực đơn</Link>
        <Link to="/admin/dishes" className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold hover:bg-stone-100">Về trang quản trị</Link>
      </div>
    </div>
  );
}

// Dùng cho errorElement ở route gốc: lỗi ở chính Layout nên không còn header/footer.
export function RootErrorPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <RouteErrorPage />
    </main>
  );
}
