// Nghiệp vụ tài khoản: đăng ký + OTP kích hoạt, đăng nhập có chống brute force, quên / đặt lại
// mật khẩu. Không biết gì về HTTP: route đọc form, gọi hàm ở đây, rồi chọn trang để render.
const prisma = require("../db/prisma");
const { POLICY, appUrl } = require("./config");
const throttle = require("./throttle");
const { hashPassword, verifyPassword, verifyAgainstDummy, randomToken, generateOtp, sha256, hmac, safeEqual } = require("./crypto");
const { queueMail } = require("./mailer");
const { activationEmail, resetEmail, passwordChangedEmail } = require("./mail-templates");
const { destroyAllSessions } = require("./session");

const minutes = (ms) => Math.round(ms / 60000);
const otpHashFor = (userId, otp) => hmac(`otp:${userId}:${otp}`);

// Khóa của các bộ đếm (bảng auth_throttles)
const KEYS = {
  loginFail: (email) => `login-fail:email:${email}`,
  activateFail: (email) => `activate-fail:email:${email}`,
  resendCooldown: (email) => `resend-cooldown:email:${email}`,
  resendHour: (email) => `resend-hour:email:${email}`,
};

// ─────────────────────────── Đăng ký và kích hoạt ───────────────────────────

/*
 * Gửi (lại) OTP cho email, áp thời gian chờ 60 giây và tối đa 5 lần/giờ theo email.
 * Bộ đếm theo chuỗi email nên email chưa đăng ký cũng bị giới hạn y hệt (không lộ tài khoản).
 * Chỉ khi email thuộc tài khoản pending mới sinh mã mới: ghi đè otpHash (mã cũ mất hiệu lực),
 * attempts và lockedUntil giữ nguyên. -> { ok: true } | { ok: false, retryAfterSec }
 */
async function sendActivationCode(email, now = new Date()) {
  const cooldown = await throttle.hit(KEYS.resendCooldown(email), { limit: 1, windowMs: POLICY.otp.resendCooldownMs }, now);
  if (!cooldown.allowed) return { ok: false, retryAfterSec: cooldown.retryAfterSec };
  const hourly = await throttle.hit(KEYS.resendHour(email), { limit: POLICY.otp.maxSendsPerHour, windowMs: 60 * 60 * 1000 }, now);
  if (!hourly.allowed) return { ok: false, retryAfterSec: hourly.retryAfterSec };

  const user = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  if (!user || user.status !== "pending") return { ok: true };

  const otp = generateOtp(POLICY.otp.digits);
  const data = {
    otpHash: otpHashFor(user.id, otp),
    expiresAt: new Date(now.getTime() + POLICY.otp.ttlMs),
    lastSentAt: now,
    usedAt: null,
  };
  await prisma.activationChallenge.upsert({
    where: { userId: user.id },
    create: { userId: user.id, purpose: "activation", ...data },
    update: data,
  });
  queueMail({ to: user.email, kind: "activation", ...activationEmail(otp, minutes(POLICY.otp.ttlMs)) });
  return { ok: true };
}

/*
 * Đăng ký (dữ liệu đã validate, CAPTCHA đã qua). Phản hồi cho browser giống nhau trong mọi nhánh:
 *  - email mới: tạo user pending, role viewer (server gán), gửi OTP
 *  - email đã có tài khoản pending: KHÔNG ghi đè password; coi như yêu cầu gửi lại mã
 *  - email đã có tài khoản active: không làm gì
 * Password luôn được băm trước khi tra email để ba nhánh tốn thời gian như nhau.
 */
async function register({ email, emailInput, password }, now = new Date()) {
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === "pending") await sendActivationCode(email, now);
    return;
  }
  try {
    await prisma.user.create({
      data: { email, emailInput, passwordHash, role: "viewer", status: "pending" },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err; // hai request đăng ký cùng email: request sau coi như email đã có
    return;
  }
  await sendActivationCode(email, now);
}

/*
 * Xác nhận OTP. Thứ tự: giới hạn thử -> điều kiện mã -> so hash -> đổi trạng thái (một transaction).
 * -> { status: "activated" | "invalid" | "locked", retryAfterSec? }
 * Mọi lý do sai (không có tài khoản pending, sai mã, hết hạn, đã dùng) đều là "invalid".
 */
async function activate(email, otp, now = new Date()) {
  const { maxAttempts, lockMs } = POLICY.otp;
  const user = email ? await prisma.user.findUnique({ where: { email }, include: { activation: true } }) : null;
  const challenge = user && user.status === "pending" ? user.activation : null;

  // Email không có tài khoản pending: vẫn đếm sai theo email để 429 xuất hiện giống tài khoản thật
  if (!challenge) {
    const t = await throttle.hit(KEYS.activateFail(email), { limit: maxAttempts, windowMs: lockMs }, now);
    return t.count > maxAttempts ? { status: "locked", retryAfterSec: t.retryAfterSec } : { status: "invalid" };
  }

  if (challenge.lockedUntil && challenge.lockedUntil > now) {
    return { status: "locked", retryAfterSec: throttle.retryAfter(challenge.lockedUntil, now) };
  }
  // Hết thời gian khóa: mở lượt thử mới (gửi lại mã thì không mở lượt thử mới)
  if (challenge.lockedUntil && challenge.attempts >= maxAttempts) {
    await prisma.activationChallenge.updateMany({
      where: { id: challenge.id, lockedUntil: challenge.lockedUntil },
      data: { attempts: 0, lockedUntil: null },
    });
  }

  const codeOk = typeof otp === "string" && /^\d+$/.test(otp) && safeEqual(otpHashFor(user.id, otp), challenge.otpHash);
  if (codeOk) {
    // Đổi trạng thái trong một transaction: chỉ UPDATE có điều kiện (chưa dùng, chưa hết hạn,
    // đúng mục đích, còn lượt thử, hash khớp) thành công mới kích hoạt. Hai request cùng gửi một
    // mã đúng: chỉ một request thắng, request còn lại nhận "invalid".
    const activated = await prisma.$transaction(async (tx) => {
      const used = await tx.activationChallenge.updateMany({
        where: {
          id: challenge.id,
          purpose: "activation",
          otpHash: challenge.otpHash,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: maxAttempts },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: { usedAt: now },
      });
      if (used.count !== 1) return false;
      const changed = await tx.user.updateMany({
        where: { id: user.id, status: "pending" },
        data: { status: "active", emailVerifiedAt: now },
      });
      if (changed.count !== 1) throw new Error("ROLLBACK");
      return true;
    }).catch((err) => {
      if (err.message === "ROLLBACK") return false;
      throw err;
    });
    if (activated) return { status: "activated" };
  }

  // Sai (hoặc mã đúng nhưng đã dùng / hết hạn): tăng attempts, đủ giới hạn thì khóa tạm
  const updated = await prisma.activationChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });
  if (updated.attempts >= maxAttempts && !(updated.lockedUntil && updated.lockedUntil > now)) {
    await prisma.activationChallenge.update({
      where: { id: challenge.id },
      data: { lockedUntil: new Date(now.getTime() + lockMs) },
    });
  }
  return { status: "invalid" };
}

