// Các trang xác thực SSR. Truy cập được khi chưa đăng nhập.
//   GET/POST /register          đăng ký (reCAPTCHA v2 + rate limit)
//   GET/POST /activate          nhập OTP kích hoạt
//   POST     /activate/resend   gửi lại OTP
//   GET/POST /login             đăng nhập (rate limit, CAPTCHA sau 3 lần sai, khóa 5 phút sau 10 lần)
//   POST     /logout            đăng xuất
//   GET/POST /forgot            quên mật khẩu
//   GET/POST /reset             đặt mật khẩu mới bằng reset token
// Lỗi nhập (sai dữ liệu, sai OTP, sai mật khẩu) giữ status 200 và có mã lỗi như hợp đồng Block 6;
// vượt giới hạn trả trang 429 RATE_LIMITED.
const express = require("express");
const { asyncHandler } = require("../utils/helpers");
const { POLICY, recaptchaConfig } = require("../auth/config");
const throttle = require("../auth/throttle");
const { verifyCaptcha, CaptchaUnavailableError } = require("../auth/captcha");
const service = require("../auth/service");
const { createSession, destroySession, homeFor } = require("../auth/session");
const { normalizeEmail, emailError, validateRegistration, validateNewPassword, safeNext } = require("../auth/accounts");

const router = express.Router();

const text = (v) => (typeof v === "string" ? v.trim() : "");
const ipKey = (name, req) => `${name}:ip:${req.ip}`;

function tooMany(res, retryAfterSec, message) {
  res.set("Retry-After", String(retryAfterSec));
  return res.status(429).render("errors/429", {
    title: "Thao tác quá nhanh",
    message: message || "Bạn đã thử quá nhiều lần.",
    retryAfterMin: Math.ceil(retryAfterSec / 60),
  });
}

// Xác minh reCAPTCHA ở backend: { ok } hoặc { unavailable: true } khi không gọi được Google
async function checkCaptcha(req) {
  try {
    return await verifyCaptcha(req.body["g-recaptcha-response"], req.ip);
  } catch (err) {
    if (!(err instanceof CaptchaUnavailableError)) throw err;
    console.error(`[recaptcha] không xác minh được: ${err.cause ? err.cause.message : err.message}`);
    return { ok: false, unavailable: true };
  }
}

// Lỗi kỹ thuật khi xác minh CAPTCHA: không cho qua, không tạo user, không gửi OTP
const CAPTCHA_UNAVAILABLE = {
  errors: ["Chưa xác minh được CAPTCHA do lỗi kết nối. Vui lòng thử lại."],
  code: "CAPTCHA_UNAVAILABLE",
};

// Giới hạn theo IP; trả về true nếu đã render 429
async function ipLimited(req, res, name, rule, message) {
  const r = await throttle.hit(ipKey(name, req), rule);
  if (r.allowed) return false;
  tooMany(res, r.retryAfterSec, message);
  return true;
}

// ───────────────────────────── Đăng ký ─────────────────────────────

function renderRegister(req, res, { email = "", errors = [], code = null, status = 200 } = {}) {
  res.status(status).render("auth/register", {
    title: "Đăng ký",
    email,
    errors,
    code,
    recaptchaSiteKey: recaptchaConfig().siteKey,
    policy: POLICY,
  });
}

router.get(
  "/register",
  asyncHandler(async (req, res) => {
    if (req.user) return res.redirect(303, homeFor(req.user));
    renderRegister(req, res);
  })
);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "register", POLICY.rate.registerIp, "Quá nhiều yêu cầu đăng ký từ địa chỉ này.")) return;
    const emailInput = text(req.body.email);

    // 1. CAPTCHA ở server (siteverify của Google), trước khi băm password, tạo user hay gửi OTP
    const human = await checkCaptcha(req);
    if (human.unavailable) return renderRegister(req, res, { email: emailInput, ...CAPTCHA_UNAVAILABLE, status: 503 });
    if (!human.ok) {
      return renderRegister(req, res, {
        email: emailInput,
        errors: ["Vui lòng xác nhận \"Tôi không phải người máy\" (CAPTCHA chưa hợp lệ hoặc đã hết hạn)."],
        code: "INVALID_CAPTCHA",
      });
    }

    // 2. Validate; role trong body (nếu có) không bao giờ được đọc
    const form = validateRegistration(req.body);
    if (form.errors.length > 0) {
      return renderRegister(req, res, { email: emailInput, errors: form.errors, code: "VALIDATION_FAILED" });
    }

    // 3. Tạo tài khoản pending (hoặc không làm gì nếu email đã có). Phản hồi giống nhau.
    await service.register(form);
    res.redirect(303, "/activate?registered=1&email=" + encodeURIComponent(form.emailInput));
  })
);

