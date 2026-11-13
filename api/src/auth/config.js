// Chính sách xác thực của API (README mục "Block 9 – Chính sách"). Mọi con số nằm ở đây.
// Các giá trị CAPTCHA, bộ đếm sai, OTP, reset giữ nguyên như bản SSR của Block 8 vì hai bản dùng
// chung bảng users, activation_challenges, password_resets và auth_throttles.
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const POLICY = {
  password: { min: 8, max: 128 },

  // Access token (JWT HS256) gửi trong header Authorization: Bearer <token>
  accessToken: {
    ttlSec: 15 * 60, // 900 giây
    algorithm: "HS256",
    issuer: "lua-hong-api",
    audience: "lua-hong-web",
  },

  // Refresh token: chuỗi ngẫu nhiên trong cookie HttpOnly, DB lưu SHA-256, xoay vòng mỗi lần dùng
  refreshToken: {
    ttlMs: 7 * DAY, // hạn tuyệt đối tính từ lúc đăng nhập; làm mới không gia hạn
    cookie: "rt",
    path: "/api/auth", // browser chỉ gửi cookie cho các route xác thực, không gửi cho CRUD
  },

  otp: {
    digits: 6,
    ttlMs: 10 * MINUTE,
    maxAttempts: 5,
    lockMs: 15 * MINUTE,
    resendCooldownMs: 60 * SECOND,
    maxSendsPerHour: 5,
  },

  login: {
    windowMs: 15 * MINUTE,
    captchaAfter: 3, // từ lần sai thứ 3 phải có CAPTCHA trước khi kiểm tra password
    lockAfter: 10, // đủ 10 lần sai: 429 trong 5 phút
    lockMs: 5 * MINUTE,
  },

  rate: {
    loginIp: { limit: 50, windowMs: 15 * MINUTE },
    registerIp: { limit: 10, windowMs: HOUR },
    activateIp: { limit: 30, windowMs: 15 * MINUTE },
    resendIp: { limit: 20, windowMs: HOUR },
    forgotEmail: { limit: 3, windowMs: HOUR },
    forgotIp: { limit: 10, windowMs: HOUR },
    resetIp: { limit: 30, windowMs: 15 * MINUTE },
    refreshIp: { limit: 120, windowMs: 15 * MINUTE },
  },

  reset: { ttlMs: 15 * MINUTE },
};

// Cookie Secure bật mặc định (browser vẫn nhận cookie Secure trên http://localhost).
// COOKIE_SECURE=0 chỉ dùng khi thử bằng công cụ HTTP không gửi cookie Secure qua http.
function cookieSecure() {
  return process.env.COOKIE_SECURE !== "0";
}

// SameSite của cookie refresh. localhost:5173 và localhost:3000 cùng site (cổng không tính) nên
// Strict dùng được khi chạy local. Web và API khác site khi triển khai thì đặt none (kèm Secure).
function refreshSameSite() {
  const v = (process.env.REFRESH_COOKIE_SAMESITE || "strict").toLowerCase();
  return ["strict", "lax", "none"].includes(v) ? v : "strict";
}

// Origin của SPA (link trong email trỏ về đây, không lấy từ header Host hay Origin của request)
function webUrl() {
  const first = String(process.env.WEB_URL || process.env.CORS_ORIGIN || "http://localhost:5173").split(",")[0];
  return first.trim().replace(/\/+$/, "");
}

function corsOrigins() {
  return String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/*
 * Google reCAPTCHA v2 (checkbox). Site key công khai: SPA lấy qua GET /api/auth/captcha.
 * Secret key chỉ ở backend. RECAPTCHA_HOSTNAMES mặc định là hostname của WEB_URL, vì widget
 * chạy trên trang của SPA. RECAPTCHA_VERIFY_URL chỉ đổi khi chạy script nghiệm thu.
 */
function recaptchaConfig() {
  const siteKey = process.env.RECAPTCHA_SITE_KEY || "";
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || "";
  if (!siteKey || !secretKey) {
    throw new Error("Thiếu RECAPTCHA_SITE_KEY hoặc RECAPTCHA_SECRET_KEY trong api/.env");
  }
  const hostnames = (process.env.RECAPTCHA_HOSTNAMES || new URL(webUrl()).hostname)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return {
    siteKey,
    secretKey,
    hostnames,
    verifyUrl: process.env.RECAPTCHA_VERIFY_URL || "https://www.google.com/recaptcha/api/siteverify",
  };
}

function requireSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`Thiếu ${name} (ít nhất 32 ký tự) trong api/.env`);
  return value;
}

// Khóa HMAC cho hash OTP. Phải trùng SESSION_SECRET của bản SSR vì hai bản đọc chung bảng OTP.
const secret = () => requireSecret("SESSION_SECRET");

// Khóa ký JWT, tách khỏi khóa OTP. Chỉ nằm ở backend, không bao giờ vào bundle của SPA.
const jwtSecret = () => requireSecret("JWT_SECRET");

// Gọi lúc khởi động để báo thiếu cấu hình sớm thay vì lỗi ở request đầu tiên
function checkAuthConfig() {
  secret();
  jwtSecret();
  if (process.env.JWT_SECRET === process.env.SESSION_SECRET) {
    throw new Error("JWT_SECRET phải khác SESSION_SECRET");
  }
  recaptchaConfig();
}

module.exports = {
  POLICY,
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  cookieSecure,
  refreshSameSite,
  webUrl,
  corsOrigins,
  recaptchaConfig,
  secret,
  jwtSecret,
  checkAuthConfig,
};
