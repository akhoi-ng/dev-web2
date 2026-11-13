// Bước kiểm tra danh tính chạy TRƯỚC handler của các route được bảo vệ.
//   1. Đọc Authorization: Bearer <JWT>       thiếu / sai dạng        -> 401 UNAUTHENTICATED
//   2. Verify chữ ký HS256, iss, aud, exp     sai chữ ký              -> 401 UNAUTHENTICATED
//                                             quá exp                 -> 401 TOKEN_EXPIRED
//   3. Tải user theo sub từ DB                không còn / chưa active -> 401 UNAUTHENTICATED
//   4. So tokenVersion                        đã đổi (reset password, đăng xuất mọi nơi) -> 401
//   5. Tài khoản đã bật MFA (Bài 2, chỉ có trên bản SSR)                          -> 401
// Qua đủ các bước thì req.user là bản ghi từ DB (role lấy ở đây, không lấy từ token hay body).
// Block 9 Bài 2: requirePermission phân quyền theo role giống bản SSR (src/auth/policy.js):
// viewer chỉ đọc, editor thêm tạo/sửa, admin thêm xóa. Ghi món ăn qua API chỉ dành cho admin vì
// quy tắc ABAC (editor chỉ sửa món draft của đầu bếp mình) chỉ cài trên bản SSR.
const prisma = require("../db/prisma");
const { bearerToken, verifyAccessToken } = require("./tokens");
const { unauthenticated, forbidden } = require("../http/respond");

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

const PERMISSIONS = {
  viewer: new Set(["read"]),
  editor: new Set(["read", "create", "update"]),
  admin: new Set(["read", "create", "update", "delete"]),
};
const ACTIONS = { GET: "read", HEAD: "read", POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };

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
      // Bật MFA thì tokenVersion đã tăng; kiểm tra thêm để chắc chắn API không bỏ qua được MFA
      if (user.mfaEnabled) return unauthenticated(res, "MFA_REQUIRED", "Tài khoản bật MFA, hãy đăng nhập trên bản SSR");
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

// Phân quyền theo method (chạy SAU requireAuth): GET đọc, POST tạo, PATCH sửa, DELETE xóa
function requirePermission(req, res, next) {
  const allowed = PERMISSIONS[req.user && req.user.role];
  const action = ACTIONS[req.method];
  if (allowed && action && allowed.has(action)) return next();
  forbidden(res);
}

// Chỉ admin (ghi món ăn qua API, xem chú thích đầu file)
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === "admin") return next();
  forbidden(res, "FORBIDDEN", "Chỉ quản trị viên được ghi món ăn qua API; Editor dùng bản SSR");
}

module.exports = { requireAuth, protectMethods, requirePermission, requireAdmin };
