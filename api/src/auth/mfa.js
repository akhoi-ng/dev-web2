// Block 10: MFA bằng TOTP (ứng dụng Authenticator) + mã khôi phục cho bản SPA.
//
// Cùng thuật toán và cùng dữ liệu với bản SSR (src/auth/mfa.js), vì hai bản chung bảng users:
// - TOTP: thư viện otplib (RFC 6238), không tự viết thuật toán. Secret base32 lưu trong DB đã mã
//   hóa AES-256-GCM bằng MFA_ENC_KEY (phải trùng khóa của bản SSR).
// - Chống dùng lại mã: users.mfaLastStep lưu bước 30 giây của mã đúng gần nhất. Câu UPDATE có điều
//   kiện "bước mới > bước cũ" nên hai request cùng gửi một mã thì chỉ một request qua.
// - Mã khôi phục: 10 mã ngẫu nhiên, hiện một lần; DB lưu HMAC (SESSION_SECRET); dùng xong ghi usedAt.
// Bật MFA ở bản nào thì đăng nhập ở cả hai bản đều phải qua bước nhập mã.
//
// Khác bản SSR ở trạng thái chờ MFA: SPA không có cookie phiên, nên mã challenge trả trong body JSON
// (deck Block 9, slide "MFA khi client là SPA"). DB chỉ lưu SHA-256 của challenge (bảng
// mfa_challenges). Challenge không phải access token: requireAuth chỉ nhận JWT nên gửi challenge tới
// route CRUD vẫn bị 401; chỉ POST /api/auth/mfa đọc nó.
const crypto = require("crypto");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const prisma = require("../db/prisma");
const { POLICY, mfaKey } = require("./config");
const { randomToken, sha256, hmac } = require("./crypto");
const { revokeAllForUser } = require("./tokens");

const totp = authenticator.clone({ window: POLICY.mfa.window });
const STEP_SECONDS = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// ─────────────────────────── mã hóa secret ───────────────────────────

const encKey = () => crypto.createHash("sha256").update(mfaKey()).digest();

// -> "v1.<iv>.<tag>.<ciphertext>" (base64url), cùng định dạng với bản SSR
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

function decryptSecret(stored) {
  const [version, iv, tag, data] = String(stored || "").split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // sai khóa hoặc dữ liệu bị sửa
  }
}

// ─────────────────────────────── TOTP ───────────────────────────────

const newSecret = () => totp.generateSecret(20); // 160 bit, base32

const isTotpFormat = (code) => /^\d{6}$/.test(code);
const cleanCode = (raw) => (typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/\s+/g, "") : "");

// Bước (30 giây) của mã nếu mã đúng với secret trong cửa sổ cho phép, ngược lại null
function matchStep(secret, code, now = Date.now()) {
  if (!secret || !isTotpFormat(code)) return null;
  const delta = totp.checkDelta(code, secret);
  if (delta === null || delta === undefined) return null;
  return Math.floor(now / 1000 / STEP_SECONDS) + delta;
}

// Ghi nhận bước đã dùng; false nếu mã của bước này (hoặc mới hơn) đã được dùng
async function claimStep(userId, step, db = prisma) {
  const r = await db.user.updateMany({
    where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return r.count === 1;
}

// Nội dung QR (otpauth://) và ảnh QR dạng data URL, vẽ ở server: secret không gửi ra dịch vụ ngoài
async function setupPayload(email, secret) {
  const otpauthUri = totp.keyuri(email, POLICY.mfa.issuer, secret);
  const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  return {
    otpauthUri,
    qr,
    secret: secret.match(/.{1,4}/g).join(" "),
    algorithm: "SHA1",
    digits: 6,
    period: STEP_SECONDS,
  };
}

// ─────────────────────────── mã khôi phục ───────────────────────────

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ I, O, 0, 1 cho dễ đọc
const normalizeRecovery = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Cùng công thức với bản SSR: mã tạo ở bản nào cũng dùng được ở bản kia
const recoveryHash = (userId, code) => hmac(`recovery:${userId}:${normalizeRecovery(code)}`);

// 10 ký tự ngẫu nhiên (50 bit), hiển thị dạng XXXXX-XXXXX
function newRecoveryCode() {
  let s = "";
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

// Thay toàn bộ mã khôi phục của user (mã cũ mất hiệu lực). Trả mã gốc để hiện MỘT lần.
async function replaceRecoveryCodes(userId, db = prisma) {
  const codes = Array.from({ length: POLICY.mfa.recoveryCodes }, newRecoveryCode);
  await db.recoveryCode.deleteMany({ where: { userId } });
  await db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: recoveryHash(userId, c) })) });
  return codes;
}

async function useRecoveryCode(userId, code, now = new Date()) {
  if (normalizeRecovery(code).length !== 10) return false;
  const r = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: recoveryHash(userId, code), usedAt: null },
    data: { usedAt: now },
  });
  return r.count === 1;
}

const remainingRecoveryCodes = (userId) => prisma.recoveryCode.count({ where: { userId, usedAt: null } });

/*
 * Kiểm tra mã MFA của user đã bật MFA: 6 chữ số -> TOTP (chống dùng lại), dạng khác -> mã khôi phục.
 * -> { ok: true, method: "totp" | "recovery" } | { ok: false }
 */
