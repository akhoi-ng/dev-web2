import { useCallback, useEffect, useRef, useState } from "react";
import { applyError, applyPage, canLoad, initialList, startLoading } from "../lib/load-more.js";

/*
 * Danh sách tích lũy cho "Tải thêm" / "Cuộn vô hạn".
 *  - key: khóa của lần tìm; đổi key -> huỷ yêu cầu đang chạy, danh sách về rỗng, tự tải trang 1;
 *         null -> không tải gì (trang đang ở kiểu "Số trang")
 *  - fetchPage(page, signal) -> { data, meta } (kết quả của dishesApi.list)
 * Trả về { items, total, pending, end, error, loadNext, retry }.
 */
export function useLoadMore(key, fetchPage) {
  const [state, setState] = useState(() => initialList(key));
  const stateRef = useRef(state);
  const controllerRef = useRef(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const update = (fn) =>
    setState((prev) => {
      const next = fn(prev);
      stateRef.current = next;
      return next;
    });

  const load = useCallback(
    (page) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      update((s) => startLoading(s, key));
      fetchRef.current(page, controller.signal).then(
        ({ data, meta }) => {
          if (controller.signal.aborted) return;
          update((s) => applyPage(s, key, { items: data, total: meta.total, page: meta.page, pageSize: meta.pageSize }));
        },
        (error) => {
          if (controller.signal.aborted || (error && error.name === "AbortError")) return;
          update((s) => applyError(s, key, error));
        },
      );
    },
    [key],
  );

  // Lần tìm mới: bỏ danh sách cũ, huỷ yêu cầu cũ, tải trang đầu (key null = tắt, không tải)
  useEffect(() => {
    const fresh = initialList(key);
    stateRef.current = fresh;
    setState(fresh);
    if (key === null) return undefined;
    load(1);
    return () => controllerRef.current && controllerRef.current.abort();
  }, [key, load]);

  // Ổn định giữa các lần render để IntersectionObserver không phải gắn lại
  const loadNext = useCallback(() => {
    const s = stateRef.current;
    if (s.key === key && canLoad(s)) load(s.nextPage);
  }, [key, load]);

  const retry = useCallback(() => {
    const s = stateRef.current;
    if (s.key === key && s.error && !s.pending) load(s.nextPage);
  }, [key, load]);

  // Render đầu tiên sau khi đổi key: không bao giờ trả danh sách của lần tìm trước
  const current = state.key === key ? state : { ...initialList(key), pending: true };
  return { ...current, loadNext, retry };
}
