// Thông tin thương hiệu dùng chung cho header, footer và trang thực đơn.
// Điền số điện thoại và địa chỉ thật của nhà hàng vào đây.
const RESTAURANT = {
  name: "Lửa Hồng",
  tagline: "Bếp Việt & Âu",
  hours: "10:00 – 22:00",
  phone: "0123456789",
  address: "120 Yên Lãng",
};

// Giờ của nhà hàng (Việt Nam, UTC+7), dùng khi đọc và hiển thị giờ đặt bàn
const TIME_ZONE = "Asia/Ho_Chi_Minh";

// "2026-10-17" theo giờ Việt Nam
function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

// Date -> "18:30, Thứ Bảy 17/10/2026"
function formatDateTime(value) {
  const d = new Date(value);
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(d);
  const day = new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
  return time + ", " + day;
}

// "0123456789" -> "0123 456 789"
function formatPhone(value) {
  return /^\d{10}$/.test(value) ? value.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3") : value;
}

const DEFAULT_DISH_IMAGE =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80";

// Bọc handler async để lỗi (Promise reject) được chuyển tới middleware 500.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Ép kiểu id từ URL; trả về null nếu không phải số nguyên dương.
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

// Tính trang hiện tại từ ?page=...: không hợp lệ -> trang 1; vượt quá số trang -> trang cuối.
// Trả về { page, totalPages, skip, take } để đưa thẳng vào findMany.
function paginate(total, rawPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parseId(rawPage) || 1, totalPages);
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}

// Lấy giá trị chuỗi an toàn từ req.body / req.query (có thể là mảng hoặc undefined).
function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatPrice(value) {
  return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
}

// Định lượng nguyên liệu: 0.25 -> "0,25"
function formatQty(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Lỗi Prisma khi bản ghi không còn tồn tại lúc update/delete.
function isNotFoundError(err) {
  return err && err.code === "P2025";
}

module.exports = {
  RESTAURANT,
  TIME_ZONE,
  todayInVietnam,
  formatDateTime,
  formatPhone,
  DEFAULT_DISH_IMAGE,
  asyncHandler,
  parseId,
  paginate,
  str,
  formatPrice,
  formatQty,
  isHttpUrl,
  isNotFoundError,
};