// ─────────────────────────────── Đăng nhập ───────────────────────────────

// Trạng thái chống brute force của một email: { count, lockedUntil, captchaRequired }
async function loginState(email, now = new Date()) {
  const s = await throttle.peek(KEYS.loginFail(email), POLICY.login.windowMs, now);
  return { ...s, captchaRequired: s.count >= POLICY.login.captchaAfter };
}

// Ghi một lần đăng nhập sai; đủ ngưỡng thì khóa tạm. Email chưa có tài khoản cũng đếm như thường.
async function recordLoginFailure(email, now = new Date()) {
  const { windowMs, lockAfter, lockMs } = POLICY.login;
  const row = await throttle.increment(KEYS.loginFail(email), windowMs, now);
  if (row.count >= lockAfter) await throttle.lock(KEYS.loginFail(email), new Date(now.getTime() + lockMs));
  return row.count;
}

/*
 * Kiểm tra password (giới hạn và CAPTCHA đã được route kiểm tra trước).
 * -> { status: "ok", user } | { status: "invalid" } | { status: "pending" }
 * Email không tồn tại vẫn chạy một lần verify Argon2 với hash giả.
 */
async function checkCredentials(email, password, now = new Date()) {
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const ok = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
  if (!ok) {
    await recordLoginFailure(email, now);
    return { status: "invalid" };
  }
  // Password đúng nhưng chưa kích hoạt: không cấp session, không xóa bộ đếm sai
  if (user.status !== "active") return { status: "pending" };
  // Chỉ đăng nhập thành công mới xóa bộ đếm sai theo email (giới hạn IP giữ nguyên)
  await throttle.clear(KEYS.loginFail(email));
  return { status: "ok", user };
}

// ──────────────────────────── Quên / đặt lại mật khẩu ────────────────────────────

/*
 * Yêu cầu đặt lại mật khẩu. Email có tài khoản: hủy các token chưa dùng, tạo token mới, gửi link.
 * Không có: không làm gì. Route trả cùng một trang cho cả hai nhánh.
 */
async function requestPasswordReset(email, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = randomToken(32);
  await prisma.$transaction([
    // Yêu cầu mới làm các token chưa dùng trước đó hết hiệu lực
    prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + POLICY.reset.ttlMs) },
    }),
  ]);
  // Link dựng từ APP_URL trong cấu hình, không từ header Host của request
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
  queueMail({ to: user.email, kind: "reset", ...resetEmail(link, minutes(POLICY.reset.ttlMs)) });
}

// Token còn dùng được không (GET /reset chỉ đọc, không tiêu thụ)
async function findUsableResetToken(token, now = new Date()) {
  if (typeof token !== "string" || !token) return null;
  return prisma.passwordReset.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: now } },
  });
}

/*
 * Đặt mật khẩu mới bằng reset token (POST /reset). Trong một transaction:
 * tiêu thụ token (UPDATE có điều kiện chưa dùng + chưa hết hạn), đổi passwordHash, vô hiệu các
 * token còn lại của user, hủy mọi session của user. -> true | false (token không dùng được)
 * Không kích hoạt tài khoản pending, không tự đăng nhập.
 */
async function resetPassword(token, password, now = new Date()) {
  if (typeof token !== "string" || !token) return false;
  const tokenHash = sha256(token);
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const used = await tx.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count !== 1) return null;
    const row = await tx.passwordReset.findUnique({ where: { tokenHash }, include: { user: true } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordReset.updateMany({
      where: { userId: row.userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await destroyAllSessions(row.userId, tx);
    return row.user;
  });
  if (!user) return false;

  queueMail({ to: user.email, kind: "password-changed", ...passwordChangedEmail() });
  return true;
}

module.exports = {
  KEYS,
  register,
  sendActivationCode,
  activate,
  loginState,
  recordLoginFailure,
  checkCredentials,
  requestPasswordReset,
  findUsableResetToken,
  resetPassword,
};
