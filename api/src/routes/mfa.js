// Block 10: MFA (TOTP) cho bản SPA. Mount ở /api/auth/mfa (routes/auth.js).
//
//   POST /api/auth/mfa                 { challenge, code }        bước 2 của đăng nhập -> accessToken + cookie rt
//   GET  /api/auth/mfa/status          Bearer                     trạng thái MFA, số mã khôi phục còn lại
//   POST /api/auth/mfa/setup           Bearer { password?, code? } secret mới chờ xác nhận -> QR + secret
//                                                                 (MFA đang bật = thay thiết bị: phải xác thực lại)
//   GET  /api/auth/mfa/setup           Bearer                     xem lại QR + secret đang chờ xác nhận
//   POST /api/auth/mfa/confirm         Bearer { code }            mã đúng -> bật MFA; mã khôi phục (MỘT lần) + token mới
//   POST /api/auth/mfa/cancel          Bearer                     bỏ secret đang chờ
//   POST /api/auth/mfa/recovery-codes  Bearer { password, code }  tạo lại mã khôi phục
//   POST /api/auth/mfa/disable         Bearer { password, code }  tắt MFA -> token mới
//
// Xác thực lại = password hiện tại + mã TOTP hoặc mã khôi phục, giới hạn số lần thử.
// Lỗi nhập: 200 + ok: false (INVALID_MFA_CODE, REAUTH_FAILED...). Lần chờ hết hạn / hết lượt: 401.
// Vượt giới hạn: 429. Bộ đếm dùng chung key với bản SSR: đổi sang bản kia không reset số lần thử.
// Bật, thay và tắt MFA đăng xuất mọi nơi khác (tokenVersion + 1, thu hồi refresh token, xóa session
// SSR) rồi cấp cặp token mới cho chính thiết bị vừa thao tác.
const express = require("express");
const prisma = require("../db/prisma");
const { ok, fail, validationFailed, unauthenticated, rateLimited } = require("../http/respond");
const { asyncHandler, asObject } = require("../utils/helpers");
const { POLICY } = require("../auth/config");
const throttle = require("../auth/throttle");
const { verifyPassword } = require("../auth/crypto");
const { requireAuth } = require("../auth/middleware");
const { raw } = require("../auth/accounts");
const mfa = require("../auth/mfa");
const { issueTokens } = require("../http/refresh-cookie");

const router = express.Router();

// Response có secret, QR, mã khôi phục hoặc token: browser / proxy không được lưu lại
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const loadUser = (id) => prisma.user.findUnique({ where: { id } });

async function ipLimited(req, res, name, rule, message) {
  const r = await throttle.hit(`${name}:ip:${req.ip}`, rule);
  if (r.allowed) return false;
  rateLimited(res, r.retryAfterSec, message);
  return true;
}

const CHALLENGE_EXPIRED = "Phiên xác thực hai bước đã hết hạn hoặc không còn hiệu lực. Hãy đăng nhập lại.";

// ───────────────────────── Bước 2 của đăng nhập ─────────────────────────

/*
 * Thứ tự: rate limit IP -> challenge còn hiệu lực -> giới hạn theo tài khoản -> giữ một lượt thử ->
 * kiểm tra mã (TOTP chống dùng lại, hoặc mã khôi phục) -> xóa challenge -> cấp token.
 * Challenge không có, hết hạn hay đã hết lượt đều trả cùng một 401.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (await ipLimited(req, res, "mfa", POLICY.rate.mfaIp, "Quá nhiều lần nhập mã từ địa chỉ này")) return;
    const body = asObject(req.body);
    const challenge = await mfa.findChallenge(body.challenge);
    if (!challenge) return unauthenticated(res, "MFA_CHALLENGE_EXPIRED", CHALLENGE_EXPIRED);
    if (typeof body.code !== "string" || !body.code.trim()) {
      return validationFailed(res, { code: "Vui lòng nhập mã xác thực." });
    }
    const user = challenge.user;

    // Giới hạn theo tài khoản (cộng dồn qua nhiều lần đăng nhập, cả hai bản): biết password vẫn không dò được mã
    const perUser = await throttle.hit(`mfa:user:${user.id}`, POLICY.mfa.userAttempts);
    if (!perUser.allowed) return rateLimited(res, perUser.retryAfterSec, "Nhập mã xác thực quá nhiều lần. Tạm khóa bước xác thực hai bước");

    // Giữ lượt thử trước khi kiểm tra mã: request song song không vượt quá số lượt
    const used = await mfa.takeAttempt(challenge);
    if (used === null) return unauthenticated(res, "MFA_CHALLENGE_EXPIRED", CHALLENGE_EXPIRED);

    const result = await mfa.verifyCode(user, body.code);
    if (!result.ok) {
      if (used >= POLICY.mfa.maxAttempts) {
        await mfa.endChallenge(challenge);
        return unauthenticated(res, "MFA_TOO_MANY_ATTEMPTS", "Bạn đã nhập sai mã xác thực quá nhiều lần. Hãy đăng nhập lại.");
      }
      const attemptsLeft = POLICY.mfa.maxAttempts - used;
      console.warn("[business] INVALID_MFA_CODE", req.method, req.originalUrl);
      return res.status(200).json({
        ok: false,
        error: {
          code: "INVALID_MFA_CODE",
          message: `Mã xác thực không đúng, đã hết hạn hoặc đã được dùng. Còn ${attemptsLeft} lần thử.`,
          attemptsLeft,
        },
      });
    }

    // Mã đúng: kết thúc lần chờ (chỉ một request xóa được), rồi mới cấp token
    if (!(await mfa.endChallenge(challenge))) return unauthenticated(res, "MFA_CHALLENGE_EXPIRED", CHALLENGE_EXPIRED);
    await throttle.clear(`mfa:user:${user.id}`);
    const tokens = await issueTokens(res, await loadUser(user.id));
    const recoveryRemaining = result.method === "recovery" ? await mfa.remainingRecoveryCodes(user.id) : undefined;
    ok(res, { ...tokens, method: result.method, recoveryRemaining });
  })
);

// ───────────────────────── Quản lý MFA (cần đăng nhập) ─────────────────────────

/*
 * Xác thực lại trước thao tác nhạy cảm: password hiện tại + mã MFA (TOTP hoặc mã khôi phục).
 * Đã gửi phản hồi lỗi thì trả về null; đúng thì trả về user.
 */