// ───────────────────────────── Kích hoạt ─────────────────────────────

function renderActivate(res, { email = "", errors = [], code = null, notice = null } = {}) {
  res.render("auth/activate", { title: "Kích hoạt tài khoản", email, errors, code, notice, policy: POLICY });
}

const GENERIC_SENT =
  "Nếu email này vừa đăng ký và chưa kích hoạt, mã OTP đã được gửi tới hộp thư. Mã có hiệu lực trong " +
  Math.round(POLICY.otp.ttlMs / 60000) +
  " phút.";

router.get("/activate", (req, res) => {
  const notice = req.query.registered === "1" || req.query.sent === "1" ? GENERIC_SENT : null;
  renderActivate(res, { email: text(req.query.email), notice });
});

router.post(
  "/activate",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "activate", POLICY.rate.activateIp)) return;
    const emailInput = text(req.body.email);
    const result = await service.activate(normalizeEmail(emailInput), text(req.body.otp));

    if (result.status === "locked") {
      return tooMany(res, result.retryAfterSec, "Bạn đã nhập sai mã quá nhiều lần. Kích hoạt tạm khóa.");
    }
    if (result.status === "invalid") {
      return renderActivate(res, {
        email: emailInput,
        errors: ["Mã OTP không đúng, đã hết hạn hoặc đã được dùng."],
        code: "INVALID_OTP",
      });
    }
    // Kích hoạt chỉ đổi trạng thái tài khoản, không tự đăng nhập
    res.redirect(303, "/login?activated=1&email=" + encodeURIComponent(emailInput));
  })
);

router.post(
  "/activate/resend",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "resend", POLICY.rate.resendIp)) return;
    const emailInput = text(req.body.email);
    const e = emailError(emailInput);
    if (e) return renderActivate(res, { email: emailInput, errors: [e], code: "VALIDATION_FAILED" });

    const sent = await service.sendActivationCode(normalizeEmail(emailInput));
    if (!sent.ok) {
      return tooMany(res, sent.retryAfterSec, "Vui lòng chờ trước khi yêu cầu gửi lại mã.");
    }
    res.redirect(303, "/activate?sent=1&email=" + encodeURIComponent(emailInput));
  })
);

// ───────────────────────────── Đăng nhập ─────────────────────────────

function renderLogin(req, res, { email = "", next = null, errors = [], code = null, notice = null, needCaptcha = false, status = 200 } = {}) {
  res.status(status).render("auth/login", {
    title: "Đăng nhập",
    email,
    next,
    errors,
    code,
    notice,
    recaptchaSiteKey: needCaptcha ? recaptchaConfig().siteKey : null,
  });
}

const LOGIN_NOTICES = {
  activated: "Tài khoản đã được kích hoạt. Hãy đăng nhập.",
  reset: "Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.",
  loggedOut: "Bạn đã đăng xuất.",
};

router.get(
  "/login",
  asyncHandler(async (req, res) => {
    if (req.user) return res.redirect(303, homeFor(req.user));
    const email = text(req.query.email);
    const notice = Object.keys(LOGIN_NOTICES).find((k) => req.query[k] === "1");
    // Backend quyết định có hiện CAPTCHA: theo bộ đếm sai của email (nếu đã biết email)
    const state = email ? await service.loginState(normalizeEmail(email)) : { captchaRequired: false };
    renderLogin(req, res, {
      email,
      next: safeNext(req.query.next),
      notice: notice ? LOGIN_NOTICES[notice] : null,
      needCaptcha: state.captchaRequired,
    });
  })
);

