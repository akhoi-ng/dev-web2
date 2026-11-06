// Chống CSRF cho mọi form đổi dữ liệu. Ba lớp:
//  1. Cookie sid/aid có SameSite=Lax: browser không gửi kèm POST từ site khác.
//  2. CSRF token trong form: HMAC(SESSION_SECRET, "csrf:" + phiên hiện tại). Phiên đăng nhập thì
//     gắn với sid, chưa đăng nhập thì gắn với aid. Trang lạ không đọc được giá trị này.
//  3. Header Origin (nếu browser gửi) phải là origin của ứng dụng.
const { appUrl } = require("./config");
const { hmac, safeEqual } = require("./crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Các trang gửi Referrer-Policy: no-referrer (xem src/routes/auth.js)
const NO_REFERRER_PATHS = new Set(["/reset"]);

function csrfToken(req) {
  return hmac("csrf:" + (req.sessionHash || req.anonIdHash));
}

function allowedOrigins(req) {
  // APP_URL là origin công bố; thêm origin theo Host để chạy được cả http://127.0.0.1:3000
  return new Set([new URL(appUrl()).origin, `${req.protocol}://${req.get("host")}`]);
}

function csrfProtection(req, res, next) {
  res.locals.csrfToken = csrfToken(req);
  // method-override đã đổi POST thành PATCH/DELETE; originalMethod là method thật browser gửi
  if (SAFE_METHODS.has(req.originalMethod || req.method)) return next();

  const origin = req.get("origin");
  // Trang /reset đặt Referrer-Policy: no-referrer, nên form POST của chính nó được browser gửi kèm
  // "Origin: null" (chuẩn Fetch). Ở route này "null" = không có thông tin; CSRF token vẫn bắt buộc.
  const opaqueOk = origin === "null" && NO_REFERRER_PATHS.has(req.path);
  const originOk = !origin || opaqueOk || allowedOrigins(req).has(origin);
  const token = req.body && typeof req.body._csrf === "string" ? req.body._csrf : "";
  if (originOk && token && safeEqual(token, res.locals.csrfToken)) return next();

  res.status(403).render("errors/403", { title: "Yêu cầu bị từ chối" });
}

module.exports = { csrfProtection, csrfToken };
