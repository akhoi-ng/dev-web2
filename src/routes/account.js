// Block 9 Bài 2: bảo mật tài khoản (cần đăng nhập, xem app.js).
//   GET  /account/security             trạng thái MFA, số mã khôi phục còn lại
//   POST /account/mfa/setup            tạo secret mới chờ xác nhận (MFA đang bật: phải xác thực lại)
//   GET  /account/mfa/setup            QR + secret nhập tay + ô xác nhận mã
//   POST /account/mfa/confirm          mã đúng -> bật MFA (hoặc thay secret), hiện mã khôi phục MỘT lần
//   POST /account/mfa/cancel           bỏ secret đang chờ
//   POST /account/mfa/recovery-codes   tạo lại mã khôi phục (phải xác thực lại)
//   POST /account/mfa/disable          tắt MFA (phải xác thực lại)
// Xác thực lại = password hiện tại + mã TOTP hoặc mã khôi phục, có giới hạn số lần thử.
const express = require("express");
const prisma = require("../db/prisma");
const { asyncHandler } = require("../utils/helpers");
const { POLICY } = require("../auth/config");
const throttle = require("../auth/throttle");
const { verifyPassword } = require("../auth/crypto");
const mfa = require("../auth/mfa");

const router = express.Router();

const NOTICES = {
  disabled: "Đã tắt xác thực hai bước.",
  cancelled: "Đã hủy thiết lập MFA.",
};

// Trang có secret hoặc mã khôi phục: không cho browser / proxy lưu lại
function noStore(res) {
  res.set("Cache-Control", "no-store");
}

const loadUser = (req) => prisma.user.findUnique({ where: { id: req.user.id } });

async function renderSecurity(req, res, { errors = [], code = null, notice = null, status = 200 } = {}) {
  const user = await loadUser(req);
  const remaining = user.mfaEnabled ? await mfa.remainingRecoveryCodes(user.id) : 0;
  res.status(status).render("account/security", {
    title: "Bảo mật tài khoản",
    account: { email: user.emailInput, role: user.role, mfaEnabled: user.mfaEnabled, pending: Boolean(user.mfaPendingSecret) },
    remaining,
    errors,
    code,
    notice,
    policy: POLICY,
  });
}

function tooMany(res, retryAfterSec, message) {
  res.set("Retry-After", String(retryAfterSec));
  return res.status(429).render("errors/429", {
    title: "Thao tác quá nhanh",
    message,
    retryAfterMin: Math.ceil(retryAfterSec / 60),
  });
}

/*
 * Xác thực lại trước thao tác nhạy cảm: password hiện tại + mã MFA (TOTP hoặc mã khôi phục).
 * Đã render phản hồi (lỗi / 429) thì trả về null; đúng thì trả về user.
 */
async function reauthenticate(req, res) {
  const limit = await throttle.hit(`mfa-reauth:user:${req.user.id}`, POLICY.mfa.reauthAttempts);
  if (!limit.allowed) {
    tooMany(res, limit.retryAfterSec, "Xác thực lại sai quá nhiều lần.");
    return null;
  }
  const user = await loadUser(req);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  // Password sai thì không kiểm tra mã (không tiêu thụ mã khôi phục)
  const ok = (await verifyPassword(user.passwordHash, password)) && (await mfa.verifyCode(user, req.body.code)).ok;
  if (!ok) {
    await renderSecurity(req, res, { errors: ["Mật khẩu hoặc mã xác thực không đúng."], code: "REAUTH_FAILED" });
    return null;
  }
  await throttle.clear(`mfa-reauth:user:${req.user.id}`);
  return user;
}

function renderCodes(res, codes, heading) {
  noStore(res);
  res.render("account/recovery-codes", { title: "Mã khôi phục", codes, heading });
}

router.get(
  "/security",
  asyncHandler(async (req, res) => {
    const notice = Object.keys(NOTICES).find((k) => req.query[k] === "1");
    await renderSecurity(req, res, { notice: notice ? NOTICES[notice] : null });
  })
);

router.post(
  "/mfa/setup",
  asyncHandler(async (req, res) => {
    const current = await loadUser(req);
    // Thay MFA (thiết bị mới): phải xác thực lại bằng password + mã của secret đang dùng
    if (current.mfaEnabled && !(await reauthenticate(req, res))) return;
    await mfa.beginSetup(current.id);
    res.redirect(303, "/account/mfa/setup");
  })
);

async function renderSetup(req, res, { errors = [], code = null, status = 200 } = {}) {
  const user = await loadUser(req);
  const secret = mfa.pendingSecret(user);
  if (!secret) return res.redirect(303, "/account/security");
  noStore(res);
  const payload = await mfa.setupPayload(user.email, secret);
  res.status(status).render("account/mfa-setup", {
    title: "Thiết lập MFA",
    replacing: user.mfaEnabled,
    ...payload,
    errors,
    code,
  });
}

router.get("/mfa/setup", asyncHandler(async (req, res) => renderSetup(req, res)));

router.post(
  "/mfa/confirm",
  asyncHandler(async (req, res) => {
    const limit = await throttle.hit(`mfa-setup:user:${req.user.id}`, POLICY.mfa.setupAttempts);
    if (!limit.allowed) return tooMany(res, limit.retryAfterSec, "Nhập mã xác nhận sai quá nhiều lần.");
    const user = await loadUser(req);
    if (!user.mfaPendingSecret) return res.redirect(303, "/account/security");

    const codes = await mfa.confirmSetup(user, req.body.code, req.sessionHash);
    if (!codes) {
      return renderSetup(req, res, { errors: ["Mã không đúng hoặc đã hết hạn. Nhập mã đang hiện trong ứng dụng."], code: "INVALID_MFA_CODE" });
    }
    await throttle.clear(`mfa-setup:user:${req.user.id}`);
    renderCodes(res, codes, user.mfaEnabled ? "Đã thay thiết bị xác thực" : "Đã bật xác thực hai bước");
  })
);

router.post(
  "/mfa/cancel",
  asyncHandler(async (req, res) => {
    await mfa.cancelSetup(req.user.id);
    res.redirect(303, "/account/security?cancelled=1");
  })
);

router.post(
  "/mfa/recovery-codes",
  asyncHandler(async (req, res) => {
    const user = await reauthenticate(req, res);
    if (!user) return;
    if (!user.mfaEnabled) return res.redirect(303, "/account/security");
    renderCodes(res, await mfa.replaceRecoveryCodes(user.id), "Đã tạo mã khôi phục mới");
  })
);

router.post(
  "/mfa/disable",
  asyncHandler(async (req, res) => {
    const user = await reauthenticate(req, res);
    if (!user) return;
    await mfa.disable(user.id, req.sessionHash);
    res.redirect(303, "/account/security?disabled=1");
  })
);

module.exports = router;
