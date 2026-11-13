// Bước kiểm tra danh tính chạy TRƯỚC handler của các route được bảo vệ.
//   1. Đọc Authorization: Bearer <JWT>       thiếu / sai dạng        -> 401 UNAUTHENTICATED
//   2. Verify chữ ký HS256, iss, aud, exp     sai chữ ký              -> 401 UNAUTHENTICATED
//                                             quá exp                 -> 401 TOKEN_EXPIRED
//   3. Tải user theo sub từ DB                không còn / chưa active -> 401 UNAUTHENTICATED
//   4. So tokenVersion                        đã đổi (reset password, đăng xuất mọi nơi) -> 401
// Qua đủ bốn bước thì req.user là bản ghi từ DB (role lấy ở đây, không lấy từ token hay body).
// Bài 1 chưa phân quyền theo role: mọi tài khoản active dùng được CRUD.
const prisma = require("../db/prisma");
const { bearerToken, verifyAccessToken } = require("./tokens");
const { unauthenticated } = require("../http/respond");

const USER_FIELDS = { id: true, email: true, emailInput: true, role: true, status: true, tokenVersion: true };

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

module.exports = { requireAuth, protectMethods };
