// Lỗi nhỏ cho một khối dữ liệu phụ (thống kê, danh mục...) — không chặn cả trang.
export default function InlineError({ text, onRetry }) {
  return (
    <p className="text-sm text-stone-500" role="alert">
      {text}{" "}
      <button type="button" onClick={onRetry} className="font-semibold text-brand-700 hover:underline">Thử lại</button>
    </p>
  );
}
