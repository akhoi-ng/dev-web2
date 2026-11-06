// Chính sách xác thực mà nhóm công bố (README mục "Chính sách"). Mọi con số nằm ở đây.
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const POLICY = {
  password: { min: 8, max: 128 },

  session: {
    idleMs: 2 * HOUR, // không thao tác 2 giờ thì hết hạn
    absoluteMs: 12 * HOUR, // tối đa 12 giờ kể từ lúc đăng nhập, không gia hạn
    touchEveryMs: 5 * MINUTE, // gia hạn expiresAt tối đa 5 phút một lần để đỡ ghi DB
  },

  // OTP kích hoạt
  otp: {
    digits: 6,
    ttlMs: 10 * MINUTE,
    maxAttempts: 5, // 5 lần sai -> khóa kích hoạt 15 phút
    lockMs: 15 * MINUTE,
    resendCooldownMs: 60 * SECOND,
    maxSendsPerHour: 5,
  },

  // Đăng nhập: đếm lần sai theo email chuẩn hóa trong cửa sổ 15 phút
  login: {
    windowMs: 15 * MINUTE,
    captchaAfter: 3, // từ lần sai thứ 3: phải có CAPTCHA trước khi kiểm tra password
    lockAfter: 10, // đủ 10 lần sai: từ chối 5 phút (429), CAPTCHA đúng cũng không qua
    lockMs: 5 * MINUTE,
  },

  // Rate limit theo IP và theo email: { limit, windowMs }
  rate: {
    loginIp: { limit: 50, windowMs: 15 * MINUTE },
    registerIp: { limit: 10, windowMs: HOUR },
    activateIp: { limit: 30, windowMs: 15 * MINUTE },
    resendIp: { limit: 20, windowMs: HOUR },
    forgotEmail: { limit: 3, windowMs: HOUR },
    forgotIp: { limit: 10, windowMs: HOUR },
    resetIp: { limit: 30, windowMs: 15 * MINUTE },
  },

  reset: { ttlMs: 15 * MINUTE },
};

const COOKIE = {
  session: "sid", // phiên đăng nhập
  anon: "aid", // phiên ẩn danh: gắn CSRF token cho các form trước khi đăng nhập
};

// Secure bật mặc định (browser vẫn nhận cookie Secure trên http://localhost).
// COOKIE_SECURE=0 chỉ dùng khi thử bằng công cụ không gửi cookie Secure qua http.
function cookieSecure() {
  return process.env.COOKIE_SECURE !== "0";
}

// Địa chỉ gốc của ứng dụng để dựng link trong email (không lấy từ header Host của request)
function appUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
}

/*
 * Google reCAPTCHA v2 (checkbox). Site key công khai ở client; secret key chỉ ở backend (.env).
 * RECAPTCHA_HOSTNAMES: hostname chấp nhận trong kết quả siteverify, mặc định lấy từ APP_URL.
 * RECAPTCHA_VERIFY_URL: chỉ đổi khi chạy script nghiệm thu (trỏ tới siteverify giả lập).
 */
function recaptchaConfig() {
  const siteKey = process.env.RECAPTCHA_SITE_KEY || "";
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || "";
  if (!siteKey || !secretKey) {
    throw new Error("Thiếu RECAPTCHA_SITE_KEY hoặc RECAPTCHA_SECRET_KEY trong .env");
  }
  const hostnames = (process.env.RECAPTCHA_HOSTNAMES || new URL(appUrl()).hostname)
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

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Thiếu SESSION_SECRET (ít nhất 32 ký tự) trong .env");
  }
  return value;
}

module.exports = { POLICY, COOKIE, SECOND, MINUTE, HOUR, cookieSecure, appUrl, secret, recaptchaConfig };
