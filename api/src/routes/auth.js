// Xác thực cho SPA. Logic tài khoản lấy từ Block 8 (src/auth/service.js), chỉ đổi cách biểu diễn:
// form + redirect thành request JSON + response theo hợp đồng Block 6.
//
//   GET  /api/auth/captcha           site key reCAPTCHA (công khai) cho widget của SPA
//   POST /api/auth/register          { email, password, confirm?, captcha }
//   POST /api/auth/activate          { email, otp }
//   POST /api/auth/activate/resend   { email }
//   POST /api/auth/login             { email, password, captcha? }  -> accessToken + cookie rt
//   POST /api/auth/refresh           cookie rt                       -> accessToken mới + rt mới
//   POST /api/auth/logout            cookie rt                       -> thu hồi family của rt
//   POST /api/auth/logout-all        Bearer                          -> tokenVersion + 1, thu hồi mọi rt
//   GET  /api/auth/me                Bearer                          -> user (role đọc từ DB)
//   POST /api/auth/forgot            { email }
//   POST /api/auth/reset             { token, password, confirm? }
//
// Lỗi nhập (sai dữ liệu, sai OTP, sai mật khẩu, CAPTCHA) là 200 + ok: false + error.code.
// Vượt giới hạn: 429 RATE_LIMITED. Chưa chứng minh được danh tính: 401.
const express = require("express");
const prisma = require("../db/prisma");
const { ok, fail, validationFailed, unauthenticated, rateLimited } = require("../http/respond");
const { asyncHandler, asObject } = require("../utils/helpers");
const { POLICY, cookieSecure, refreshSameSite, corsOrigins, recaptchaConfig } = require("../auth/config");
const throttle = require("../auth/throttle");
const { verifyCaptcha, CaptchaUnavailableError } = require("../auth/captcha");
const service = require("../auth/service");
const tokens = require("../auth/tokens");
const { requireAuth } = require("../auth/middleware");
const { normalizeEmail, emailError, validateRegistration, validateNewPassword, text, raw } = require("../auth/accounts");

const router = express.Router();
const RT = POLICY.refreshToken;

const ipKey = (name, req) => `${name}:ip:${req.ip}`;

// Giới hạn theo IP; trả về true nếu đã gửi 429
async function ipLimited(req, res, name, rule, message) {
  const r = await throttle.hit(ipKey(name, req), rule);
  if (r.allowed) return false;
  rateLimited(res, r.retryAfterSec, message);
  return true;
}

/*
 * CAPTCHA ở server (siteverify của Google). Không tin cờ nào do client tự gửi.
 * -> null khi đã qua; ngược lại đã gửi response và trả về true.
 *    thiếu token -> CAPTCHA_REQUIRED; Google trả không hợp lệ -> INVALID_CAPTCHA;
 *    không gọi được Google -> 503 (không cho qua, không tạo user, không gửi OTP)
 */
async function rejectCaptcha(req, res, body) {
  const token = text(body.captcha);
  if (!token) {
    fail(res, "CAPTCHA_REQUIRED", 'Vui lòng xác nhận "Tôi không phải người máy".');
    return true;
  }
  try {
    const result = await verifyCaptcha(token, req.ip);
    if (result.ok) return null;
    fail(res, "INVALID_CAPTCHA", "CAPTCHA không hợp lệ hoặc đã hết hạn, vui lòng xác nhận lại.");
    return true;
  } catch (err) {
    if (!(err instanceof CaptchaUnavailableError)) throw err;
    console.error(`[recaptcha] không xác minh được: ${err.cause ? err.cause.message : err.message}`);
    res.status(503).json({ message: "Chưa xác minh được CAPTCHA do lỗi kết nối. Vui lòng thử lại." });
    return true;
  }
}

// ───────────────────────────── cookie refresh token ─────────────────────────────

