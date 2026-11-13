import { TIME_ZONE } from "./restaurant.js";

export function formatPrice(value) {
  return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
}

// Định lượng nguyên liệu: 0.25 -> "0,25"
export function formatQty(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);
}

// Date -> "18:30, Thứ Bảy 17/10/2026"
export function formatDateTime(value) {
  const d = new Date(value);
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(d);
  const day = new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
  return time + ", " + day;
}

// "0123456789" -> "0123 456 789"
export function formatPhone(value) {
  return /^\d{10}$/.test(value) ? value.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3") : value;
}
