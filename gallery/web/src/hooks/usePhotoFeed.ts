import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, qs, type Page, type Photo } from "../lib/api";

export interface FeedParams {
  q?: string;
  album?: string;
  tag?: string;
  status?: string;
}

/** Danh sách ảnh phân trang theo con trỏ; đổi bộ lọc thì tải lại từ đầu. */
export function usePhotoFeed(endpoint: "/api/photos" | "/api/admin/photos", params: FeedParams, pageSize = 30) {
  const [items, setItems] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([endpoint, params, pageSize]);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (after: string | null, gen: number) => {
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const page = await api<Page<Photo>>(`${endpoint}${qs({ ...params, cursor: after, limit: pageSize })}`);
        if (gen !== generation.current) return;
        setItems((prev) => (after ? [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))] : page.items));
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
      } catch (err) {
        if (gen !== generation.current) return;
        setError(err instanceof ApiError ? err.message : "Không tải được danh sách ảnh");
      } finally {
        if (gen === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const reload = useCallback(() => {
    generation.current++;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    void fetchPage(null, generation.current);
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore || !cursor) return;
    void fetchPage(cursor, generation.current);
  }, [cursor, hasMore, fetchPage]);

  return { items, setItems, loading, error, hasMore, loadMore, reload };
}

/**
 * Gọi callback khi phần tử mốc ở cuối danh sách sắp vào màn hình. `version` đổi (số ảnh đã tải) thì
 * gắn lại observer: nếu mốc vẫn trong màn hình sau khi tải xong một trang, observer báo lại ngay.
 */
export function useInfiniteScroll(onReach: () => void, enabled: boolean, version: number) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, version]);
  return ref;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Photo Gallery` : "Photo Gallery";
  }, [title]);
}
