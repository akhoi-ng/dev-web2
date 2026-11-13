// Dọn bản ghi hết hạn: chạy định kỳ trong server (mỗi 30 phút) và bằng `npm run db:cleanup`.
// Refresh token hết hạn / đã thu hồi đã bị rotateRefreshToken từ chối; dọn chỉ để bảng không phình ra.
// Giữ token đã thu hồi thêm 1 ngày để còn phát hiện được việc dùng lại token cũ.
const prisma = require("../db/prisma");

const DAY = 24 * 60 * 60 * 1000;

async function cleanupExpired(now = new Date()) {
  const dayAgo = new Date(now.getTime() - DAY);
  const [refreshTokens, throttles] = await Promise.all([
    prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { lte: dayAgo } }] },
    }),
    prisma.authThrottle.deleteMany({
      where: { windowStart: { lte: dayAgo }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    }),
  ]);
  return { refreshTokens: refreshTokens.count, throttles: throttles.count };
}

module.exports = { cleanupExpired };

if (require.main === module) {
  require("dotenv").config();
  cleanupExpired()
    .then((r) => console.log("Đã dọn:", r))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
