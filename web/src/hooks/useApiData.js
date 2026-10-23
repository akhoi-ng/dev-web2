import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client.js";

// Tải dữ liệu khi deps đổi; huỷ yêu cầu cũ khi deps đổi hoặc component bị gỡ.
export function useApiData(loader, deps) {
  const [state, setState] = useState({ status: "loading", data: undefined, meta: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    loader(controller.signal).then(
      ({ data, meta }) => {
        if (controller.signal.aborted) return;
        setState({ status: "ok", data, meta, error: null });
      },
      (error) => {
        if (controller.signal.aborted || (error && error.name === "AbortError")) return;
        const notFound = error instanceof ApiError && error.kind === "business" && error.code === "NOT_FOUND";
        setState({ status: notFound ? "notFound" : "error", data: undefined, meta: undefined, error });
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