/*
 * Thứ tự: rate limit IP -> email đang bị khóa? -> CAPTCHA (nếu bộ đếm yêu cầu) -> password ->
 * trạng thái tài khoản -> tạo session. Bỏ trường CAPTCHA, đổi cookie hay gọi thẳng POST /login
 * đều không bỏ qua được bước nào vì mọi điều kiện đọc từ bộ đếm ở server.
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const emailInput = text(req.body.email);
    const email = normalizeEmail(emailInput);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const next = safeNext(req.body.next);

    if (await ipLimited(req, res, "login", POLICY.rate.loginIp, "Quá nhiều lần đăng nhập từ địa chỉ này.")) return;

    const state = await service.loginState(email);
    if (state.lockedUntil) {
      return tooMany(res, throttle.retryAfter(state.lockedUntil), "Đăng nhập tạm khóa do nhập sai quá nhiều lần.");
    }

    if (state.captchaRequired) {
      const human = await checkCaptcha(req);
      if (human.unavailable) {
        return renderLogin(req, res, { email: emailInput, next, ...CAPTCHA_UNAVAILABLE, needCaptcha: true, status: 503 });
      }
      if (!human.ok) {
        // Dừng trước bước kiểm tra password; form hiện lại với CAPTCHA mới, giữ email, bỏ password
        return renderLogin(req, res, {
          email: emailInput,
          next,
          errors: ["Vui lòng xác nhận CAPTCHA \"Tôi không phải người máy\"."],
          code: "CAPTCHA_REQUIRED",
          needCaptcha: true,
        });
      }
    }

    const result = await service.checkCredentials(email, password);
    if (result.status === "invalid") {
      const after = await service.loginState(email);
      if (after.lockedUntil) {
        return tooMany(res, throttle.retryAfter(after.lockedUntil), "Đăng nhập tạm khóa do nhập sai quá nhiều lần.");
      }
      return renderLogin(req, res, {
        email: emailInput,
        next,
        errors: ["Email hoặc mật khẩu không đúng."],
        code: "INVALID_CREDENTIALS",
        needCaptcha: after.captchaRequired,
      });
    }
    if (result.status === "pending") {
      return res.render("auth/pending", { title: "Chưa kích hoạt", email: emailInput });
    }

    await createSession(req, res, result.user.id);
    // ?next= trỏ vào /admin mà tài khoản không phải admin thì về trang mặc định (tránh 403 ngay sau login)
    const target = next && (result.user.role === "admin" || !next.toLowerCase().startsWith("/admin")) ? next : homeFor(result.user);
    res.redirect(303, target);
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    res.redirect(303, "/login?loggedOut=1");
  })
);

// ───────────────────────── Quên / đặt lại mật khẩu ─────────────────────────

const FORGOT_SENT = "Nếu email đã đăng ký, hướng dẫn đặt lại mật khẩu đã được gửi.";

router.get("/forgot", (req, res) => {
  res.render("auth/forgot", { title: "Quên mật khẩu", email: "", errors: [], code: null, notice: null });
});

router.post(
  "/forgot",
  asyncHandler(async (req, res) => {
    const emailInput = text(req.body.email);
    const email = normalizeEmail(emailInput);
    if (await ipLimited(req, res, "forgot", POLICY.rate.forgotIp)) return;
    // Giới hạn theo chuỗi email: email có hay không có tài khoản đều bị giới hạn giống nhau
    const perEmail = await throttle.hit(`forgot:email:${email}`, POLICY.rate.forgotEmail);
    if (!perEmail.allowed) return tooMany(res, perEmail.retryAfterSec, "Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần.");

    const e = emailError(emailInput);
    if (e) return res.render("auth/forgot", { title: "Quên mật khẩu", email: emailInput, errors: [e], code: "VALIDATION_FAILED", notice: null });

    await service.requestPasswordReset(email);
    // Cùng nội dung, cùng status cho email có và không có tài khoản
    res.render("auth/forgot", { title: "Quên mật khẩu", email: "", errors: [], code: null, notice: FORGOT_SENT });
  })
);

// Token nằm trên URL: không cho rò qua header Referer khi trang reset tải tài nguyên ngoài
function noReferrer(req, res, next) {
  res.set("Referrer-Policy", "no-referrer");
  next();
}

// GET chỉ hiện form, không tiêu thụ token (trình quét link trong email có thể mở URL trước)
router.get(
  "/reset",
  noReferrer,
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "reset", POLICY.rate.resetIp)) return;
    const token = text(req.query.token);
    const usable = await service.findUsableResetToken(token);
    res.render("auth/reset", { title: "Đặt mật khẩu mới", token: usable ? token : null, errors: [], code: null });
  })
);

router.post(
  "/reset",
  noReferrer,
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "reset", POLICY.rate.resetIp)) return;
    const token = text(req.body.token);

    const form = validateNewPassword(req.body);
    if (form.errors.length > 0) {
      const usable = await service.findUsableResetToken(token);
      return res.render("auth/reset", { title: "Đặt mật khẩu mới", token: usable ? token : null, errors: form.errors, code: "VALIDATION_FAILED" });
    }

    const changed = await service.resetPassword(token, form.password);
    if (!changed) {
      return res.render("auth/reset", { title: "Đặt mật khẩu mới", token: null, errors: [], code: "INVALID_TOKEN" });
    }
    // Không tự đăng nhập: người dùng đăng nhập lại theo luồng thường
    res.redirect(303, "/login?reset=1");
  })
);

module.exports = router;
