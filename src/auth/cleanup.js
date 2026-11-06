// Dọn bản ghi hết hạn: chạy định kỳ trong server (mỗi 30 phút) và bằng `npm run db:cleanup`.
// Session hết hạn đã bị loadSession coi là vô hiệu; dọn chỉ để bảng không phình ra.
const prisma = require("../db/prisma");

const DAY = 24 * 60 * 60 * 1000;

async function cleanupExpired(now = new Date()) {
  const dayAgo = new Date(now.getTime() - DAY);
  const [sessions, throttles] = await Promise.all([
    prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }] },
    }),
    prisma.authThrottle.deleteMany({
      where: { windowStart: { lte: dayAgo }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    }),
  ]);
  return { sessions: sessions.count, throttles: throttles.count };
}

module.exports = { cleanupExpired };

// Chạy trực tiếp: node src/auth/cleanup.js
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
