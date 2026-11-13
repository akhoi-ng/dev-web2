import { useEffect, useRef } from "react";
import { LoadingState } from "../../components/DataStatus.jsx";
import DishCard from "./DishCard.jsx";
import InlineError from "./InlineError.jsx";

/*
 * Lưới món tích lũy cho hai kiểu "Tải thêm" (view = "more") và "Cuộn vô hạn" (view = "scroll").
 * list: kết quả của useLoadMore. Trang lỗi giữa chừng hiện "Thử lại" dưới lưới, giữ món đã tải.
 */
export default function LoadMoreList({ list, view, empty }) {
  const sentinelRef = useRef(null);
  const { items, total, pending, end, error, loadNext, retry } = list;

  // Cuộn vô hạn: sentinel đặt sau lưới; gần tới (200px) thì tải tiếp, loadNext tự kiểm tra pending/end
  useEffect(() => {
    if (view !== "scroll" || !sentinelRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [view, loadNext, items.length]);

  if (items.length === 0) {
    if (error) return <InlineError text="Không tải được thực đơn." onRetry={retry} />;
    if (pending || total === null) return <LoadingState />;
    return empty;
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((d) => (
          <DishCard key={d.id} dish={d} />
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        {error ? (
          <InlineError text="Không tải được phần tiếp theo." onRetry={retry} />
        ) : end ? (
          <p className="text-[15px] text-stone-500">Đã hiện hết {total} món.</p>
        ) : view === "more" ? (
          <button
            type="button"
            onClick={loadNext}
            disabled={pending}
            className="min-h-11 rounded-xl border border-[#EADBD2] bg-white px-6 font-semibold hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
          >
            {pending ? "Đang tải..." : `Tải thêm (${items.length}/${total})`}
          </button>
        ) : (
          pending && <LoadingState />
        )}
        {view === "scroll" && !end && !error && <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />}
      </div>
    </>
  );
}
