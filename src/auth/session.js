// Session lưu ở PostgreSQL (bảng sessions); cookie `sid` chỉ mang mã ngẫu nhiên tham chiếu.
// Middleware ở đây chạy trước mọi handler:
//   1. anonSession: cookie `aid` cho phiên ẩn danh (CSRF token trước khi đăng nhập)
//   2. loadSession: đọc cookie sid -> tra bản ghi session -> gắn req.user
//   3. requireLogin: chưa có req.user thì 303 tới /login
const prisma = require("../db/prisma");
const { POLICY, COOKIE, cookieSecure } = require("./config");
const { randomToken, sha256 } = require("./crypto");

// Mã do server sinh: 32 byte base64url = 43 ký tự. Cookie lạ (sai định dạng) bị bỏ qua.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function cookieOptions(maxAgeMs) {
  const options = { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/" };
  if (maxAgeMs) options.maxAge = maxAgeMs;
  return options;
}

// 1. Phiên ẩn danh: chưa có cookie aid hợp lệ thì cấp mới. Server không lưu bản ghi cho aid;
//    CSRF token của các form trước đăng nhập là HMAC của SHA-256(aid).
function anonSession(req, res, next) {
  let aid = req.cookies[COOKIE.anon];
  if (typeof aid !== "string" || !TOKEN_RE.test(aid)) {
    aid = randomToken(32);
    res.cookie(COOKIE.anon, aid, cookieOptions());
  }
  req.anonIdHash = sha256(aid);
  next();
}

// 2. Khôi phục danh tính từ cookie sid. Session hết hạn, bị hủy hoặc user không còn active
//    được xử lý như chưa đăng nhập (không phải lỗi hệ thống).
async function loadSession(req, res, next) {
  try {
    req.user = null;
    req.sessionHash = null;
    const sid = req.cookies[COOKIE.session];
    if (typeof sid === "string" && sid) {
      const now = new Date();
      const sidHash = TOKEN_RE.test(sid) ? sha256(sid) : null;
      const session = sidHash
        ? await prisma.session.findUnique({ where: { sidHash }, include: { user: true } })
        : null;
      const valid =
        session && session.expiresAt > now && session.absoluteExpiresAt > now && session.user.status === "active";

      if (valid) {
        req.user = { id: session.user.id, email: session.user.email, role: session.user.role };
        req.sessionHash = sidHash;
        // Gia hạn hạn không hoạt động (không vượt hạn tối đa), tối đa mỗi 5 phút một lần
        const { idleMs, touchEveryMs } = POLICY.session;
        if (session.expiresAt.getTime() - now.getTime() < idleMs - touchEveryMs) {
          const expiresAt = new Date(Math.min(now.getTime() + idleMs, session.absoluteExpiresAt.getTime()));
          await prisma.session.updateMany({ where: { sidHash }, data: { expiresAt } });
        }
      } else {
        if (session) await prisma.session.deleteMany({ where: { sidHash } });
        res.clearCookie(COOKIE.session, cookieOptions());
      }
    }
    res.locals.currentUser = req.user;
    next();
  } catch (err) {
    next(err);
  }
}

// Tạo session mới sau khi đăng nhập đúng: luôn sinh sid mới (chống session fixation),
// sid cũ (nếu request đang mang) bị hủy.
async function createSession(req, res, userId, now = new Date()) {
  if (req.sessionHash) await prisma.session.deleteMany({ where: { sidHash: req.sessionHash } });
  const sid = randomToken(32);
  const { idleMs, absoluteMs } = POLICY.session;
  await prisma.session.create({
    data: {
      sidHash: sha256(sid),
      userId,
      expiresAt: new Date(now.getTime() + idleMs),
      absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
    },
  });
  res.cookie(COOKIE.session, sid, cookieOptions(absoluteMs));
}

// Đăng xuất: hủy bản ghi ở server TRƯỚC, rồi mới bảo browser xóa cookie
async function destroySession(req, res) {
  if (req.sessionHash) await prisma.session.deleteMany({ where: { sidHash: req.sessionHash } });
  res.clearCookie(COOKIE.session, cookieOptions());
  req.user = null;
  req.sessionHash = null;
}

// Hủy mọi session của user (sau khi đặt lại mật khẩu)
function destroyAllSessions(userId, db = prisma) {
  return db.session.deleteMany({ where: { userId } });
}

// 3. Chặn route cần đăng nhập. Kiểm tra ở server nên gọi thẳng bằng công cụ HTTP cũng bị chặn.
function requireLogin(req, res, next) {
  if (req.user) return next();
  const target = req.method === "GET" ? "?next=" + encodeURIComponent(req.originalUrl) : "";
  res.redirect(303, "/login" + target);
}

// 4. Phân quyền theo role (chạy SAU requireLogin): biết người gọi nhưng không đủ quyền -> 403,
//    không đổi dữ liệu. Role đọc lại từ DB ở mỗi request (loadSession), đổi role có hiệu lực ngay.
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).render("errors/403", {
      title: "Không có quyền",
      heading: "Bạn không có quyền vào trang này",
      message: "Khu vực quản trị chỉ dành cho tài khoản quản trị viên.",
      code: "FORBIDDEN",
    });
  };
}

// Trang mặc định sau khi đăng nhập theo role
function homeFor(user) {
  return user && user.role === "admin" ? "/admin/dishes" : "/dishes";
}

module.exports = {
  requireRole,
  homeFor,
  anonSession,
  loadSession,
  createSession,
  destroySession,
  destroyAllSessions,
  requireLogin,
  cookieOptions,
};
