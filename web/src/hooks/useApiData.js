import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";

// Tải dữ liệu khi deps đổi; huỷ yêu cầu cũ khi deps đổi hoặc component bị gỡ.
// Kết quả được gắn với khoá của deps: ngay lần render đầu tiên sau khi deps đổi, hook báo "loading"
// và không bao giờ trả dữ liệu của yêu cầu trước dưới URL mới.
export function useApiData(loader, deps) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [state, setState] = useState({ key, status: "loading", data: undefined, meta: undefined, error: null });

  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal).then(
      ({ data, meta }) => {
        if (controller.signal.aborted) return;
        setState({ key, status: "ok", data, meta, error: null });
      },
      (error) => {
        if (controller.signal.aborted || (error && error.name === "AbortError")) return;
        const notFound = error instanceof ApiError && error.kind === "business" && error.code === "NOT_FOUND";
        setState({ key, status: notFound ? "notFound" : "error", data: undefined, meta: undefined, error });
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (state.key !== key) {
    return { status: "loading", data: undefined, meta: undefined, error: null, retry };
  }
  return { status: state.status, data: state.data, meta: state.meta, error: state.error, retry };
}