async function reauthenticate(req, res) {
  const key = `mfa-reauth:user:${req.user.id}`;
  const limit = await throttle.hit(key, POLICY.mfa.reauthAttempts);
  if (!limit.allowed) {
    rateLimited(res, limit.retryAfterSec, "Xác thực lại sai quá nhiều lần");
    return null;
  }
  const body = asObject(req.body);
  const user = await loadUser(req.user.id);
  // Password sai thì không kiểm tra mã (không tiêu thụ mã khôi phục)
  const passed = (await verifyPassword(user.passwordHash, raw(body.password))) && (await mfa.verifyCode(user, body.code)).ok;
  if (!passed) {
    fail(res, "REAUTH_FAILED", "Mật khẩu hoặc mã xác thực không đúng.");
    return null;
  }
  await throttle.clear(key);
  return user;
}

async function sendSetup(res, user, secret) {
  ok(res, { replacing: user.mfaEnabled, ...(await mfa.setupPayload(user.email, secret)) });
}

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.user.id);
    ok(res, {
      mfaEnabled: user.mfaEnabled,
      pending: Boolean(user.mfaPendingSecret),
      recoveryRemaining: user.mfaEnabled ? await mfa.remainingRecoveryCodes(user.id) : 0,
      policy: {
        maxAttempts: POLICY.mfa.maxAttempts,
        reauthAttempts: POLICY.mfa.reauthAttempts.limit,
        reauthWindowMin: Math.round(POLICY.mfa.reauthAttempts.windowMs / 60000),
      },
    });
  })
);

router.post(
  "/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    let user = await loadUser(req.user.id);
    // Thay MFA (thiết bị mới): phải xác thực lại bằng password + mã của secret đang dùng
    if (user.mfaEnabled) {
      user = await reauthenticate(req, res);
      if (!user) return;
    }
    const secret = await mfa.beginSetup(user.id);
    await sendSetup(res, user, secret);
  })
);

router.get(
  "/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req.user.id);
    const secret = mfa.pendingSecret(user);
    if (!secret) return fail(res, "NO_PENDING_SETUP", "Không có thiết lập MFA nào đang chờ xác nhận.");
    await sendSetup(res, user, secret);
  })
);

router.post(
  "/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = `mfa-setup:user:${req.user.id}`;
    const limit = await throttle.hit(key, POLICY.mfa.setupAttempts);
    if (!limit.allowed) return rateLimited(res, limit.retryAfterSec, "Nhập mã xác nhận sai quá nhiều lần");
    const user = await loadUser(req.user.id);
    if (!user.mfaPendingSecret) return fail(res, "NO_PENDING_SETUP", "Không có thiết lập MFA nào đang chờ xác nhận.");

    const codes = await mfa.confirmSetup(user, asObject(req.body).code);
    if (!codes) return fail(res, "INVALID_MFA_CODE", "Mã không đúng hoặc đã hết hạn. Nhập mã đang hiện trong ứng dụng.");
    await throttle.clear(key);
    // tokenVersion vừa tăng: cấp lại token cho thiết bị này, các nơi khác phải đăng nhập lại (qua MFA)
    const tokens = await issueTokens(res, await loadUser(user.id));
    ok(res, { mfaEnabled: true, replaced: user.mfaEnabled, recoveryCodes: codes, ...tokens });
  })
);

router.post(
  "/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    await mfa.cancelSetup(req.user.id);
    ok(res, { cancelled: true });
  })
);

router.post(
  "/recovery-codes",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.mfaEnabled) return fail(res, "MFA_NOT_ENABLED", "Tài khoản chưa bật xác thực hai bước.");
    const user = await reauthenticate(req, res);
    if (!user) return;
    ok(res, { recoveryCodes: await mfa.replaceRecoveryCodes(user.id) });
  })
);

router.post(
  "/disable",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.mfaEnabled) return fail(res, "MFA_NOT_ENABLED", "Tài khoản chưa bật xác thực hai bước.");
    const user = await reauthenticate(req, res);
    if (!user) return;
    await mfa.disable(user.id);
    const tokens = await issueTokens(res, await loadUser(user.id));
    ok(res, { mfaEnabled: false, ...tokens });
  })
);

module.exports = router;