function refreshCookieOptions(expires) {
  return {
    httpOnly: true, // JavaScript của trang (kể cả mã XSS) không đọc được
    secure: cookieSecure() || refreshSameSite() === "none",
    sameSite: refreshSameSite(),
    path: RT.path, // chỉ gửi cho /api/auth/*, không đi kèm request CRUD
    ...(expires ? { expires } : {}),
  };
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(RT.cookie, token, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res) {
  res.clearCookie(RT.cookie, refreshCookieOptions());
}

/*
 * /refresh và /logout dùng cookie mà browser tự gắn, nên chặn thêm request từ origin lạ
 * (phòng CSRF). Ngoài ra: cookie SameSite, POST bắt buộc Content-Type JSON (form của trang khác
 * không gửi được nếu không qua preflight) và CORS chỉ cho origin của SPA.
 * Request không có Origin (công cụ HTTP, không phải browser) vẫn được xử lý.
 */
function sameOriginOnly(req, res, next) {
  const origin = req.get("origin");
  if (origin && !corsOrigins().includes(origin)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Origin không được phép" } });
  }
  next();
}

// Cấp cặp token cho user đã qua đủ điều kiện (password đúng + active)
async function issueTokens(res, user) {
  const refresh = await tokens.issueRefreshToken(user.id);
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  return tokens.signAccessToken(user);
}

// ───────────────────────────── CAPTCHA config ─────────────────────────────

router.get("/captcha", (req, res) => {
  ok(res, { provider: "recaptcha-v2", siteKey: recaptchaConfig().siteKey });
});

// ───────────────────────────── Đăng ký ─────────────────────────────

const REGISTER_DONE =
  "Nếu email hợp lệ và chưa kích hoạt, mã OTP đã được gửi tới hộp thư. Nhập mã để kích hoạt tài khoản.";

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "register", POLICY.rate.registerIp, "Quá nhiều yêu cầu đăng ký từ địa chỉ này")) return;
    const body = asObject(req.body);

    // 1. CAPTCHA trước khi băm password, tạo user hay gửi OTP
    if (await rejectCaptcha(req, res, body)) return;

    // 2. Validate; body.role (nếu có) không bao giờ được đọc
    const form = validateRegistration(body);
    if (Object.keys(form.fields).length > 0) return validationFailed(res, form.fields);

    // 3. Email mới: tạo user pending (role viewer do server gán) + gửi OTP. Email đã có: không
    //    ghi đè gì. Phản hồi giống nhau trong mọi nhánh, không có accessToken.
    await service.register(form);
    ok(res, { message: REGISTER_DONE });
  })
);

// ───────────────────────────── Kích hoạt ─────────────────────────────

router.post(
  "/activate",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "activate", POLICY.rate.activateIp)) return;
    const body = asObject(req.body);
    const result = await service.activate(normalizeEmail(body.email), text(body.otp));

    if (result.status === "locked") {
      return rateLimited(res, result.retryAfterSec, "Nhập sai mã quá nhiều lần, kích hoạt tạm khóa");
    }
    if (result.status === "invalid") {
      return fail(res, "INVALID_OTP", "Mã OTP không đúng, đã hết hạn hoặc đã được dùng");
    }
    // Kích hoạt chỉ đổi pending -> active, không cấp token: SPA chuyển sang trang đăng nhập
    ok(res, { activated: true });
  })
);

router.post(
  "/activate/resend",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "resend", POLICY.rate.resendIp)) return;
    const emailInput = text(asObject(req.body).email);
    const e = emailError(emailInput);
    if (e) return validationFailed(res, { email: e });

    const sent = await service.sendActivationCode(normalizeEmail(emailInput));
    if (!sent.ok) return rateLimited(res, sent.retryAfterSec, "Vui lòng chờ trước khi yêu cầu gửi lại mã");
    ok(res, { message: REGISTER_DONE });
  })
);

// ───────────────────────────── Đăng nhập ─────────────────────────────

