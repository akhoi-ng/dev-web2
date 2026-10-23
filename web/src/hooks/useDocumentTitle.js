import { useEffect } from "react";
import { RESTAURANT } from "../lib/restaurant.js";

// Đặt document.title: "<title> · Lửa Hồng", hoặc chỉ "Lửa Hồng" khi không có title.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${RESTAURANT.name}` : RESTAURANT.name;
  }, [title]);
}
