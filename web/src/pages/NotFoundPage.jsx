import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-stone-500">Trang hoặc bản ghi bạn tìm không tồn tại, có thể đã bị xóa hoặc đường dẫn không đúng.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/dishes" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Về thực đơn</Link>
        <Link to="/admin/dishes" className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold hover:bg-stone-100">Về trang quản trị</Link>
      </div>
    </div>
  );
}
