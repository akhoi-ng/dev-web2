// Bước kiểm tra danh tính chạy TRƯỚC handler của các route được bảo vệ.
//   1. Đọc Authorization: Bearer <JWT>       thiếu / sai dạng        -> 401 UNAUTHENTICATED
//   2. Verify chữ ký HS256, iss, aud, exp     sai chữ ký              -> 401 UNAUTHENTICATED
//                                             quá exp                 -> 401 TOKEN_EXPIRED
//   3. Tải user theo sub từ DB                không còn / chưa active -> 401 UNAUTHENTICATED
//   4. So tokenVersion                        đã đổi (reset password, đăng xuất mọi nơi, bật/tắt MFA) -> 401
// Qua đủ các bước thì req.user là bản ghi từ DB (role, chefId lấy ở đây, không lấy từ token hay body).
//
// Block 10: tài khoản bật MFA chỉ nhận token sau bước nhập mã (POST /api/auth/mfa), và bật MFA làm
// tăng tokenVersion nên token cấp trước đó bị từ chối ở bước 4. Không còn chặn MFA_REQUIRED ở đây.
// Phân quyền khu vực quản trị của bản SPA (xem app.js):
//   Admin   mọi endpoint quản trị
//   Editor  chỉ khu món ăn: xem (cả món nháp), tạo món nháp của đầu bếp mình, sửa món nháp của đầu
//           bếp mình (ABAC trong handler); đọc danh sách đầu bếp, nguyên liệu để điền form. Không xóa.
//   Viewer  không vào khu quản trị (403); vẫn đăng nhập, xem /api/auth/me, quản lý MFA của mình.
const prisma = require("../db/prisma");
const { bearerToken, verifyAccessToken } = require("./tokens");
const { unauthenticated, forbidden } = require("../http/respond");
const { isAdmin, can, actionFor } = require("./policy");

const USER_FIELDS = {
  id: true,
  email: true,
  emailInput: true,
  role: true,
  chefId: true,
  status: true,
  tokenVersion: true,
  mfaEnabled: true,
};

function requireAuth(req, res, next) {
  const token = bearerToken(req.get("authorization"));
  if (!token) return unauthenticated(res, "UNAUTHENTICATED", "Cần đăng nhập");

  const result = verifyAccessToken(token);
  if (!result.ok) {
    return result.code === "TOKEN_EXPIRED"
      ? unauthenticated(res, "TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn")
      : unauthenticated(res, "UNAUTHENTICATED", "Token không hợp lệ");
  }

  prisma.user
    .findUnique({ where: { id: result.userId }, select: USER_FIELDS })
    .then((user) => {
      if (!user || user.status !== "active" || user.tokenVersion !== result.ver) {
        return unauthenticated(res, "UNAUTHENTICATED", "Token không còn hiệu lực");
      }
      req.user = user;
      next();
    })
    .catch(next);
}

// Bảo vệ một nhóm method của router: protect(["POST", "PATCH", "DELETE"])
function protectMethods(methods) {
  const set = new Set(methods);
  return (req, res, next) => (set.has(req.method) ? requireAuth(req, res, next) : next());
}

const ADMIN_ONLY = "Chỉ tài khoản quản trị viên được dùng chức năng này";
const STAFF_ONLY = "Tài khoản của bạn không có quyền vào khu vực quản trị";
const NOT_ALLOWED = "Tài khoản của bạn không được thực hiện thao tác này";

// Chỉ Admin (chạy SAU requireAuth). Role đọc từ DB ở requireAuth, không lấy từ token hay body.
function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  forbidden(res, "FORBIDDEN", ADMIN_ONLY);
}

// Chỉ yêu cầu Admin cho các method trong danh sách (method khác đi tiếp, ví dụ GET công khai)
function adminFor(methods) {
  const set = new Set(methods);
  return (req, res, next) => (set.has(req.method) ? requireAdmin(req, res, next) : next());
}

// Khu món ăn (chạy SAU requireAuth): role phải là editor hoặc admin (viewer -> 403), rồi RBAC theo
// method: GET đọc, POST tạo, PATCH sửa, DELETE xóa (editor xóa -> 403). Điều kiện ABAC của Editor
// (đầu bếp của mình, món nháp) nằm trong handler ghi món (routes/dishes.js).
function requireDishStaff(req, res, next) {
  const role = req.user && req.user.role;
  if (role !== "editor" && role !== "admin") return forbidden(res, "FORBIDDEN", STAFF_ONLY);
  if (!can(req.user, actionFor(req.method))) return forbidden(res, "FORBIDDEN", NOT_ALLOWED);
  next();
}

// Chỉ áp requireDishStaff cho các method trong danh sách (GET công khai của /api/dishes đi tiếp)
function dishStaffFor(methods) {
  const set = new Set(methods);
  return (req, res, next) => (set.has(req.method) ? requireDishStaff(req, res, next) : next());
}

// Đầu bếp, nguyên liệu: Editor chỉ đọc (để điền form món ăn), Admin mọi method
function adminOrEditorRead(req, res, next) {
  if (isAdmin(req.user)) return next();
  if (req.user && req.user.role === "editor" && actionFor(req.method) === "read") return next();
  forbidden(res, "FORBIDDEN", req.user && req.user.role === "editor" ? ADMIN_ONLY : STAFF_ONLY);
}

module.exports = { requireAuth, protectMethods, requireAdmin, adminFor, requireDishStaff, dishStaffFor, adminOrEditorRead };