async function verifyCode(user, rawCode) {
  const code = cleanCode(rawCode);
  if (!user || !user.mfaEnabled || !code || code.length > 20) return { ok: false };
  if (isTotpFormat(code)) {
    const step = matchStep(decryptSecret(user.mfaSecret), code);
    if (step !== null && (await claimStep(user.id, step))) return { ok: true, method: "totp" };
    return { ok: false };
  }
  return (await useRecoveryCode(user.id, code)) ? { ok: true, method: "recovery" } : { ok: false };
}

// ─────────────────────────── bật / tắt MFA ───────────────────────────

// Tạo secret mới đang chờ xác nhận. MFA đang bật (thay thiết bị) thì secret cũ vẫn dùng tới khi
// secret mới được xác nhận đúng mã.
async function beginSetup(userId) {
  const secret = newSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaPendingSecret: encryptSecret(secret) } });
  return secret;
}

const pendingSecret = (user) => (user && user.mfaPendingSecret ? decryptSecret(user.mfaPendingSecret) : null);

/*
 * Đăng xuất mọi nơi trong cùng transaction với thay đổi MFA: tăng tokenVersion (JWT đã cấp bị từ
 * chối), thu hồi mọi refresh token, xóa mọi session của bản SSR và mọi lần chờ MFA. Route cấp lại
 * cặp token cho chính thiết bị vừa thao tác (đã chứng minh đủ hai yếu tố).
 */
async function signOutEverywhere(tx, userId, now) {
  await revokeAllForUser(userId, now, tx);
  await tx.session.deleteMany({ where: { userId } });
  await tx.mfaChallenge.deleteMany({ where: { userId } });
}

/*
 * Xác nhận mã của secret đang chờ -> bật MFA (hoặc thay secret), tạo mã khôi phục mới.
 * -> mảng mã khôi phục | null (mã sai / secret đã đổi giữa chừng)
 */
async function confirmSetup(user, rawCode, now = new Date()) {
  const stored = user.mfaPendingSecret;
  const step = matchStep(pendingSecret(user), cleanCode(rawCode));
  if (step === null) return null;
  return prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: user.id, mfaPendingSecret: stored },
      data: {
        mfaEnabled: true,
        mfaSecret: stored,
        mfaPendingSecret: null,
        mfaLastStep: step,
        tokenVersion: { increment: 1 },
      },
    });
    if (r.count !== 1) return null;
    await signOutEverywhere(tx, user.id, now);
    return replaceRecoveryCodes(user.id, tx);
  });
}

async function cancelSetup(userId) {
  await prisma.user.update({ where: { id: userId }, data: { mfaPendingSecret: null } });
}

// Tắt MFA: xóa secret, mã khôi phục; đăng xuất mọi nơi
async function disable(userId, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastStep: null, tokenVersion: { increment: 1 } },
    });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await signOutEverywhere(tx, userId, now);
  });
}

// ───────────────────────── trạng thái chờ MFA ─────────────────────────

// Password đúng + tài khoản bật MFA: tạo trạng thái chờ, chưa cấp token. -> { challenge, expiresIn }
async function startChallenge(userId, now = new Date()) {
  const token = randomToken(32);
  // Mỗi tài khoản chỉ có một lần chờ (chung với bản SSR): đăng nhập lại thì lần chờ cũ mất hiệu lực
  await prisma.mfaChallenge.deleteMany({ where: { userId } });
  await prisma.mfaChallenge.create({
    data: {
      tokenHash: sha256(token),
      userId,
      next: null,
      expiresAt: new Date(now.getTime() + POLICY.mfa.challengeTtlMs),
    },
  });
  return { challenge: token, expiresIn: Math.floor(POLICY.mfa.challengeTtlMs / 1000) };
}

// Lần chờ còn hiệu lực (kèm user), hoặc null
async function findChallenge(token, now = new Date()) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const ch = await prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!ch || ch.expiresAt <= now || ch.attempts >= POLICY.mfa.maxAttempts) return null;
  if (ch.user.status !== "active" || !ch.user.mfaEnabled) return null;
  return ch;
}

// Giữ một lượt thử TRƯỚC khi kiểm tra mã (request song song không vượt được số lượt).
// -> số lượt đã dùng sau lần này, hoặc null nếu hết lượt / hết hạn
async function takeAttempt(challenge, now = new Date()) {
  const r = await prisma.mfaChallenge.updateMany({
    where: { id: challenge.id, attempts: { lt: POLICY.mfa.maxAttempts }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } },
  });
  return r.count === 1 ? challenge.attempts + 1 : null;
}

// Kết thúc lần chờ (thành công hoặc hết lượt). true nếu request này là request xóa được.
async function endChallenge(challenge) {
  const r = await prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
  return r.count === 1;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  newSecret,
  matchStep,
  claimStep,
  setupPayload,
  newRecoveryCode,
  normalizeRecovery,
  replaceRecoveryCodes,
  remainingRecoveryCodes,
  verifyCode,
  beginSetup,
  pendingSecret,
  confirmSetup,
  cancelSetup,
  disable,
  startChallenge,
  findChallenge,
  takeAttempt,
  endChallenge,
  totp,
};