/*
 * Thứ tự: rate limit IP -> email đang bị khóa? -> CAPTCHA (nếu bộ đếm yêu cầu) -> password ->
 * trạng thái tài khoản -> cấp token. Bộ đếm sai theo email nằm ở bảng auth_throttles, dùng chung
 * với form /login của bản SSR: sai 2 lần ở SSR rồi 1 lần ở API cũng đủ ngưỡng CAPTCHA.
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = asObject(req.body);
    const email = normalizeEmail(body.email);
    const password = raw(body.password);

    if (await ipLimited(req, res, "login", POLICY.rate.loginIp, "Quá nhiều lần đăng nhập từ địa chỉ này")) return;

    const fields = {};
    if (!email) fields.email = "Vui lòng nhập email.";
    if (!password) fields.password = "Vui lòng nhập mật khẩu.";
    if (Object.keys(fields).length > 0) return validationFailed(res, fields);

    const state = await service.loginState(email);
    if (state.lockedUntil) {
      return rateLimited(res, throttle.retryAfter(state.lockedUntil), "Đăng nhập tạm khóa do nhập sai quá nhiều lần");
    }
    // Đủ ngưỡng: CAPTCHA phải qua TRƯỚC khi kiểm tra password
    if (state.captchaRequired && (await rejectCaptcha(req, res, body))) return;

    const result = await service.checkCredentials(email, password);
    if (result.status === "invalid") {
      const after = await service.loginState(email);
      if (after.lockedUntil) {
        return rateLimited(res, throttle.retryAfter(after.lockedUntil), "Đăng nhập tạm khóa do nhập sai quá nhiều lần");
      }
      res.status(200).json({
        ok: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không đúng",
          captchaRequired: after.captchaRequired, // để SPA hiện widget trước lần gửi sau
        },
      });
      console.warn("[business] INVALID_CREDENTIALS", req.method, req.originalUrl);
      return;
    }
    if (result.status === "pending") {
      // Chỉ trả sau khi password đúng, nên không lộ tài khoản; không có accessToken
      return fail(res, "ACCOUNT_NOT_ACTIVATED", "Tài khoản chưa kích hoạt. Nhập mã OTP đã gửi qua email để kích hoạt.");
    }

    ok(res, await issueTokens(res, result.user));
  })
);

// ───────────────────────────── Làm mới và đăng xuất ─────────────────────────────

router.post(
  "/refresh",
  sameOriginOnly,
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "refresh", POLICY.rate.refreshIp)) return;
    const result = await tokens.rotateRefreshToken(req.cookies[RT.cookie]);
    if (result.status !== "ok") {
      clearRefreshCookie(res);
      const message =
        result.status === "reused" ? "Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại" : "Cần đăng nhập";
      return unauthenticated(res, "UNAUTHENTICATED", message);
    }
    setRefreshCookie(res, result.token, result.expiresAt);
    ok(res, tokens.signAccessToken(result.user));
  })
);

// Đăng xuất trên thiết bị này: thu hồi family của refresh token, xóa cookie. Access token đang
// nằm trong bộ nhớ của SPA bị SPA bỏ đi; bản sao ở nơi khác (nếu có) còn dùng được tới exp (≤ 15 phút).
router.post(
  "/logout",
  sameOriginOnly,
  asyncHandler(async (req, res) => {
    await tokens.revokeByToken(req.cookies[RT.cookie]);
    clearRefreshCookie(res);
    ok(res, { loggedOut: true });
  })
);

// Đăng xuất mọi nơi: tăng tokenVersion -> mọi access token đã cấp bị từ chối ngay ở request sau
router.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
      await tokens.revokeAllForUser(req.user.id, now, tx);
    });
    clearRefreshCookie(res);
    ok(res, { loggedOut: true });
  })
);

router.get("/me", requireAuth, (req, res) => {
  const { id, email, emailInput, role, status } = req.user;
  ok(res, { id, email, displayEmail: emailInput, role, status });
});

// ───────────────────────── Quên / đặt lại mật khẩu ─────────────────────────

const FORGOT_SENT = "Nếu email đã đăng ký, hướng dẫn đặt lại mật khẩu đã được gửi.";

router.post(
  "/forgot",
  asyncHandler(async (req, res) => {
    const emailInput = text(asObject(req.body).email);
    const email = normalizeEmail(emailInput);
    if (await ipLimited(req, res, "forgot", POLICY.rate.forgotIp)) return;
    // Giới hạn theo chuỗi email: email có hay không có tài khoản đều bị giới hạn như nhau
    const perEmail = await throttle.hit(`forgot:email:${email}`, POLICY.rate.forgotEmail);
    if (!perEmail.allowed) return rateLimited(res, perEmail.retryAfterSec, "Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần");

    const e = emailError(emailInput);
    if (e) return validationFailed(res, { email: e });

    await service.requestPasswordReset(email);
    // Cùng nội dung, cùng status cho email có và không có tài khoản
    ok(res, { message: FORGOT_SENT });
  })
);

// Token chỉ bị tiêu thụ ở đây (POST), không phải khi mở link /reset?token=... trên SPA
router.post(
  "/reset",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "reset", POLICY.rate.resetIp)) return;
    const form = validateNewPassword(req.body);
    if (Object.keys(form.fields).length > 0) return validationFailed(res, form.fields);

    const changed = await service.resetPassword(form.token, form.password);
    if (!changed) return fail(res, "INVALID_RESET_TOKEN", "Link đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng");
    // Không trả accessToken, không tự đăng nhập; JWT cũ đã mất hiệu lực nhờ tokenVersion
    clearRefreshCookie(res);
    ok(res, { reset: true });
  })
);

module.exports = router;
