// Tạo (hoặc cập nhật) một tài khoản đã kích hoạt để thử đăng nhập, quên mật khẩu và CRUD.
// Email và mật khẩu lấy từ biến môi trường SEED_USER_EMAIL, SEED_USER_PASSWORD (không commit).
// Chạy riêng: npm run db:seed-user   (không đụng tới thực đơn)
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/auth/crypto");
const { normalizeEmail, emailError, passwordError } = require("../src/auth/accounts");

async function seedUser(prisma) {
  const emailInput = (process.env.SEED_USER_EMAIL || "").trim();
  const password = process.env.SEED_USER_PASSWORD || "";
  const problem = emailError(emailInput) || passwordError(password);
  if (problem) {
    console.log(`Bỏ qua tài khoản seed (${problem}). Đặt SEED_USER_EMAIL và SEED_USER_PASSWORD trong .env.`);
    return null;
  }
  const email = normalizeEmail(emailInput);
  const data = {
    emailInput,
    passwordHash: await hashPassword(password),
    // Tài khoản quản trị của nhóm; Block 8 chưa phân quyền nên mọi tài khoản active đều dùng CRUD
    role: "admin",
    status: "active",
    emailVerifiedAt: new Date(),
  };
  const user = await prisma.user.upsert({ where: { email }, create: { email, ...data }, update: data });
  console.log(`Tài khoản seed: ${user.email} (active, role ${user.role}).`);
  return user;
}

module.exports = { seedUser };

if (require.main === module) {
  const prisma = new PrismaClient();
  seedUser(prisma)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
