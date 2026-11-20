// Điều hướng sau đăng nhập. Không import gì của React để chạy được dưới Node thuần (test).

// Chỉ nhận đường dẫn nội bộ cho ?next= (chặn "//evil.com", "/\evil", "https://...")
export function safeNext(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

// Block 10: khu vực quản trị của SPA. Chỉ để ẩn / hiện giao diện; API tự chặn bằng 403 (role đọc
// từ DB ở mỗi request).
//   Admin   mọi trang /admin/*
//   Editor  chỉ khu món ăn (/admin, /admin/dishes/*): xem, thêm món nháp, sửa món nháp của đầu bếp mình
//   Viewer  không vào khu quản trị
export const isAdminUser = (user) => Boolean(user && user.role === "admin");
export const isStaffUser = (user) => Boolean(user && (user.role === "admin" || user.role === "editor"));

const under = (p, base) => p === base || p.startsWith(base + "/") || p.startsWith(base + "?");
const isAdminPath = (p) => under(p, "/admin");
const isDishAdminPath = (p) => p === "/admin" || p.startsWith("/admin?") || under(p, "/admin/dishes");

// Tài khoản có được mở đường dẫn quản trị này không
export function canOpenAdminPath(path, user) {
  if (isAdminUser(user)) return true;
  return isStaffUser(user) && isDishAdminPath(path);
}

// Trang đích sau khi đăng nhập: ?next= nếu hợp lệ và người dùng được vào; Admin, Editor mặc định về
// trang quản trị món ăn, Viewer về thực đơn
export function landingFor(next, user) {
  const safe = safeNext(next);
  if (safe && (!isAdminPath(safe) || canOpenAdminPath(safe, user))) return safe;
  return isStaffUser(user) ? "/admin/dishes" : "/dishes";
}
