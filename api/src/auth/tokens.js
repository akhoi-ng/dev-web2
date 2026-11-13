// Access token (JWT) và refresh token.
//
// Access token: JWT ký HS256 bằng JWT_SECRET, sống 15 phút, gửi trong header Authorization.
//   Payload chỉ có sub (id user), ver (tokenVersion), jti, iat, exp, iss, aud. Không có role, email
//   hay bí mật nào: ai cầm token đều decode được payload. Role luôn đọc lại từ DB.
//
// Refresh token: 32 byte ngẫu nhiên, nằm trong cookie HttpOnly `rt` (JavaScript không đọc được),
//   DB lưu SHA-256. Dùng một lần: mỗi lần làm mới, token cũ bị đánh dấu usedAt và token mới cùng
//   familyId được cấp. Token đã dùng hoặc đã thu hồi bị gửi lại thì thu hồi cả family (có người
//   khác đang giữ bản sao).
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const prisma = require("../db/prisma");
const { POLICY, jwtSecret, accessTokenTtlSec } = require("./config");
const { randomToken, sha256 } = require("./crypto");

const AT = POLICY.accessToken;
const RT = POLICY.refreshToken;

// ─────────────────────────────── Access token ───────────────────────────────

function signAccessToken(user, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const ttlSec = accessTokenTtlSec();
  const token = jwt.sign(
    { ver: user.tokenVersion, iat },
    jwtSecret(),
    {
      algorithm: AT.algorithm,
      expiresIn: ttlSec,
      issuer: AT.issuer,
      audience: AT.audience,
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
    }
  );
  return { accessToken: token, expiresIn: ttlSec, tokenType: "Bearer" };
}

/*
 * Verify chữ ký và các claim. Không tra DB (middleware tra sau).
 * -> { ok: true, userId, ver } | { ok: false, code: "TOKEN_EXPIRED" | "UNAUTHENTICATED" }
 *  - algorithms cố định ["HS256"]: không theo alg do token tự khai, nên alg "none" hay đổi sang
 *    thuật toán khác đều bị từ chối (RFC 8725).
 *  - exp kiểm tra bởi thư viện (không có clockTolerance); iss và aud phải khớp.
 */
function verifyAccessToken(token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096 || token.split(".").length !== 3) {
    return { ok: false, code: "UNAUTHENTICATED" };
  }
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: [AT.algorithm],
      issuer: AT.issuer,
      audience: AT.audience,
      clockTimestamp: Math.floor(now / 1000),
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(payload.ver)) {
      return { ok: false, code: "UNAUTHENTICATED" };
    }
    return { ok: true, userId, ver: payload.ver, jti: payload.jti };
  } catch (err) {
    // Chỉ coi là hết hạn khi chữ ký đã đúng (jsonwebtoken kiểm tra chữ ký trước exp)
    if (err.name === "TokenExpiredError") return { ok: false, code: "TOKEN_EXPIRED" };
    return { ok: false, code: "UNAUTHENTICATED" };
  }
}

// "Bearer <token>" -> token; thiếu hoặc sai dạng -> null
function bearerToken(header) {
  if (typeof header !== "string") return null;
  const m = /^Bearer[ ]+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*)$/.exec(header.trim());
  return m ? m[1] : null;
}

// ─────────────────────────────── Refresh token ───────────────────────────────

// Đăng nhập thành công: mở family mới. -> { token, expiresAt }
async function issueRefreshToken(userId, now = new Date()) {
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + RT.ttlMs);
  await prisma.refreshToken.create({
    data: { userId, familyId: crypto.randomUUID(), tokenHash: sha256(token), expiresAt },
  });
  return { token, expiresAt };
}

async function revokeFamily(familyId, now = new Date(), tx = prisma) {
  await tx.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
}

async function revokeAllForUser(userId, now = new Date(), tx = prisma) {
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

/*
 * Đổi refresh token lấy cặp token mới.
 * -> { status: "ok", user, token, expiresAt }
 *  | { status: "invalid" }   không có / hết hạn / đã thu hồi / user không còn active
 *  | { status: "reused" }    token đã dùng bị gửi lại: đã thu hồi cả family
 *
 * Đánh dấu usedAt bằng UPDATE có điều kiện (usedAt IS NULL, revokedAt IS NULL, chưa hết hạn):
 * hai request cùng gửi một token thì chỉ một request thắng, request còn lại rơi vào nhánh reused.
 */
async function rotateRefreshToken(token, now = new Date()) {
  if (typeof token !== "string" || !token || token.length > 200) return { status: "invalid" };
  const tokenHash = sha256(token);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!row) return { status: "invalid" };

  if (row.usedAt || row.revokedAt) {
    // Token đã đổi rồi mà còn xuất hiện: một bản sao đang nằm ở nơi khác -> khóa cả family
    if (row.usedAt && !row.revokedAt) {
      await revokeFamily(row.familyId, now);
      console.warn(`[auth] refresh token bị dùng lại, thu hồi family của user ${row.userId}`);
      return { status: "reused" };
    }
    return { status: "invalid" };
  }
  if (row.expiresAt <= now || row.user.status !== "active") return { status: "invalid" };

  const next = randomToken(32);
  const rotated = await prisma.$transaction(async (tx) => {
    const used = await tx.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count !== 1) return false;
    await tx.refreshToken.create({
      data: { userId: row.userId, familyId: row.familyId, tokenHash: sha256(next), expiresAt: row.expiresAt },
    });
    return true;
  });
  if (!rotated) {
    await revokeFamily(row.familyId, now);
    return { status: "reused" };
  }
  return { status: "ok", user: row.user, token: next, expiresAt: row.expiresAt };
}

// Logout trên thiết bị này: thu hồi family của token trong cookie (không lỗi nếu token lạ)
async function revokeByToken(token, now = new Date()) {
  if (typeof token !== "string" || !token || token.length > 200) return;
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (row) await revokeFamily(row.familyId, now);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  bearerToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeByToken,
  revokeFamily,
  revokeAllForUser,
};
