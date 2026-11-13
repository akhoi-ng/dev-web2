import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";

// Tiêu chí trên URL bị API từ chối (VALIDATION_FAILED), ví dụ khi sửa tay ?minPrice=abc
export function isSearchError(error) {
  return error instanceof ApiError && error.kind === "business" && error.code === "VALIDATION_FAILED";
}

export default function SearchError({ error, clearHref }) {
  const messages = Object.values(error.fields || {});
  return (
    <div className="rounded-3xl border border-dashed border-[#D9C3B7] bg-white p-8 text-center" role="alert">
      <p className="text-lg font-bold">Điều kiện tìm kiếm không hợp lệ</p>
      <ul className="mt-2 text-stone-500">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <Link to={clearHref} className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Xóa bộ lọc</Link>
    </div>
  );
}
