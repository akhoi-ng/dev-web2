// Điều hướng sau đăng nhập. Không import gì của React để chạy được dưới Node thuần (test).

// Chỉ nhận đường dẫn nội bộ cho ?next= (chặn "//evil.com", "/\evil", "https://...")
export function safeNext(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

// Block 10: khu vực quản trị của SPA chỉ dành cho Admin. Chỉ để ẩn / hiện giao diện; API tự chặn
// mọi endpoint quản trị bằng 403 với role khác (role đọc từ DB ở mỗi request).
export const isAdminUser = (user) => Boolean(user && user.role === "admin");

const isAdminPath = (p) => p === "/admin" || p.startsWith("/admin/") || p.startsWith("/admin?");

// Trang đích sau khi đăng nhập: ?next= nếu hợp lệ và người dùng được vào; Admin mặc định về trang
// quản trị, role khác về thực đơn
export function landingFor(next, user) {
  const safe = safeNext(next);
  if (safe && (!isAdminPath(safe) || isAdminUser(user))) return safe;
  return isAdminUser(user) ? "/admin/dishes" : "/dishes";
}
