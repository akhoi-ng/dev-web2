// Bộ đếm ở server (bảng auth_throttles) cho rate limit và đăng nhập sai.
// Không đếm trong cookie hay localStorage: xóa cookie / mở tab ẩn danh không đặt lại được.
const prisma = require("../db/prisma");

const expired = (row, windowMs, now) => !row || row.windowStart.getTime() <= now.getTime() - windowMs;

/*
 * Tăng bộ đếm của key thêm 1 trong cửa sổ windowMs, trả về bản ghi sau khi tăng.
 * Tăng bằng upsert (INSERT ... ON CONFLICT DO UPDATE count = count + 1) nên hai request đồng thời
 * không ghi đè nhau. Cửa sổ đã hết thì bắt đầu lại từ 1; điều kiện windowStart cũ bảo đảm chỉ
 * một request đặt lại, request còn lại tăng tiếp trên cửa sổ mới.
 */
async function increment(key, windowMs, now = new Date()) {
  const row = await prisma.authThrottle.upsert({
    where: { key },
    create: { key, count: 1, windowStart: now },
    update: { count: { increment: 1 } },
  });
  if (row.count === 1 || !expired(row, windowMs, now)) return row;

  const reset = await prisma.authThrottle.updateMany({
    where: { key, windowStart: row.windowStart },
    data: { count: 1, windowStart: now, lockedUntil: null },
  });
  if (reset.count === 1) return { ...row, count: 1, windowStart: now, lockedUntil: null };
  return prisma.authThrottle.update({ where: { key }, data: { count: { increment: 1 } } });
}

/*
 * Rate limit: ghi nhận một lần gọi và cho biết có vượt giới hạn không.
 * -> { allowed, retryAfterSec }
 */
async function hit(key, { limit, windowMs }, now = new Date()) {
  const row = await increment(key, windowMs, now);
  const allowed = row.count <= limit;
  const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((row.windowStart.getTime() + windowMs - now.getTime()) / 1000));
  return { allowed, retryAfterSec, count: row.count };
}

// Đọc bộ đếm hiện tại (không tăng). Cửa sổ đã hết -> coi như 0.
async function peek(key, windowMs, now = new Date()) {
  const row = await prisma.authThrottle.findUnique({ where: { key } });
  const lockedUntil = row && row.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
  return { count: expired(row, windowMs, now) ? 0 : row.count, lockedUntil };
}

// Khóa tạm key tới thời điểm until
async function lock(key, until) {
  await prisma.authThrottle.update({ where: { key }, data: { lockedUntil: until } });
}

async function clear(key) {
  await prisma.authThrottle.deleteMany({ where: { key } });
}

const retryAfter = (until, now = new Date()) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));

module.exports = { increment, hit, peek, lock, clear, retryAfter };
